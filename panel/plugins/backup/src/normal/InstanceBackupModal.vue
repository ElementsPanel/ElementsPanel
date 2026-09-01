<script setup lang="ts">
import { t } from "@/lang/i18n";
import type { FrontendFileManagerService } from "@/plugin";
import { usePluginService } from "@/plugin/context";
import {
    createAsyncTask,
    queryAsyncTask
} from "@/services/apis/instance";
import {
    CloudDownloadOutlined,
    DeleteOutlined,
    EditOutlined,
    ExclamationCircleOutlined,
    PlusCircleOutlined,
    RollbackOutlined,
    SyncOutlined
} from "@ant-design/icons-vue";
import { message, Modal } from "ant-design-vue";
import { computed, h, onUnmounted, ref } from "vue";
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
 * The file API belongs to `plugins/filemanager`. A backup that edits an
 * instance file needs it; without the plugin the edit path is unavailable
 * rather than broken.
 */
const fileApi = () => {
    const service = usePluginService<FrontendFileManagerService>("filemanager");
    if (!service) throw new Error("filemanager plugin is not installed");
    return service.api as {
        fileContent: () => { execute: (config?: any) => Promise<any> };
        touchFile: () => { execute: (config?: any) => Promise<any> };
    };
};


/**
 * The file editor belongs to `plugins/filemanager`. Resolved through a
 * `computed` so the dialog appears and disappears with the plugin; without it
 * the button that opens it simply has nothing to open.
 */
const fileEditorComponent = computed(
  () => usePluginService<FrontendFileManagerService>("filemanager")?.FileEditor
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
        icon: () => h(ExclamationCircleOutlined),
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
        icon: () => h(ExclamationCircleOutlined),
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
        icon: () => h(ExclamationCircleOutlined),
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
            icon: () => h(ExclamationCircleOutlined),
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
                            text: "$black\n\n# $black = 黑名单匹配；$white = 白名单匹配\n# 该文件使用 .gitignore 语法\n# ---\n# $black = blacklist matching; $white = whitelist matching\n# This file uses .gitignore syntax\n"
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
    if (timer) clearInterval(timer);
    emit("close");
};

onUnmounted(() => {
    if (timer) clearInterval(timer);
});

defineExpose({ open });
</script>

<template>
    <a-modal v-model:open="visible" :title="t('TXT_CODE_INSTANCE_BACKUP')" width="800px" :footer="null" @cancel="close">
        <div class="instance-backup-container">
            <div class="backup-list-area">
                <div class="list-header">
                    <a-button type="text" :loading="listLoading" @click="fetchBackupList" class="refresh-btn">
                        <template #icon>
                            <SyncOutlined />
                        </template>
                    </a-button>
                </div>
                <a-spin :spinning="listLoading">
                    <div v-if="backupList.length > 0" class="backup-list">
                        <a-list :data-source="backupList" :split="false">
                            <template #renderItem="{ item }">
                                <a-list-item class="backup-item">
                                    <a-list-item-meta>
                                        <template #title>
                                            <span class="backup-name">{{ item.name }}</span>
                                        </template>
                                        <template #description>
                                            <span>{{ formatSize(item.size) }} | {{ item.time }}</span>
                                        </template>
                                    </a-list-item-meta>
                                    <template #actions>
                                        <a-button type="link" @click="handleRestore(item.name)">
                                            <RollbackOutlined /> {{ t("TXT_CODE_INSTANCE_BACKUP_RESTORE") }}
                                        </a-button>
                                        <a-button type="link" danger @click="handleDelete(item.name)">
                                            <DeleteOutlined /> {{ t("TXT_CODE_INSTANCE_BACKUP_DELETE") }}
                                        </a-button>
                                    </template>
                                </a-list-item>
                            </template>
                        </a-list>
                    </div>
                    <div v-else class="empty-backup">
                        <CloudDownloadOutlined class="empty-icon" />
                        <p>{{ t("TXT_CODE_INSTANCE_BACKUP_INTRO") }}</p>
                    </div>
                </a-spin>
            </div>
            <div class="backup-footer">
                <a-button @click="handleEditEpbaklst">
                    <template #icon>
                        <EditOutlined />
                    </template>
                    {{ t("TXT_CODE_INSTANCE_BACKUP_EDIT_EPBAKLST") }}
                </a-button>
                <a-button type="primary" :loading="loading" @click="startBackup">
                    <template #icon>
                        <PlusCircleOutlined />
                    </template>
                    {{ t("TXT_CODE_INSTANCE_BACKUP_CREATE") }}
                </a-button>
            </div>
        </div>
    </a-modal>

    <component :is="fileEditorComponent" v-if="fileEditorComponent && daemonId && instanceUuid" ref="fileEditorDialog" :daemon-id="daemonId"
        :instance-id="instanceUuid" />
</template>

<style scoped lang="scss">
.instance-backup-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.list-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
    margin-bottom: 12px;

    .refresh-btn {
        margin-left: auto;
    }
}

.backup-list {
    max-height: 400px;
    overflow-y: auto;
}

.backup-item {
    .backup-name {
        font-weight: 500;
    }
}

.empty-backup {
    text-align: center;
    padding: 40px 20px;

    .empty-icon {
        font-size: 64px;
        color: #d9d9d9;
        margin-bottom: 16px;
    }

    p {
        color: #999;
    }
}

.backup-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: 16px;
    gap: 8px;
}
</style>
