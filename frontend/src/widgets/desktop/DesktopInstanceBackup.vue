<script setup lang="ts">
import { t } from "@/lang/i18n";
import { fileContent, touchFile } from "@/services/apis/fileManager";
import {
    createAsyncTask,
    deleteBackup,
    getBackupList,
    queryAsyncTask,
    restoreBackup
} from "@/services/apis/instance";
import {
    CloudDownloadOutlined,
    DeleteOutlined,
    EditOutlined,
    ExclamationCircleOutlined,
    LoadingOutlined,
    PlusCircleOutlined,
    RollbackOutlined,
    SyncOutlined
} from "@ant-design/icons-vue";
import { message } from "ant-design-vue";
import { onMounted, onUnmounted, ref } from "vue";
import DesktopWindow from "./DesktopWindow.vue";

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

const windowWidth = ref(window.innerWidth);
const windowHeight = ref(window.innerHeight);

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
        message.error(error.message || t("TXT_CODE_INSTANCE_BACKUP_FAILED_FETCH"));
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
                        message.success(t("TXT_CODE_INSTANCE_BACKUP_STARTED"));
                        startQuery();
                    }
                } catch (error: any) {
                    message.error(error.message || t("TXT_CODE_INSTANCE_BACKUP_FAILED_START"));
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
                    message.success(t("TXT_CODE_28190dbc"));
                    fetchBackupList();
                } catch (error: any) {
                    message.error(error.message || t("TXT_CODE_INSTANCE_BACKUP_FAILED_DELETE"));
                }
            }
        }
    };
};

