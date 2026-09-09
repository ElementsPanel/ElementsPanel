<script setup lang="ts">
import { t } from "@/lang/i18n";
import type { FrontendFileManagerService } from "@/plugin";
import { usePluginService } from "@/plugin/context";
import {
    createAsyncTask,
    queryAsyncTask
} from "@/services/apis/instance";
import { message } from "ant-design-vue";
import { Modal } from "@/tools/vuetifyModal";
import { computed, h, onUnmounted, ref } from "vue";
import AppDialog from "@/components/AppDialog.vue";
import {
    VBtn,
    VIcon,
    VList,
    VListItem,
    VListItemSubtitle,
    VListItemTitle,
    VProgressCircular
} from "vuetify/components";
import { deleteBackup, getBackupList, restoreBackup } from "../api";

const props = defineProps<{
    instanceUuid: string;
    daemonId: string;
}>();

const emit = defineEmits<{
    (e: "close"): void;
}>();

const visible = ref(false);
const loading = ref(false);
const taskId = ref<string | null>(null);
const taskStatus = ref<number>(0);
const backupList = ref<{ name: string; size: number; time: string }[]>([]);
const listLoading = ref(false);
const fileEditorDialog = ref<any>();

/**
 * The file API belongs to `plugins/file`. A backup that edits an
 * instance file needs it; without the plugin the edit path is unavailable
 * rather than broken.
 */
const fileApi = () => {
    const service = usePluginService<FrontendFileManagerService>("file");
    if (!service) throw new Error("file plugin is not installed");
    return service.api as {
        fileContent: () => { execute: (config?: any) => Promise<any> };
        touchFile: () => { execute: (config?: any) => Promise<any> };
    };
};


/**
 * The file editor belongs to `plugins/file`. Resolved through a
 * `computed` so the dialog appears and disappears with the plugin; without it
 * the button that opens it simply has nothing to open.
 */
const fileEditorComponent = computed(
  () => usePluginService<FrontendFileManagerService>("file")?.FileEditor
);

let timer: any = null;

const fetchBackupList = async () => {
    listLoading.value = true;
    try {
        const { execute: queryTask } = queryAsyncTask();
        const taskRes = await queryTask({
            params: {
                daemonId: props.daemonId,
                uuid: props.instanceUuid,
                task_name: "instance_backup"
            },
            data: {
                taskId: ""
            }
        });

        let currentTask = null;
        if (Array.isArray(taskRes.value)) {
            currentTask = taskRes.value.find((t: any) => t.detail?.instanceUuid === props.instanceUuid);
        } else if (taskRes.value && taskRes.value.detail?.instanceUuid === props.instanceUuid) {
            currentTask = taskRes.value;
        }

        if (currentTask) {
            taskStatus.value = currentTask.status;
            if (taskStatus.value === 1) {
                taskId.value = currentTask.taskId;
                startQuery();
            }
        } else {
            taskStatus.value = 0;
        }

        const { execute } = getBackupList();
        const res = await execute({
            params: {
                daemonId: props.daemonId,
                uuid: props.instanceUuid
            }
        });
        if (res.value) {
            backupList.value = res.value;
        }
    } catch (error: any) {
        message.error(error.message || t("TXT_CODE_INSTANCE_BACKUP_FAILED_FETCH"));
    } finally {
        listLoading.value = false;
    }
};

const startBackup = async () => {
    if (taskStatus.value === 1 || loading.value) return;
    Modal.confirm({
        title: t("TXT_CODE_INSTANCE_BACKUP_CREATE"),
        content: t("TXT_CODE_INSTANCE_BACKUP_CREATE_CONFIRM"),
        onOk: async () => {
            if (taskStatus.value === 1 || loading.value) return;
            loading.value = true;
            try {
                const { execute } = createAsyncTask();
                const res = await execute({
                    params: {
                        daemonId: props.daemonId,
                        uuid: props.instanceUuid,
                        task_name: "instance_backup"
                    },
                    data: {
                        time: new Date().getTime(),
                        newInstanceName: ""
                    }
                });
                if (res.value) {
                    taskId.value = res.value.taskId;
                    message.success(t("TXT_CODE_INSTANCE_BACKUP_STARTED"));
                    startQuery();
                }
            } catch (error: any) {
                message.error(error.message || t("TXT_CODE_INSTANCE_BACKUP_FAILED_START"));
            } finally {
                loading.value = false;
            }
        }
    });
};

