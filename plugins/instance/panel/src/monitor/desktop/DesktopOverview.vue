<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { useOverviewInfo } from "@elementspanel/epanel-plugin-console/hooks/useOverviewInfo";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { VIcon } from "vuetify/components";
import { computed } from "vue";

const { state: overviewData } = useOverviewInfo();

const panelCpu = computed(() => overviewData.value?.cpu ?? 0);
const panelMem = computed(() => overviewData.value?.mem ?? 0);
const totalInstances = computed(() => overviewData.value?.totalInstance ?? 0);
const runningInstances = computed(() => overviewData.value?.runningInstance ?? 0);
const stoppedInstances = computed(() => totalInstances.value - runningInstances.value);

const remoteCount = computed(() => overviewData.value?.remoteCount ?? { available: 0, total: 0 });
const remoteNodes = computed(() => overviewData.value?.remote ?? []);

const panelVersion = computed(() => overviewData.value?.version ?? "--");
const daemonVersion = computed(() => overviewData.value?.specifiedDaemonVersion ?? "--");

const systemInfo = computed(() => overviewData.value?.system);
const panelProcess = computed(() => overviewData.value?.process);

const record = computed(() => overviewData.value?.record);

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

const formatUptime = (seconds: number): string => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0 || parts.length === 0) parts.push(`${m}m`);
    return parts.join(" ");
};

const formatLoadAvg = (load: number[]): string => {
    return load.map((v) => v.toFixed(2)).join(", ");
};

const cpuColor = computed(() => {
    const v = panelCpu.value;
    if (v < 50) return "var(--color-green-5)";
    if (v < 80) return "var(--color-orange-5)";
    return "var(--color-red-5)";
});

const memColor = computed(() => {
    const v = panelMem.value;
    if (v < 50) return "var(--color-green-5)";
    if (v < 80) return "var(--color-orange-5)";
    return "var(--color-red-5)";
});
</script>

