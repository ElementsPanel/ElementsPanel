<script setup lang="ts">
import NodeRemoteMappingEdit from "@/components/NodeRemoteMappingEdit.vue";
import { t } from "@/lang/i18n";
import { editNode, overviewInfo } from "@/services/apis";
import type { NodeStatus } from "@/types";
import { SettingOutlined } from "@ant-design/icons-vue";
import { message } from "ant-design-vue";
import { reactive, ref, watch } from "vue";
import DesktopWindow from "./DesktopWindow.vue";

const SPEED_RATE_OPTIONS = [
    { label: t("TXT_CODE_e3a77a77"), value: 0 },
    { label: "320KB/s", value: 5 },
    { label: "640KB/s", value: 10 },
    { label: "1MB/s", value: 16 },
    { label: "2MB/s", value: 32 },
    { label: "4MB/s", value: 64 },
    { label: "6MB/s", value: 96 },
    { label: "8MB/s", value: 128 },
    { label: "10MB/s", value: 160 },
    { label: "15MB/s", value: 240 },
    { label: "20MB/s", value: 320 },
    { label: "30MB/s", value: 480 }
];

export interface AdvancedSettingsData {
    uploadSpeedRate: number;
    downloadSpeedRate: number;
    maxDownloadFromUrlFileCount: number;
    outputBufferSize: number;
    enableSoftShutdown: boolean;
    softShutdownSkipDocker: boolean;
    softShutdownWaitSeconds: number;
    instanceBackupPath: string;
    instanceBackupFormat: string;
    instanceBackupCompressionLevel: number;
    daemonPort: number;
    remoteMappings: IPanelOverviewRemoteMappingResponse[];
}

const props = defineProps<{
    node: NodeStatus;
    visible: boolean;
}>();

const emit = defineEmits<{
    (e: "close"): void;
    (e: "saved"): void;
}>();

const windowWidth = window.innerWidth;
const windowHeight = window.innerHeight;
const saving = ref(false);
const loading = ref(false);

const form = reactive<AdvancedSettingsData>({
    uploadSpeedRate: 0,
    downloadSpeedRate: 0,
    maxDownloadFromUrlFileCount: 1,
    outputBufferSize: 256,
    enableSoftShutdown: true,
    softShutdownSkipDocker: true,
    softShutdownWaitSeconds: 10,
    instanceBackupPath: "",
    instanceBackupFormat: "zip",
    instanceBackupCompressionLevel: 9,
    daemonPort: 24444,
    remoteMappings: []
});

const resetForm = () => {
    form.uploadSpeedRate = 0;
    form.downloadSpeedRate = 0;
    form.maxDownloadFromUrlFileCount = 1;
    form.outputBufferSize = 256;
    form.enableSoftShutdown = true;
    form.softShutdownSkipDocker = true;
    form.softShutdownWaitSeconds = 10;
    form.instanceBackupPath = "";
    form.instanceBackupFormat = "zip";
    form.instanceBackupCompressionLevel = 9;
    form.daemonPort = 24444;
    form.remoteMappings = [];
};

const fetchNodeConfig = async () => {
    loading.value = true;
    resetForm();
    try {
        const { execute } = overviewInfo();
        const res = await execute({ forceRequest: true });
        const data = (res as any)?.value as IPanelOverviewResponse | undefined;
        if (data?.remote) {
            const nodeInfo = data.remote.find((n) => n.uuid === props.node.uuid);
            if (nodeInfo?.config) {
                const cfg = nodeInfo.config;
                form.uploadSpeedRate = cfg.uploadSpeedRate;
                form.downloadSpeedRate = cfg.downloadSpeedRate;
                form.maxDownloadFromUrlFileCount = cfg.maxDownloadFromUrlFileCount;
                form.outputBufferSize = cfg.outputBufferSize;
                form.enableSoftShutdown = cfg.enableSoftShutdown;
                form.softShutdownSkipDocker = cfg.softShutdownSkipDocker;
                form.softShutdownWaitSeconds = cfg.softShutdownWaitSeconds;
                form.instanceBackupPath = cfg.instanceBackupPath;
                form.instanceBackupFormat = cfg.instanceBackupFormat ?? "zip";
                form.instanceBackupCompressionLevel = cfg.instanceBackupCompressionLevel ?? 9;
                form.daemonPort = cfg.port;
            }
            if (nodeInfo?.remoteMappings) {
                form.remoteMappings = [...nodeInfo.remoteMappings];
            }
        }
    } catch {
        // ignore
    } finally {
        loading.value = false;
    }
};