const startQuery = () => {
    if (timer) clearInterval(timer);
    timer = setInterval(async () => {
        if (!taskId.value) return;
        try {
            const { execute } = queryAsyncTask();
            const res = await execute({
                params: {
                    daemonId: props.daemonId,
                    uuid: props.instanceUuid,
                    task_name: "instance_backup"
                },
                data: {
                    taskId: taskId.value
                }
            });
            if (res.value) {
                taskStatus.value = res.value.status;
                if (taskStatus.value !== 1) {
                    clearInterval(timer);
                    timer = null;
                    fetchBackupList();
                    if (taskStatus.value === 0) {
                        message.success(t("TXT_CODE_INSTANCE_BACKUP_COMPLETED"));
                    }
                }
            }
        } catch (error) {
            clearInterval(timer);
            timer = null;
        }
    }, 2000);
};

const handleDelete = (backupName: string) => {
    Modal.confirm({
        title: t("TXT_CODE_71155575"),
        icon: () => h(VIcon, { icon: "mdi-alert-circle-outline", color: "error" }),
        content: t("TXT_CODE_INSTANCE_BACKUP_DELETE_CONFIRM", { name: backupName }),
        okButtonProps: { danger: true },
        onOk: async () => {
            try {
                const { execute } = deleteBackup();
                await execute({
                    params: {
                        daemonId: props.daemonId,
                        uuid: props.instanceUuid,
                        backupName
                    }
                });
                message.success(t("TXT_CODE_28190dbc"));
                fetchBackupList();
            } catch (error: any) {
                message.error(error.message || t("TXT_CODE_INSTANCE_BACKUP_FAILED_DELETE"));
            }
        }
    });
};

const handleRestore = (backupName: string) => {
    Modal.confirm({
        title: t("TXT_CODE_INSTANCE_BACKUP_RESTORE"),
        icon: () => h(VIcon, { icon: "mdi-backup-restore" }),
        content: t("TXT_CODE_INSTANCE_BACKUP_RESTORE_CONFIRM", { name: backupName }),
        onOk: async () => {
            try {
                const { execute } = restoreBackup();
                await execute({
                    params: {
                        daemonId: props.daemonId,
                        uuid: props.instanceUuid,
                        backupName
                    }
                });
                message.success(t("TXT_CODE_INSTANCE_BACKUP_RESTORE_STARTED"));
            } catch (error: any) {
                message.error(error.message || t("TXT_CODE_INSTANCE_BACKUP_FAILED_RESTORE"));
            }
        }
    });
};

const handleEditEpbaklst = async () => {
    const filePath = ".epbaklst";
    const fileName = ".epbaklst";
    try {
        const { execute: readFile } = fileApi().fileContent();
        const res = await readFile({
            params: {
                daemonId: props.daemonId,
                uuid: props.instanceUuid
            },
            data: {
                target: filePath
            }
        });
        fileEditorDialog.value?.openDialog(filePath, fileName);
    } catch {
        Modal.confirm({
            title: t("TXT_CODE_INSTANCE_BACKUP_EDIT_EPBAKLST"),
            content: t("TXT_CODE_INSTANCE_BACKUP_EPBAKLST_CREATE_CONFIRM"),
            onOk: async () => {
                try {
                    const { execute: createFile } = fileApi().touchFile();
                    await createFile({
                        params: {
                            daemonId: props.daemonId,
                            uuid: props.instanceUuid
                        },
                        data: {
                            target: filePath
                        }
                    });
                    const { execute: writeFile } = fileApi().fileContent();
                    await writeFile({
                        params: {
                            daemonId: props.daemonId,
                            uuid: props.instanceUuid
                        },
                        data: {
                            target: filePath,
                            text: "$black\n\n# $black = 榛戝悕鍗曞尮閰嶏紱$white = 鐧藉悕鍗曞尮閰峔n# 璇ユ枃浠朵娇鐢?.gitignore 璇硶\n# ---\n# $black = blacklist matching; $white = whitelist matching\n# This file uses .gitignore syntax\n"
                        }
                    });
                    message.success(t("TXT_CODE_INSTANCE_BACKUP_EPBAKLST_CREATED"));
                    fileEditorDialog.value?.openDialog(filePath, fileName);
                } catch (error: any) {
                    message.error(error.message);
                }
            }
        });
    }
};

const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const open = () => {
    visible.value = true;
    fetchBackupList();
};

const close = () => {
    visible.value = false;
};

const afterClose = () => {
    if (timer) clearInterval(timer);
    timer = null;
    emit("close");
};

onUnmounted(() => {
    if (timer) clearInterval(timer);
});

defineExpose({ open });
</script>

