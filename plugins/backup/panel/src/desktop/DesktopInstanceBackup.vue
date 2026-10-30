<script setup lang="ts">
import { t } from "@/lang/i18n";
import type { FrontendFileManagerService } from "@/plugin";
import { usePluginService, type FrontendDesktopService } from "@/plugin/context";
import {
    createAsyncTask,
    queryAsyncTask
} from "@/services/apis/instance";
import { notifyDesktop } from "@/tools/desktopNotice";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { deleteBackup, getBackupList, restoreBackup } from "../api";
import { VBtn, VIcon } from "vuetify/components";

const ConfirmDialog = computed(() => usePluginService<FrontendDesktopService>("desktop")?.confirmation);

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

const props = defineProps<{
    instanceUuid: string;
    daemonId: string;
}>();

const emit = defineEmits<{
    (e: "close"): void;
    (e: "open-file-editor", filePath: string, fileName: string): void;
}>();

const loading = ref(false);
const taskId = ref<string | null>(null);
const taskStatus = ref<number>(0);
const backupList = ref<{ name: string; size: number; time: string }[]>([]);
const listLoading = ref(false);

const deleteDialog = ref({
    show: false,
    name: "",
    resolve: null as ((value: boolean) => void) | null
});

const restoreDialog = ref({
    show: false,
    name: "",
    resolve: null as ((value: boolean) => void) | null
});

const backupConfirmDialog = ref({
    show: false,
    resolve: null as ((value: boolean) => void) | null
});

const epbaklstConfirmDialog = ref({
    show: false,
    resolve: null as ((value: boolean) => void) | null
});

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
        if (taskRes.value && taskRes.value.status === 1) {
            taskStatus.value = 1;
            taskId.value = taskRes.value.taskId;
            startQuery();
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
        notifyDesktop(error.message || t("TXT_CODE_INSTANCE_BACKUP_FAILED_FETCH"), "error");
    } finally {
        listLoading.value = false;
    }
};

const startBackup = async () => {
    if (taskStatus.value === 1 || loading.value) return;
    backupConfirmDialog.value = {
        show: true,
        resolve: async (val: boolean) => {
            backupConfirmDialog.value.show = false;
            if (val) {
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
                        notifyDesktop(t("TXT_CODE_INSTANCE_BACKUP_STARTED"), "success");
                        startQuery();
                    }
                } catch (error: any) {
                    notifyDesktop(error.message || t("TXT_CODE_INSTANCE_BACKUP_FAILED_START"), "error");
                } finally {
                    loading.value = false;
                }
            }
        }
    };
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
                        notifyDesktop(t("TXT_CODE_INSTANCE_BACKUP_COMPLETED"), "success");
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
    deleteDialog.value = {
        show: true,
        name: backupName,
        resolve: async (val: boolean) => {
            deleteDialog.value.show = false;
            if (val) {
                try {
                    const { execute } = deleteBackup();
                    await execute({
                        params: {
                            daemonId: props.daemonId,
                            uuid: props.instanceUuid,
                            backupName
                        }
                    });
                    notifyDesktop(t("TXT_CODE_28190dbc"), "success");
                    fetchBackupList();
                } catch (error: any) {
                    notifyDesktop(error.message || t("TXT_CODE_INSTANCE_BACKUP_FAILED_DELETE"), "error");
                }
            }
        }
    };
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
        if (res.value !== undefined) {
            emit("open-file-editor", filePath, fileName);
        }
    } catch {
        epbaklstConfirmDialog.value = {
            show: true,
            resolve: async (val: boolean) => {
                epbaklstConfirmDialog.value.show = false;
                if (val) {
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
                                text: "$black\n"
                            }
                        });
                        notifyDesktop(t("TXT_CODE_INSTANCE_BACKUP_EPBAKLST_CREATED"), "success");
                        emit("open-file-editor", filePath, fileName);
                    } catch (error: any) {
                        notifyDesktop(error.message, "error");
                    }
                }
            }
        };
    }
};