<template>
    <div class="desktop-overview">
        <div class="ov-stats-row">
            <div class="ov-stat-card ov-stat-card--instances">
                <div class="ov-stat-card__icon">
                    <VIcon icon="mdi-server-outline" />
                </div>
                <div class="ov-stat-card__body">
                    <div class="ov-stat-card__value">{{ totalInstances }}</div>
                    <div class="ov-stat-card__label">{{ t("TXT_CODE_DESKTOP_IM_TOTAL") }}</div>
                </div>
                <div class="ov-stat-card__extra">
                    <span class="ov-stat-card__running">
                        <VIcon icon="mdi-check-circle-outline" /> {{ runningInstances }}
                    </span>
                    <span class="ov-stat-card__stopped">
                        <VIcon icon="mdi-close-circle-outline" /> {{ stoppedInstances }}
                    </span>
                </div>
            </div>

            <div class="ov-stat-card ov-stat-card--nodes">
                <div class="ov-stat-card__icon">
                    <VIcon icon="mdi-api" />
                </div>
                <div class="ov-stat-card__body">
                    <div class="ov-stat-card__value">{{ remoteCount.available }} / {{ remoteCount.total }}</div>
                    <div class="ov-stat-card__label">{{ t("TXT_CODE_COMMON_DAEMONS") }}</div>
                </div>
                <div class="ov-stat-card__extra">
                    <span class="ov-stat-card__online">
                        <VIcon icon="mdi-check-circle-outline" /> {{ remoteCount.available }}
                    </span>
                    <span class="ov-stat-card__offline">
                        <VIcon icon="mdi-close-circle-outline" /> {{ remoteCount.total - remoteCount.available }}
                    </span>
                </div>
            </div>

            <div class="ov-stat-card ov-stat-card--cpu">
                <div class="ov-stat-card__icon">
                    <VIcon icon="mdi-chip" />
                </div>
                <div class="ov-stat-card__body">
                    <div class="ov-stat-card__value">{{ panelCpu }}%</div>
                    <div class="ov-stat-card__label">CPU</div>
                </div>
                <div class="ov-stat-card__bar">
                    <div class="ov-stat-card__bar-fill" :style="{ width: panelCpu + '%', background: cpuColor }"></div>
                </div>
            </div>

            <div class="ov-stat-card ov-stat-card--mem">
                <div class="ov-stat-card__icon">
                    <VIcon icon="mdi-memory" />
                </div>
                <div class="ov-stat-card__body">
                    <div class="ov-stat-card__value">{{ panelMem }}%</div>
                    <div class="ov-stat-card__label">{{ t("TXT_CODE_COMMON_MEMORY") }}</div>
                </div>
                <div class="ov-stat-card__bar">
                    <div class="ov-stat-card__bar-fill" :style="{ width: panelMem + '%', background: memColor }"></div>
                </div>
            </div>
        </div>

        <div class="ov-grid">
            <div class="ov-panel ov-panel--system">
                <div class="ov-panel__header">
                    <span class="ov-panel__title">{{ t("TXT_CODE_COMMON_SYSTEM_RESOURCES") }}</span>
                </div>
                <div class="ov-panel__body">
                    <div class="ov-info-row">
                        <span class="ov-info-row__label">{{ t("TXT_CODE_COMMON_VERSION") }}</span>
                        <span class="ov-info-row__value">{{ systemInfo?.version ?? "--" }}</span>
                    </div>
                    <div class="ov-info-row">
                        <span class="ov-info-row__label">{{ t("TXT_CODE_COMMON_PLATFORM") }}</span>
                        <span class="ov-info-row__value">{{ systemInfo?.platform ?? "--" }}</span>
                    </div>
                    <div class="ov-info-row">
                        <span class="ov-info-row__label">{{ t("TXT_CODE_COMMON_HOSTNAME") }}</span>
                        <span class="ov-info-row__value">{{ systemInfo?.hostname ?? "--" }}</span>
                    </div>
                    <div class="ov-info-row">
                        <span class="ov-info-row__label">{{ t("TXT_CODE_COMMON_UNIX_LOAD_AVERAGE") }}</span>
                        <span class="ov-info-row__value">{{ systemInfo?.loadavg ? formatLoadAvg(systemInfo.loadavg) :
                            "--" }}</span>
                    </div>
                    <div class="ov-info-row">
                        <span class="ov-info-row__label">{{ t("TXT_CODE_COMMON_BROWSER_TIME") }}</span>
                        <span class="ov-info-row__value">{{ systemInfo?.time ? new
                            Date(systemInfo.time).toLocaleString() : "--" }}</span>
                    </div>
                </div>
            </div>

            <div class="ov-panel ov-panel--panel">
                <div class="ov-panel__header">
                    <span class="ov-panel__title">{{ t("TXT_CODE_COMMON_CONTROL_PANEL") }}</span>
                </div>
                <div class="ov-panel__body">
                    <div class="ov-info-row">
                        <span class="ov-info-row__label">
                            {{ t("TXT_CODE_COMMON_NODE_JS_VERSION") }}
                        </span>
                        <span class="ov-info-row__value">{{ systemInfo?.node }}</span>
                    </div>
                    <div class="ov-info-row">
                        <span class="ov-info-row__label">{{ t("TXT_CODE_COMMON_PANEL_VERSION") }}</span>
                        <span class="ov-info-row__value">{{ panelVersion }}</span>
                    </div>
                    <div class="ov-info-row">
                        <span class="ov-info-row__label">{{ t("TXT_CODE_COMMON_MATCHED_DAEMON_VERSION") }}</span>
                        <span class="ov-info-row__value">{{ daemonVersion }}</span>
                    </div>
                    <div class="ov-info-row">
                        <span class="ov-info-row__label">{{ t("TXT_CODE_COMMON_PANEL_MEMORY_USAGE") }}</span>
                        <span class="ov-info-row__value">{{ panelProcess?.memory ? formatBytes(panelProcess.memory) :
                            "--" }}</span>
                    </div>
                </div>
            </div>

            <div class="ov-panel ov-panel--security">
                <div class="ov-panel__header">
                    <span class="ov-panel__title">{{ t("TXT_CODE_COMMON_SECURITY") }}</span>
                </div>
                <div class="ov-panel__body">
                    <div class="ov-info-row">
                        <span class="ov-info-row__label">{{ t("TXT_CODE_COMMON_FAILED_SUCCESSFUL") }}</span>
                        <span class="ov-info-row__value">{{ record?.loginFailed ?? 0 }} / {{ record?.illegalAccess ?? 0
                        }}</span>
                    </div>
                    <div class="ov-info-row">
                        <span class="ov-info-row__label">{{ t("TXT_CODE_COMMON_TEMPORARY_BANNED_I_PS") }}</span>
                        <span class="ov-info-row__value">{{ record?.banips ?? 0 }}</span>
                    </div>
                </div>
            </div>

            <div class="ov-panel ov-panel--nodes">
                <div class="ov-panel__header">
                    <span class="ov-panel__title">{{ t("TXT_CODE_OVERVIEW_ONLINE_NODE_COUNT") }} ({{ remoteNodes.length }})</span>
                </div>
                <div class="ov-panel__body ov-panel__body--nodes">
                    <Empty
                      v-if="remoteNodes.length === 0"
                      icon="mdi-server-network-outline"
                      :title="t('TXT_CODE_COMMON_NO_AVAILABLE_NODES_HINT')"
                      compact
                    />
                    <div v-for="node in remoteNodes" :key="node.uuid" class="ov-node-item">
                        <div class="ov-node-item__status">
                            <span v-if="node.available" class="ov-node-status-dot ov-node-status-dot--online"
                                :title="t('TXT_CODE_COMMON_ONLINE')"></span>
                            <span v-else class="ov-node-status-dot ov-node-status-dot--offline" :title="t('TXT_CODE_COMMON_OFFLINE')"></span>
                        </div>
                        <div class="ov-node-item__info">
                            <div class="ov-node-item__name">{{ node.remarks || node.ip }}</div>
                            <div class="ov-node-item__meta">
                                <span>{{ node.ip }}:{{ node.port }}</span>
                                <span v-if="node.instance" class="ov-node-item__instances">
                                    {{ node.instance.running }}/{{ node.instance.total }}
                                </span>
                            </div>
                        </div>
                        <div v-if="node.system" class="ov-node-item__stats">
                            <span class="ov-node-item__stat" :title="'CPU'">
                                <VIcon icon="mdi-arrow-up" /> {{ (node.system.cpuUsage * 100).toFixed(0) }}%
                            </span>
                            <span class="ov-node-item__stat" :title="t('TXT_CODE_COMMON_MEMORY')">
                                <VIcon icon="mdi-arrow-down" /> {{ (node.system.memUsage * 100).toFixed(0) }}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.desktop-overview {
    height: 100%;
    padding: 20px 24px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.ov-stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    flex-shrink: 0;
}