watch(
    () => props.visible,
    (visible) => {
        if (visible) {
            fetchNodeConfig();
        }
    },
    { immediate: true }
);

watch(
    () => props.node.uuid,
    () => {
        if (props.visible) {
            fetchNodeConfig();
        }
    }
);

const saveSettings = async () => {
    saving.value = true;
    try {
        const { execute } = editNode();
        await execute({
            params: {
                uuid: props.node.uuid
            },
            data: {
                setting: {
                    uploadSpeedRate: form.uploadSpeedRate,
                    downloadSpeedRate: form.downloadSpeedRate,
                    maxDownloadFromUrlFileCount: form.maxDownloadFromUrlFileCount,
                    outputBufferSize: form.outputBufferSize,
                    enableSoftShutdown: form.enableSoftShutdown,
                    softShutdownSkipDocker: form.softShutdownSkipDocker,
                    softShutdownWaitSeconds: form.softShutdownWaitSeconds,
                    instanceBackupPath: form.instanceBackupPath,
                    instanceBackupFormat: form.instanceBackupFormat,
                    instanceBackupCompressionLevel: form.instanceBackupCompressionLevel
                },
                daemonPort: form.daemonPort,
                remoteMappings: form.remoteMappings
            }
        });
        message.success(t("TXT_CODE_e74d658c"));
        emit("saved");
        emit("close");
    } catch (error: any) {
        message.error(error?.message ?? t("TXT_CODE_5245bd11"));
    } finally {
        saving.value = false;
    }
};
</script>

<template>
    <DesktopWindow id="node-advanced-settings-dialog" :title="t('TXT_CODE_31a1d824')" :icon="SettingOutlined"
        :visible="visible" :minimized="false" :maximized="false" :active="true" :initial-width="520"
        :initial-height="620" :initial-x="windowWidth / 2 - 260" :initial-y="windowHeight / 2 - 310" :z-index="10003"
        :show-minimize="false" :show-maximize="false" :resizable="false" @close="emit('close')">
        <div class="dn-advanced-settings">
            <div v-if="loading" class="dn-advanced-settings__loading">
                {{ t("TXT_CODE_b197be11") }}
            </div>
            <div v-else class="dn-advanced-settings__body">
                <div class="dn-form-group">
                    <label class="dn-form-label">{{ t("TXT_CODE_fde31068") }}</label>
                    <span class="dn-form-hint">{{ t("TXT_CODE_d8d19932") }}</span>
                    <select v-model.number="form.uploadSpeedRate" class="dn-form-select">
                        <option v-for="item in SPEED_RATE_OPTIONS" :key="item.value" :value="item.value">
                            {{ item.label }}
                        </option>
                    </select>
                </div>

                <div class="dn-form-group">
                    <label class="dn-form-label">{{ t("TXT_CODE_785a0fcf") }}</label>
                    <span class="dn-form-hint">{{ t("TXT_CODE_b9fc604c") }}</span>
                    <select v-model.number="form.downloadSpeedRate" class="dn-form-select">
                        <option v-for="item in SPEED_RATE_OPTIONS" :key="item.value" :value="item.value">
                            {{ item.label }}
                        </option>
                    </select>
                </div>

                <div class="dn-form-group">
                    <label class="dn-form-label">{{ t("TXT_CODE_a15fca22") }}</label>
                    <span class="dn-form-hint">{{ t("TXT_CODE_ecaf78a2") }}</span>
                    <input v-model.number="form.maxDownloadFromUrlFileCount" type="number" class="dn-form-input" />
                </div>

                <div class="dn-form-group">
                    <label class="dn-form-label">{{ t("TXT_CODE_daemon_outputBufferSize") }}</label>
                    <span class="dn-form-hint">{{ t("TXT_CODE_daemon_outputBufferSizeInfo") }}</span>
                    <input v-model.number="form.outputBufferSize" type="number" class="dn-form-input" />
                </div>

                <div class="dn-form-group">
                    <label class="dn-form-label">{{ t("TXT_CODE_daemon_enableSoftShutdown") }}</label>
                    <span class="dn-form-hint">{{ t("TXT_CODE_daemon_enableSoftShutdownInfo") }}</span>
                    <a-switch v-model:checked="form.enableSoftShutdown" />
                </div>

                <div class="dn-form-group">
                    <label class="dn-form-label">{{ t("TXT_CODE_daemon_softShutdownSkipDocker") }}</label>
                    <span class="dn-form-hint">{{ t("TXT_CODE_daemon_softShutdownSkipDockerInfo") }}</span>
                    <a-switch v-model:checked="form.softShutdownSkipDocker" />
                </div>

                <div class="dn-form-group">
                    <label class="dn-form-label">{{ t("TXT_CODE_daemon_softShutdownWaitSeconds") }}</label>
                    <span class="dn-form-hint">{{ t("TXT_CODE_daemon_softShutdownWaitSecondsInfo") }}</span>
                    <input v-model.number="form.softShutdownWaitSeconds" type="number" class="dn-form-input" />
                </div>

                <div class="dn-form-group">
                    <label class="dn-form-label">{{ t("TXT_CODE_cd1f9ef7") }}</label>
                    <span class="dn-form-hint">{{ t("TXT_CODE_75ef0619") }}</span>
                    <input v-model.number="form.daemonPort" type="number" class="dn-form-input" />
                </div>

                <div class="dn-form-group">
                    <label class="dn-form-label">{{ t("TXT_CODE_INSTANCE_BACKUP_PATH") }}</label>
                    <span class="dn-form-hint">{{ t("TXT_CODE_INSTANCE_BACKUP_PATH_HINT") }}</span>
                    <input v-model="form.instanceBackupPath" type="text" class="dn-form-input"
                        placeholder="data/backups" />
                </div>

                <div class="dn-form-group">
                    <label class="dn-form-label">{{ t("TXT_CODE_e06c1cea") }}</label>
                    <select v-model="form.instanceBackupFormat" class="dn-form-select">
                        <option value="zip">ZIP</option>
                        <option value="tar.gz">TAR.GZ</option>
                    </select>
                </div>

                <div class="dn-form-group">
                    <label class="dn-form-label">{{ t("TXT_CODE_743ed87f") }}</label>
                    <input v-model.number="form.instanceBackupCompressionLevel" type="number" min="0" max="9"
                        step="1" class="dn-form-input" />
                </div>

                <div class="dn-form-group">
                    <label class="dn-form-label">{{ t("TXT_CODE_bbe23ee7") }}</label>
                    <span class="dn-form-hint">{{ t("TXT_CODE_497568db") }}</span>
                    <div class="dn-advanced-settings__mappings">
                        <NodeRemoteMappingEdit v-if="form.remoteMappings" v-model:value="form.remoteMappings" />
                        <span v-else class="dn-form-hint">{{ t("TXT_CODE_48c291c1") }}</span>
                    </div>
                </div>
            </div>
            <div class="dn-advanced-settings__footer">
                <button class="dn-btn dn-btn--default" @click="emit('close')">
                    {{ t("TXT_CODE_a0451c97") }}
                </button>
                <button class="dn-btn dn-btn--primary" :disabled="saving || loading" @click="saveSettings">
                    {{ t("TXT_CODE_d507abff") }}
                </button>
            </div>
        </div>
    </DesktopWindow>