<template>
    <AppDialog
        v-model:open="visible"
        :title="t('TXT_CODE_INSTANCE_BACKUP')"
        :max-width="800"
        :footer="null"
        @after-close="afterClose"
    >
        <div class="instance-backup-container">
            <div class="backup-list-area">
                <div class="list-header">
                    <VBtn
                        class="refresh-btn"
                        icon="mdi-refresh"
                        variant="text"
                        :loading="listLoading"
                        @click="fetchBackupList"
                    />
                </div>
                <div v-if="listLoading && backupList.length === 0" class="backup-loading">
                    <VProgressCircular indeterminate color="primary" size="32" width="3" />
                </div>
                <VList v-else-if="backupList.length > 0" class="backup-list">
                    <VListItem v-for="item in backupList" :key="item.name" class="backup-item" rounded="xl">
                        <template #prepend>
                            <VIcon icon="mdi-cloud-check-outline" class="backup-item-icon" />
                        </template>
                        <VListItemTitle class="backup-name">{{ item.name }}</VListItemTitle>
                        <VListItemSubtitle>
                            {{ formatSize(item.size) }} 路 {{ item.time }}
                        </VListItemSubtitle>
                        <template #append>
                            <div class="backup-item-actions">
                                <VBtn
                                    variant="text"
                                    prepend-icon="mdi-backup-restore"
                                    @click="handleRestore(item.name)"
                                >
                                    {{ t("TXT_CODE_INSTANCE_BACKUP_RESTORE") }}
                                </VBtn>
                                <VBtn
                                    color="error"
                                    variant="text"
                                    prepend-icon="mdi-delete-outline"
                                    @click="handleDelete(item.name)"
                                >
                                    {{ t("TXT_CODE_INSTANCE_BACKUP_DELETE") }}
                                </VBtn>
                            </div>
                        </template>
                    </VListItem>
                </VList>
                <div v-else class="empty-backup">
                    <VIcon icon="mdi-cloud-outline" class="empty-icon" />
                    <p>{{ t("TXT_CODE_INSTANCE_BACKUP_INTRO") }}</p>
                </div>
            </div>
            <div class="backup-footer">
                <VBtn variant="text" @click="close">
                    {{ t("TXT_CODE_b1dedda3") }}
                </VBtn>
                <VBtn variant="text" @click="handleEditEpbaklst">
                    {{ t("TXT_CODE_INSTANCE_BACKUP_EDIT_EPBAKLST") }}
                </VBtn>
                <VBtn
                    color="primary"
                    :loading="loading"
                    :disabled="taskStatus === 1"
                    @click="startBackup"
                >
                    {{ t("TXT_CODE_INSTANCE_BACKUP_CREATE") }}
                </VBtn>
            </div>
        </div>
    </AppDialog>

    <component :is="fileEditorComponent" v-if="fileEditorComponent && daemonId && instanceUuid" ref="fileEditorDialog" :daemon-id="daemonId"
        :instance-id="instanceUuid" />
</template>

<style scoped lang="scss">
.instance-backup-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.list-header {
    display: flex;
    align-items: center;
    min-height: 40px;
    margin-bottom: 4px;

    .refresh-btn {
        margin-left: auto;
    }
}

.backup-list {
    max-height: 400px;
    overflow-y: auto;
    padding: 0;
    background: transparent;
}

.backup-item {
    min-height: 72px;
    margin-bottom: 8px;
    border-radius: 16px;
    overflow: hidden;
    background: rgba(var(--v-theme-on-surface), 0.035);

    .backup-name {
        color: var(--text-color);
        font-weight: 600;
    }
}

.backup-item-icon {
    margin-right: 14px;
    color: var(--color-gray-8);
}

.backup-item-actions {
    display: flex;
    align-items: center;
    gap: 4px;
}

.backup-loading {
    display: flex;
    min-height: 220px;
    align-items: center;
    justify-content: center;
}

.empty-backup {
    text-align: center;
    padding: 40px 20px;

    .empty-icon {
        font-size: 64px;
        color: var(--color-gray-5);
        margin-bottom: 16px;
    }

    p {
        color: var(--color-gray-7);
    }
}

.backup-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: 16px;
    gap: 8px;
}

@media (max-width: 720px) {
    .backup-item :deep(.v-list-item__append) {
        align-self: stretch;
        margin-inline-start: 0;
        padding-top: 8px;
    }

    .backup-item-actions {
        justify-content: flex-end;
        flex-wrap: wrap;
    }

    .backup-footer {
        flex-wrap: wrap;
    }
}
</style>