.ov-stat-card {
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: background 0.2s;

    &:hover {
        background: var(--desktop-window-control-hover);
    }

    &__icon {
        font-size: 18px;
        color: var(--desktop-window-text-secondary);
    }

    &__body {
        display: flex;
        align-items: baseline;
        gap: 8px;
    }

    &__value {
        font-size: 22px;
        font-weight: 700;
        color: var(--desktop-window-text);
        line-height: 1;
    }

    &__label {
        font-size: 12px;
        color: var(--desktop-window-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    &__extra {
        display: flex;
        gap: 12px;
        font-size: 12px;

        span {
            display: flex;
            align-items: center;
            gap: 4px;
        }
    }

    &__running,
    &__online {
        color: var(--color-green-5, #52c41a);
    }

    &__stopped,
    &__offline {
        color: var(--desktop-window-text-muted);
    }

    &__bar {
        height: 4px;
        background: var(--desktop-window-border);
        border-radius: 2px;
        overflow: hidden;
        margin-top: 2px;
    }

    &__bar-fill {
        height: 100%;
        border-radius: 2px;
        transition: width 0.6s ease, background 0.3s;
    }
}

.ov-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    flex: 1;
    min-height: 0;
}

.ov-panel {
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    &__header {
        padding: 10px 14px;
        border-bottom: 1px solid var(--desktop-window-border);
        flex-shrink: 0;
    }

    &__title {
        font-size: 13px;
        font-weight: 600;
        color: var(--desktop-window-text);
    }

    &__body {
        padding: 10px 14px;
        flex: 1;
        overflow-y: auto;

        &--nodes {
            padding: 6px 8px;
        }
    }
}

.ov-info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid var(--desktop-window-border);

    &:last-child {
        border-bottom: none;
    }

    &__label {
        font-size: 12px;
        color: var(--desktop-window-text-secondary);
    }

    &__value {
        font-size: 12px;
        color: var(--desktop-window-text);
        font-weight: 500;
        text-align: right;
    }
}

.ov-node-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 6px;
    border-radius: 6px;
    transition: background 0.15s;
    cursor: default;

    &:hover {
        background: var(--desktop-window-control-hover);
    }

    &__status {
        flex-shrink: 0;
    }

    &__info {
        flex: 1;
        min-width: 0;
    }

    &__name {
        font-size: 13px;
        font-weight: 500;
        color: var(--desktop-window-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    &__meta {
        font-size: 11px;
        color: var(--desktop-window-text-muted);
        display: flex;
        gap: 8px;
        margin-top: 2px;
    }

    &__instances {
        color: var(--desktop-window-text-secondary);
    }

    &__stats {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
    }

    &__stat {
        font-size: 11px;
        color: var(--desktop-window-text-secondary);
        display: flex;
        align-items: center;
        gap: 2px;
    }
}

.ov-node-status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;

    &--online {
        background: var(--color-green-5, #52c41a);
        box-shadow: 0 0 6px rgba(82, 196, 26, 0.4);
    }

    &--offline {
        background: var(--desktop-window-text-muted);
    }
}
</style>