const handleEditEpbaklst = async () => {
    const filePath = ".epbaklst";
    const fileName = ".epbaklst";
    try {
        const { execute: readFile } = fileContent();
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
                        const { execute: createFile } = touchFile();
                        await createFile({
                            params: {
                                daemonId: props.daemonId,
                                uuid: props.instanceUuid
                            },
                            data: {
                                target: filePath
                            }
                        });
                        const { execute: writeFile } = fileContent();
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
                        emit("open-file-editor", filePath, fileName);
                    } catch (error: any) {
                        message.error(error.message);
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
                    message.success(t("TXT_CODE_INSTANCE_BACKUP_RESTORE_STARTED"));
                } catch (error: any) {
                    message.error(error.message || t("TXT_CODE_INSTANCE_BACKUP_FAILED_RESTORE"));
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

const updateWindowSize = () => {
    windowWidth.value = window.innerWidth;
    windowHeight.value = window.innerHeight;
};

onMounted(() => {
    window.addEventListener("resize", updateWindowSize);
    fetchBackupList();
});

onUnmounted(() => {
    if (timer) clearInterval(timer);
    window.removeEventListener("resize", updateWindowSize);
});
</script>

<template>
    <div class="ds-backup">
        <div class="ds-backup-body">
            <div class="ds-backup-list-container">
                <div class="list-header">
                    {{ t("TXT_CODE_INSTANCE_BACKUP_LIST") }}
                    <SyncOutlined :spin="listLoading" class="refresh-btn" @click="fetchBackupList" />
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
                            <button class="action-btn action-btn--restore"
                                :title="t('TXT_CODE_INSTANCE_BACKUP_RESTORE')" @click="handleRestore(item.name)">
                                <RollbackOutlined />
                            </button>
                            <button class="action-btn action-btn--delete" :title="t('TXT_CODE_INSTANCE_BACKUP_DELETE')"
                                @click="handleDelete(item.name)">
                                <DeleteOutlined />
                            </button>
                        </div>
                    </div>
                </div>
                <div v-else-if="!listLoading" class="ds-backup-intro">
                    <CloudDownloadOutlined class="intro-icon" />
                    <p>{{ t("TXT_CODE_INSTANCE_BACKUP_INTRO") }}</p>
                </div>
                <div v-else class="list-loading">
                    <LoadingOutlined />
                </div>
            </div>
        </div>
        <div class="ds-backup-footer">
            <button class="ds-dialog-btn ds-dialog-btn--default" :disabled="loading" @click="handleEditEpbaklst">
                <EditOutlined />
                {{ t("TXT_CODE_INSTANCE_BACKUP_EDIT_EPBAKLST") }}
            </button>
            <button class="ds-dialog-btn ds-dialog-btn--primary" :disabled="loading" @click="startBackup">
                <SyncOutlined v-if="loading" spin />
                <PlusCircleOutlined v-else />
                {{ t("TXT_CODE_INSTANCE_BACKUP_CREATE") }}
            </button>
        </div>

        <Teleport to="body">
            <Transition name="ds-dialog-fade">
                <DesktopWindow v-if="deleteDialog.show" id="backup-delete-dialog" :title="t('TXT_CODE_71155575')"
                    :icon="ExclamationCircleOutlined" :visible="deleteDialog.show" :minimized="false" :maximized="false"
                    :active="true" :initial-width="400" :initial-height="200" :initial-x="windowWidth / 2 - 200"
                    :initial-y="windowHeight / 2 - 100" :z-index="10006" :show-minimize="false" :show-maximize="false"
                    :resizable="false" @close="deleteDialog.resolve && deleteDialog.resolve(false)">
                    <div class="ds-dialog-content">
                        <div class="ds-dialog__body ds-dialog__body--column">
                            <ExclamationCircleOutlined class="ds-dialog__warn-icon" />
                            <p class="ds-dialog__desc">
                                {{ t("TXT_CODE_INSTANCE_BACKUP_DELETE_CONFIRM", { name: deleteDialog.name }) }}
                            </p>
                        </div>
                        <div class="ds-dialog__footer">
                            <button class="ds-dialog-btn ds-dialog-btn--default"
                                @click="deleteDialog.resolve && deleteDialog.resolve(false)">
                                {{ t("TXT_CODE_a0451c97") }}
                            </button>
                            <button class="ds-dialog-btn ds-dialog-btn--primary"
                                style="background: var(--color-red-5); border-color: var(--color-red-5);"
                                @click="deleteDialog.resolve && deleteDialog.resolve(true)">
                                {{ t("TXT_CODE_d507abff") }}
                            </button>
                        </div>
                    </div>
                </DesktopWindow>
            </Transition>
        </Teleport>

        <Teleport to="body">
            <Transition name="ds-dialog-fade">
                <DesktopWindow v-if="restoreDialog.show" id="backup-restore-dialog"
                    :title="t('TXT_CODE_INSTANCE_BACKUP_RESTORE')" :icon="ExclamationCircleOutlined"
                    :visible="restoreDialog.show" :minimized="false" :maximized="false" :active="true"
                    :initial-width="400" :initial-height="250" :initial-x="windowWidth / 2 - 200"
                    :initial-y="windowHeight / 2 - 110" :z-index="10006" :show-minimize="false" :show-maximize="false"
                    :resizable="false" @close="restoreDialog.resolve && restoreDialog.resolve(false)">
                    <div class="ds-dialog-content">
                        <div class="ds-dialog__body ds-dialog__body--column">
                            <ExclamationCircleOutlined class="ds-dialog__warn-icon" />
                            <p class="ds-dialog__desc">
                                {{ t("TXT_CODE_INSTANCE_BACKUP_RESTORE_CONFIRM", { name: restoreDialog.name }) }}
                            </p>
                        </div>
                        <div class="ds-dialog__footer">
                            <button class="ds-dialog-btn ds-dialog-btn--default"
                                @click="restoreDialog.resolve && restoreDialog.resolve(false)">
                                {{ t("TXT_CODE_a0451c97") }}
                            </button>
                            <button class="ds-dialog-btn ds-dialog-btn--primary"
                                @click="restoreDialog.resolve && restoreDialog.resolve(true)">
                                {{ t("TXT_CODE_d507abff") }}
                            </button>
                        </div>
                    </div>
                </DesktopWindow>
            </Transition>
        </Teleport>

        <Teleport to="body">
            <Transition name="ds-dialog-fade">
                <DesktopWindow v-if="epbaklstConfirmDialog.show" id="backup-epbaklst-confirm-dialog"
                    :title="t('TXT_CODE_INSTANCE_BACKUP_EDIT_EPBAKLST')" :icon="ExclamationCircleOutlined"
                    :visible="epbaklstConfirmDialog.show" :minimized="false" :maximized="false" :active="true"
                    :initial-width="400" :initial-height="200" :initial-x="windowWidth / 2 - 200"
                    :initial-y="windowHeight / 2 - 100" :z-index="10007" :show-minimize="false" :show-maximize="false"
                    :resizable="false" @close="epbaklstConfirmDialog.resolve && epbaklstConfirmDialog.resolve(false)">
                    <div class="ds-dialog-content">
                        <div class="ds-dialog__body ds-dialog__body--column">
                            <ExclamationCircleOutlined class="ds-dialog__warn-icon" />
                            <p class="ds-dialog__desc">
                                {{ t("TXT_CODE_INSTANCE_BACKUP_EPBAKLST_CREATE_CONFIRM") }}
                            </p>
                        </div>
                        <div class="ds-dialog__footer">
                            <button class="ds-dialog-btn ds-dialog-btn--default"
                                @click="epbaklstConfirmDialog.resolve && epbaklstConfirmDialog.resolve(false)">
                                {{ t("TXT_CODE_a0451c97") }}
                            </button>
                            <button class="ds-dialog-btn ds-dialog-btn--primary"
                                @click="epbaklstConfirmDialog.resolve && epbaklstConfirmDialog.resolve(true)">
                                {{ t("TXT_CODE_d507abff") }}
                            </button>
                        </div>
                    </div>
                </DesktopWindow>
            </Transition>
        </Teleport>

        <Teleport to="body">
            <Transition name="ds-dialog-fade">
                <DesktopWindow v-if="backupConfirmDialog.show" id="backup-confirm-dialog"
                    :title="t('TXT_CODE_INSTANCE_BACKUP_CREATE')" :icon="ExclamationCircleOutlined"
                    :visible="backupConfirmDialog.show" :minimized="false" :maximized="false" :active="true"
                    :initial-width="400" :initial-height="200" :initial-x="windowWidth / 2 - 200"
                    :initial-y="windowHeight / 2 - 100" :z-index="10006" :show-minimize="false" :show-maximize="false"
                    :resizable="false" @close="backupConfirmDialog.resolve && backupConfirmDialog.resolve(false)">
                    <div class="ds-dialog-content">
                        <div class="ds-dialog__body ds-dialog__body--column">
                            <ExclamationCircleOutlined class="ds-dialog__warn-icon" />
                            <p class="ds-dialog__desc">
                                {{ t("TXT_CODE_INSTANCE_BACKUP_CREATE_CONFIRM") }}
                            </p>
                        </div>
                        <div class="ds-dialog__footer">
                            <button class="ds-dialog-btn ds-dialog-btn--default"
                                @click="backupConfirmDialog.resolve && backupConfirmDialog.resolve(false)">
                                {{ t("TXT_CODE_a0451c97") }}
                            </button>
                            <button class="ds-dialog-btn ds-dialog-btn--primary"
                                @click="backupConfirmDialog.resolve && backupConfirmDialog.resolve(true)">
                                {{ t("TXT_CODE_d507abff") }}
                            </button>
                        </div>
                    </div>
                </DesktopWindow>
            </Transition>
        </Teleport>
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
        border-radius: 8px;
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

.ds-dialog-fade-enter-active,
.ds-dialog-fade-leave-active {
    transition: all 0.25s cubic-bezier(0.25, 0.10, 0.25, 1.00);
}

.ds-dialog-fade-enter-from,
.ds-dialog-fade-leave-to {
    opacity: 0;
    transform: scale(0.95);
}

.ds-dialog-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: transparent;
}

.ds-dialog__body {
    padding: 16px 20px;
    flex: 1;
    overflow-y: auto;

    &--column {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
    }
}

.ds-dialog__warn-icon {
    font-size: 36px;
    color: var(--color-warning, #faad14);
}

.ds-dialog__desc {
    margin: 0;
    color: var(--desktop-window-text);
    font-size: 14px;
    text-align: center;
    line-height: 1.6;
}

.ds-dialog__footer {
    padding: 12px 20px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--desktop-window-border);
}
</style>