</template>

<style lang="scss" scoped>
.dn-advanced-settings {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.dn-advanced-settings__loading {
    padding: 40px 20px;
    text-align: center;
    color: var(--desktop-window-text-muted);
    font-size: 13px;
}

.dn-advanced-settings__body {
    padding: 16px 20px;
    flex: 1;
    overflow-y: auto;
}

.dn-advanced-settings__footer {
    padding: 12px 20px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--desktop-window-border);
    flex-shrink: 0;
}

.dn-form-group {
    margin-bottom: 16px;

    &:last-child {
        margin-bottom: 0;
    }
}

.dn-form-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--desktop-window-text-secondary);
    margin-bottom: 4px;
    font-weight: 500;
}

.dn-form-hint {
    display: block;
    font-size: 11px;
    color: var(--desktop-window-text-muted);
    margin-bottom: 6px;
    line-height: 1.4;
}

.dn-form-input {
    width: 100%;
    padding: 8px 10px;
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 6px;
    color: var(--desktop-window-text);
    font-size: 13px;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;

    &::placeholder {
        color: var(--desktop-window-text-muted);
    }

    &:focus {
        border-color: var(--desktop-window-border);
    }
}

.dn-form-select {
    width: 100%;
    padding: 8px 10px;
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 6px;
    color: var(--desktop-window-text);
    font-size: 13px;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
    cursor: pointer;
    appearance: auto;

    &:focus {
        border-color: var(--desktop-window-border);
    }

    option {
        background: var(--desktop-window-bg);
        color: var(--desktop-window-text);
    }
}

.dn-btn {
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

.dn-advanced-settings__mappings {
    border: 1px solid var(--desktop-window-border);
    border-radius: 6px;
    padding: 8px;
    background: var(--desktop-window-titlebar-bg);
}
</style>