const handleRestore = (backupName: string) => {
    restoreDialog.value = {
        show: true,
        name: backupName,
        resolve: async (val: boolean) => {
            restoreDialog.value.show = false;
            if (val) {
                try {
                    const { execute } = restoreBackup();
                    await execute({
                        params: {
                            daemonId: props.daemonId,
                            uuid: props.instanceUuid,
                            backupName
                        }
                    });
                    notifyDesktop(t("TXT_CODE_INSTANCE_BACKUP_RESTORE_STARTED"), "success");
                } catch (error: any) {
                    notifyDesktop(error.message || t("TXT_CODE_INSTANCE_BACKUP_FAILED_RESTORE"), "error");
                }
            }
        }
    };
};

const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

onMounted(() => {
    fetchBackupList();
});

onUnmounted(() => {
    if (timer) clearInterval(timer);
});
</script>

<template>
    <div class="ds-backup">
        <div class="ds-backup-body">
            <div class="ds-backup-list-container">
                <div class="list-header">
                    {{ t("TXT_CODE_INSTANCE_BACKUP_LIST") }}
                    <VIcon icon="mdi-sync" :class="{ 'desktop-icon-spin': listLoading }" class="refresh-btn" @click="fetchBackupList"  />
                </div>
                <div v-if="backupList.length > 0" class="backup-list">
                    <div v-for="item in backupList" :key="item.name" class="backup-item">
                        <div class="backup-item__info">
                            <div class="backup-item__name" :title="item.name">{{ item.name }}</div>
                            <div class="backup-item__meta">
                                <span>{{ formatSize(item.size) }}</span>
                                <span class="separator">|</span>
                                <span>{{ item.time }}</span>
                            </div>
                        </div>
                        <div class="backup-item__actions">
                            <VBtn icon variant="text" class="action-btn action-btn--restore"
                                :title="t('TXT_CODE_INSTANCE_BACKUP_RESTORE')" @click="handleRestore(item.name)">
                                <VIcon icon="mdi-restore"  />
                            </VBtn>
                            <VBtn icon variant="text" class="action-btn action-btn--delete" :title="t('TXT_CODE_INSTANCE_BACKUP_DELETE')"
                                @click="handleDelete(item.name)">
                                <VIcon icon="mdi-delete-outline"  />
                            </VBtn>
                        </div>
                    </div>
                </div>
                <div v-else-if="!listLoading" class="ds-backup-intro">
                    <VIcon icon="mdi-cloud-download-outline" class="intro-icon"  />
                    <p>{{ t("TXT_CODE_INSTANCE_BACKUP_INTRO") }}</p>
                </div>
                <div v-else class="list-loading">
                    <VIcon icon="mdi-loading"  />
                </div>
            </div>
        </div>
        <div class="ds-backup-footer">
            <VBtn class="ds-dialog-btn ds-dialog-btn--default" variant="text" :disabled="loading" @click="handleEditEpbaklst">
                {{ t("TXT_CODE_INSTANCE_BACKUP_EDIT_EPBAKLST") }}
            </VBtn>
            <VBtn class="ds-dialog-btn ds-dialog-btn--primary" variant="text" :disabled="loading" @click="startBackup">
                {{ t("TXT_CODE_INSTANCE_BACKUP_CREATE") }}
            </VBtn>
        </div>

        <component :is="ConfirmDialog" v-if="ConfirmDialog" v-model="deleteDialog.show" id="backup-delete-dialog"
            :title="t('TXT_CODE_71155575')" :message="t('TXT_CODE_INSTANCE_BACKUP_DELETE_CONFIRM', { name: deleteDialog.name })"
            danger @cancel="deleteDialog.resolve?.(false)" @confirm="deleteDialog.resolve?.(true)" />

        <component :is="ConfirmDialog" v-if="ConfirmDialog" v-model="restoreDialog.show" id="backup-restore-dialog" :height="250"
            :title="t('TXT_CODE_INSTANCE_BACKUP_RESTORE')"
            :message="t('TXT_CODE_INSTANCE_BACKUP_RESTORE_CONFIRM', { name: restoreDialog.name })"
            @cancel="restoreDialog.resolve?.(false)" @confirm="restoreDialog.resolve?.(true)" />

        <component :is="ConfirmDialog" v-if="ConfirmDialog" v-model="epbaklstConfirmDialog.show" id="backup-epbaklst-confirm-dialog"
            :title="t('TXT_CODE_INSTANCE_BACKUP_EDIT_EPBAKLST')" :message="t('TXT_CODE_INSTANCE_BACKUP_EPBAKLST_CREATE_CONFIRM')"
            @cancel="epbaklstConfirmDialog.resolve?.(false)" @confirm="epbaklstConfirmDialog.resolve?.(true)" />

        <component :is="ConfirmDialog" v-if="ConfirmDialog" v-model="backupConfirmDialog.show" id="backup-confirm-dialog"
            :title="t('TXT_CODE_INSTANCE_BACKUP_CREATE')" :message="t('TXT_CODE_INSTANCE_BACKUP_CREATE_CONFIRM')"
            @cancel="backupConfirmDialog.resolve?.(false)" @confirm="backupConfirmDialog.resolve?.(true)" />
    </div>
</template>

<style lang="scss" scoped>
.ds-backup {
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--desktop-window-text);
    font-size: 13px;
    overflow: hidden;
}

.ds-backup-body {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 16px 20px 0;
}

.ds-backup-footer {
    padding: 12px 20px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--desktop-window-border);
    flex-shrink: 0;
}

.ds-dialog-btn {
    padding: 7px 16px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
    color: var(--desktop-window-text);
    white-space: nowrap;

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    &--primary {
        background: var(--color-blue-5, #1677ff);
        color: #fff;
        border-color: var(--color-blue-5, #1677ff);

        &:hover:not(:disabled) {
            background: var(--color-blue-6, #4096ff);
        }
    }

    &--default {
        background: var(--desktop-window-titlebar-bg);
        border: 1px solid var(--desktop-window-border);

        &:hover:not(:disabled) {
            background: var(--desktop-window-control-hover);
        }
    }
}

.ds-backup-list-container {
    width: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;

    .list-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        margin-bottom: 16px;
        color: var(--desktop-window-text);

        .refresh-btn {
            margin-left: auto;
            cursor: pointer;
            opacity: 0.7;

            &:hover {
                opacity: 1;
            }
        }
    }

    .backup-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-bottom: 20px;
    }

    .backup-item {
        background: var(--desktop-window-titlebar-bg);
        border: 1px solid var(--desktop-window-border);
        border-radius: 16px;
        overflow: hidden;
        padding: 12px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.2s;

        &:hover {
            border-color: var(--color-blue-5);
        }

        &__info {
            flex: 1;
            min-width: 0;
            margin-right: 16px;
        }

        &__name {
            font-weight: 500;
            margin-bottom: 4px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        &__meta {
            font-size: 12px;
            color: var(--desktop-window-text-muted);
            display: flex;
            align-items: center;
            gap: 8px;

            .separator {
                opacity: 0.3;
            }
        }

        &__actions {
            display: flex;
            gap: 8px;
        }

        .action-btn {
            background: transparent;
            border: none;
            padding: 6px;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            transition: all 0.2s;

            &--restore {
                color: var(--color-blue-5);

                &:hover {
                    background: rgba(22, 119, 255, 0.1);
                }
            }

            &--delete {
                color: #ff4d4f;

                &:hover {
                    background: rgba(255, 77, 79, 0.1);
                }
            }
        }
    }

    .list-loading {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        color: var(--color-blue-5);
    }
}

.ds-backup-intro {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;

    .intro-icon {
        font-size: 64px;
        color: var(--desktop-window-text-muted);
        margin-bottom: 20px;
        opacity: 0.5;
    }

    h3 {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 12px;
        color: var(--desktop-window-text);
    }

    p {
        font-size: 14px;
        color: var(--desktop-window-text-secondary);
        line-height: 1.6;
        margin: 0;
    }
}
</style>
