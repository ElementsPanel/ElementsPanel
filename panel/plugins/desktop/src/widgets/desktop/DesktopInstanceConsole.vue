<script setup lang="ts">
import { openMarketDialog, openRenewalDialog } from "@/components/fc";
import TerminalCore from "@/components/TerminalCore.vue";
import { INSTANCE_TYPE_TRANSLATION, verifyEULA } from "@/hooks/useInstance";
import { useOverviewInfo } from "@/hooks/useOverviewInfo";
import { useTerminal, type UseTerminalHook } from "@/hooks/useTerminal";
import { t } from "@/lang/i18n";
import {
    killInstance,
    openInstance,
    restartInstance,
    stopInstance,
    updateInstance
} from "@/services/apis/instance";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { sleep } from "@/tools/common";
import { reportErrorMsg } from "@/tools/validator";
import { INSTANCE_CRASH_TIMEOUT, INSTANCE_STATUS } from "@/types/const";
import {
    ApartmentOutlined,
    ArrowLeftOutlined,
    BlockOutlined,
    CheckCircleOutlined,
    CloseOutlined,
    CloudDownloadOutlined,
    ControlOutlined,
    DashboardOutlined,
    FieldTimeOutlined,
    FolderOpenOutlined,
    InfoCircleOutlined,
    InteractionOutlined,
    LaptopOutlined,
    LoadingOutlined,
    MoneyCollectOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    RedoOutlined
} from "@ant-design/icons-vue";
import { Modal } from "ant-design-vue";
import { computed, h, onUnmounted, ref } from "vue";
import { GLOBAL_INSTANCE_NAME } from "@/config/const";
import { arrayFilter } from "@/tools/array";
import DesktopManagerBtns from "./DesktopManagerBtns.vue";

type DialogPanel = "none" | "file-manager" | "mod-manager" | "schedule" | "server-config";

const props = defineProps<{
    instanceId: string;
    daemonId: string;
}>();

const emit = defineEmits<{
    (e: "open-server-config", instanceId: string, daemonId: string, type: string): void;
    (e: "open-file-manager", instanceId: string, daemonId: string, instanceName: string): void;
    (e: "open-mod-manager", instanceId: string, daemonId: string): void;
    (e: "open-schedule", instanceId: string, daemonId: string): void;
    (e: "open-event-config", instanceId: string, daemonId: string): void;
    (e: "open-term-config", instanceId: string, daemonId: string): void;
    (e: "open-mc-ping", instanceId: string, daemonId: string): void;
    (e: "open-java-manager", instanceId: string, daemonId: string): void;
    (e: "open-instance-action", actionId: string, instanceId: string, daemonId: string): void;
}>();

const { state, isAdmin } = useAppStateStore();

const terminalHook: UseTerminalHook = useTerminal();
const {
    state: instanceInfo,
    isStopped,
    isRunning,
    isBuys,
    isGlobalTerminal,
    isDockerMode,
    clearTerminal
} = terminalHook;

const { state: overviewState } = useOverviewInfo();

const nodeInfo = computed(() => {
    if (!overviewState.value?.remote) return null;
    return overviewState.value.remote.find((node: any) => node.uuid === props.daemonId);
});

const activeDialog = ref<DialogPanel>("none");

const openDialog = (panel: DialogPanel) => {
    activeDialog.value = panel;
};

const closeDialog = () => {
    activeDialog.value = "none";
};

const instanceTypeText = computed(
    () => INSTANCE_TYPE_TRANSLATION[instanceInfo.value?.config.type ?? -1]
);

const { execute: requestOpenInstance, isLoading: isOpenInstanceLoading } = openInstance();

let checkRunningTimer: NodeJS.Timeout;
const toOpenInstance = async () => {
    if (checkRunningTimer) clearTimeout(checkRunningTimer);
    clearTerminal();
    try {
        if (instanceInfo.value?.config?.type?.startsWith("minecraft/java")) {
            const flag = await verifyEULA(props.instanceId, props.daemonId);
            if (!flag) return;
            await sleep(1000);
        }

        await requestOpenInstance({
            params: {
                uuid: props.instanceId,
                daemonId: props.daemonId
            }
        });

        checkRunningTimer = setTimeout(() => {
            if (terminalHook.isStopped.value) {
                Modal.error({
                    title: t("TXT_CODE_ac405b50"),
                    content: h("div", [
                        h("p", t("TXT_CODE_3409258a")),
                        h("p", `${t("TXT_CODE_973414e1")}：${instanceInfo.value?.config.startCommand || ""}`),
                        isDockerMode.value &&
                        h("p", `${t("TXT_CODE_44b585c7")}：${instanceInfo.value?.config.docker.image || ""}`)
                    ])
                });
            }
        }, INSTANCE_CRASH_TIMEOUT);
    } catch (error: any) {
        reportErrorMsg(error);
    }
};

const updateCmd = computed(() => (instanceInfo.value?.config.updateCommand ? true : false));
const instanceStatusText = computed(() => INSTANCE_STATUS[instanceInfo.value?.status ?? -1]);

const quickOperations = computed(() =>
    arrayFilter([
        {
            title: t("TXT_CODE_57245e94"),
            icon: PlayCircleOutlined,
            noConfirm: false,
            type: "default",
            class: "button-color-success",
            click: toOpenInstance,
            props: {},
            condition: () => isStopped.value
        },
        {
            title: t("TXT_CODE_b1dedda3"),
            icon: PauseCircleOutlined,
            type: "default",
            click: async () => {
                try {
                    await stopInstance().execute({
                        params: {
                            uuid: props.instanceId,
                            daemonId: props.daemonId
                        }
                    });
                } catch (error: any) {
                    reportErrorMsg(error);
                }
            },
            props: {
                danger: true
            },
            condition: () => isRunning.value
        }
    ])
);

const instanceOperations = computed(() =>
    arrayFilter([
        {
            title: t("TXT_CODE_47dcfa5"),
            icon: RedoOutlined,
            type: "default",
            noConfirm: false,
            click: async () => {
                try {
                    await restartInstance().execute({
                        params: {
                            uuid: props.instanceId,
                            daemonId: props.daemonId
                        }
                    });
                } catch (error: any) {
                    reportErrorMsg(error);
                }
            },
            condition: () => isRunning.value
        },
        {
            title: t("TXT_CODE_7b67813a"),
            icon: CloseOutlined,
            type: "danger",
            class: "color-warning",
            click: async () => {
                try {
                    await killInstance().execute({
                        params: {
                            uuid: props.instanceId,
                            daemonId: props.daemonId
                        }
                    });
                } catch (error: any) {
                    reportErrorMsg(error);
                }
            },
            condition: () => !isStopped.value
        },
        {
            title: t("TXT_CODE_40ca4f2"),
            type: "default",
            icon: CloudDownloadOutlined,
            click: async () => {
                try {
                    clearTerminal();
                    await updateInstance().execute({
                        params: {
                            uuid: props.instanceId,
                            daemonId: props.daemonId,
                            task_name: "update"
                        },
                        data: {
                            time: new Date().getTime()
                        }
                    });
                } catch (error: any) {
                    reportErrorMsg(error);
                }
            },
            condition: () => isStopped.value && updateCmd.value
        },
        {
            title: t("TXT_CODE_b19ed1dd"),
            icon: InteractionOutlined,
            noConfirm: true,
            click: async () => {
                try {
                    clearTerminal();
                    await openMarketDialog(props.daemonId, props.instanceId, {
                        autoInstall: true,
                        onlyDockerTemplate: isDockerMode.value
                    });
                } catch (error: any) {
                    // ignore
                }
            },
            props: {},
            condition: () =>
                isStopped.value &&
                (state.settings.allowUsePreset || isAdmin.value) &&
                !isGlobalTerminal.value
        },
        {
            title: t("TXT_CODE_f77093c8"),
            icon: MoneyCollectOutlined,
            noConfirm: true,
            click: async () => {
                await openRenewalDialog(
                    instanceInfo.value?.instanceUuid ?? "",
                    props.daemonId,
                    instanceInfo.value?.config.category ?? 0
                );
            },
            props: {},
            condition: () => !!instanceInfo.value?.config?.category
        },
    ])
);

const getInstanceName = computed(() => {
    if (instanceInfo.value?.config.nickname === GLOBAL_INSTANCE_NAME) {
        return t("TXT_CODE_5bdaf23d");
    } else {
        return instanceInfo.value?.config.nickname;
    }
});

const formatBytes = (bytes: number): string => {
    if (bytes == null || isNaN(bytes)) return "0 B/s";
    const units = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }
    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const formatToGB = (bytes: number): string => {
    if (bytes == null || isNaN(bytes)) return "0.0G";
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
};

const perfInfo = computed(() => {
    const info = instanceInfo.value?.info;
    if (!info) return null;

    if (isDockerMode.value) {
        const cpu = info.cpuUsage != null ? Math.min(Math.round(info.cpuUsage), 100) : null;
        const mem = info.memoryUsagePercent != null ? Math.min(Math.round(info.memoryUsagePercent), 100) : null;
        const memUsed = info.memoryUsage != null ? formatToGB(info.memoryUsage) : null;
        const memTotal = info.memoryLimit != null ? formatToGB(info.memoryLimit) : null;
        const net = info.rxRate != null || info.txRate != null
            ? { rx: formatBytes(info.rxRate ?? 0), tx: formatBytes(info.txRate ?? 0) }
            : null;
        return { cpu, mem, memUsed, memTotal, net };
    }

    if (nodeInfo.value?.system) {
        const system = nodeInfo.value.system;
        const memoryUsage = system.totalmem - system.freemem;
        const cpu = system.cpuUsage != null ? Math.min(Math.round(system.cpuUsage * 100), 100) : null;
        const mem = system.totalmem > 0 ? Math.min(Math.round((memoryUsage / system.totalmem) * 100), 100) : null;
        const memUsed = formatToGB(memoryUsage);
        const memTotal = formatToGB(system.totalmem);
        const net = info.rxRate != null || info.txRate != null
            ? { rx: formatBytes(info.rxRate ?? 0), tx: formatBytes(info.txRate ?? 0) }
            : null;
        return { cpu, mem, memUsed, memTotal, net };
    }

    const cpu = info.cpuUsage != null ? Math.min(Math.round(info.cpuUsage), 100) : null;
    const mem = info.memoryUsagePercent != null ? Math.min(Math.round(info.memoryUsagePercent), 100) : null;
    const memUsed = info.memoryUsage != null ? formatToGB(info.memoryUsage) : null;
    const memTotal = info.memoryLimit != null ? formatToGB(info.memoryLimit) : null;
    const net = info.rxRate != null || info.txRate != null
        ? { rx: formatBytes(info.rxRate ?? 0), tx: formatBytes(info.txRate ?? 0) }
        : null;
    return { cpu, mem, memUsed, memTotal, net };
});

onUnmounted(() => {
    if (checkRunningTimer) clearTimeout(checkRunningTimer);
});
</script>

<template>
    <div class="dim">
        <div class="dim-toolbar">
            <div class="dim-toolbar__left">
                <div class="dim-instance__header">
                    <span class="dim-instance__status" :class="{
                        'status--running': isRunning,
                        'status--busy': isBuys,
                        'status--stopped': isStopped
                    }">
                        <CheckCircleOutlined v-if="isRunning" />
                        <LoadingOutlined v-else-if="isBuys" />
                        <InfoCircleOutlined v-else />
                    </span>
                    <span class="dim-instance__name">{{ getInstanceName }}</span>
                    <span class="dim-instance__badge" :class="{
                        'status--running': isRunning,
                        'status--busy': isBuys,
                        'status--stopped': isStopped
                    }">
                        {{ instanceStatusText }}
                    </span>
                    <span v-if="instanceTypeText" class="dim-instance__type">{{ instanceTypeText }}</span>
                    <span v-if="instanceInfo?.watcher && instanceInfo?.watcher > 1" class="dim-instance__players">
                        <LaptopOutlined /> {{ instanceInfo?.watcher }}
                    </span>
                </div>
            </div>
            <div class="dim-toolbar__right">
                <div v-if="perfInfo" class="dim-perf">
                    <span v-if="perfInfo.cpu != null" class="dim-perf__item"
                        :class="`dim-perf__cpu--${perfInfo.cpu > 80 ? 'high' : perfInfo.cpu > 50 ? 'mid' : 'low'}`"
                        :title="t('TXT_CODE_b862a158')">
                        <BlockOutlined /> {{ perfInfo.cpu }}%
                    </span>
                    <span v-if="perfInfo.mem != null && perfInfo.memUsed && perfInfo.memTotal" class="dim-perf__item"
                        :class="`dim-perf__mem--${perfInfo.mem > 80 ? 'high' : perfInfo.mem > 50 ? 'mid' : 'low'}`"
                        :title="t('TXT_CODE_593ee330')">
                        <DashboardOutlined /> {{ perfInfo.memUsed }}/{{ perfInfo.memTotal }}
                    </span>
                    <span v-if="perfInfo.net" class="dim-perf__item dim-perf__net" :title="t('TXT_CODE_50daec4')">
                        <ApartmentOutlined /> ↓{{ perfInfo.net.rx }}/s ↑{{ perfInfo.net.tx }}/s
                    </span>
                </div>
                <template v-for="item in [...quickOperations, ...instanceOperations]" :key="item.title">
                    <button v-if="item.noConfirm" class="dim-btn dim-btn--sm" :class="{
                        'dim-btn--primary': item.class === 'button-color-success',
                        'dim-btn--danger': item.type === 'danger'
                    }" :disabled="isOpenInstanceLoading" @click="item.click" :title="item.title">
                        <component :is="item.icon" />
                        {{ item.title }}
                    </button>
                    <a-popconfirm v-else :key="item.title" :title="t('TXT_CODE_276756b2')" @confirm="item.click">
                        <button class="dim-btn dim-btn--sm" :class="{
                            'dim-btn--primary': item.class === 'button-color-success',
                            'dim-btn--danger': item.type === 'danger'
                        }" :title="item.title">
                            <component :is="item.icon" />
                            {{ item.title }}
                        </button>
                    </a-popconfirm>
                </template>
            </div>
        </div>

        <div class="dim-body">
            <div v-if="activeDialog === 'none'" class="dim-list">
                <TerminalCore :use-terminal-hook="terminalHook" :instance-id="instanceId" :daemon-id="daemonId"
                    height="100%" />
            </div>

            <div v-else-if="activeDialog === 'file-manager'" class="dim-dialog">
                <div class="dim-dialog__header">
                    <button class="dim-btn dim-btn--icon" @click="closeDialog" :title="t('TXT_CODE_6c5985ca')">
                        <ArrowLeftOutlined />
                    </button>
                    <span class="dim-dialog__title">
                        <FolderOpenOutlined /> {{ t("TXT_CODE_ae533703") }}
                    </span>
                </div>
                <div class="dim-dialog__body">
                    <div class="dim-placeholder">
                        <FolderOpenOutlined class="dim-placeholder__icon" />
                        <p class="dim-placeholder__text">{{ t("TXT_CODE_ae533703") }}</p>
                        <p class="dim-placeholder__hint">{{ t("TXT_CODE_6c5985ca") }}</p>
                    </div>
                </div>
            </div>

            <div v-else-if="activeDialog === 'mod-manager'" class="dim-dialog">
                <div class="dim-dialog__header">
                    <button class="dim-btn dim-btn--icon" @click="closeDialog" :title="t('TXT_CODE_6c5985ca')">
                        <ArrowLeftOutlined />
                    </button>
                    <span class="dim-dialog__title">
                        <UsbOutlined /> {{ t("TXT_CODE_MOD_MANAGER") }}
                    </span>
                </div>
                <div class="dim-dialog__body">
                    <div class="dim-placeholder">
                        <UsbOutlined class="dim-placeholder__icon" />
                        <p class="dim-placeholder__text">{{ t("TXT_CODE_MOD_MANAGER") }}</p>
                        <p class="dim-placeholder__hint">{{ t("TXT_CODE_6c5985ca") }}</p>
                    </div>
                </div>
            </div>

            <div v-else-if="activeDialog === 'schedule'" class="dim-dialog">
                <div class="dim-dialog__header">
                    <button class="dim-btn dim-btn--icon" @click="closeDialog" :title="t('TXT_CODE_6c5985ca')">
                        <ArrowLeftOutlined />
                    </button>
                    <span class="dim-dialog__title">
                        <FieldTimeOutlined /> {{ t("TXT_CODE_b7d026f8") }}
                    </span>
                </div>
                <div class="dim-dialog__body">
                    <div class="dim-placeholder">
                        <FieldTimeOutlined class="dim-placeholder__icon" />
                        <p class="dim-placeholder__text">{{ t("TXT_CODE_b7d026f8") }}</p>
                        <p class="dim-placeholder__hint">{{ t("TXT_CODE_6c5985ca") }}</p>
                    </div>
                </div>
            </div>

            <div v-else-if="activeDialog === 'server-config'" class="dim-dialog">
                <div class="dim-dialog__header">
                    <button class="dim-btn dim-btn--icon" @click="closeDialog" :title="t('TXT_CODE_6c5985ca')">
                        <ArrowLeftOutlined />
                    </button>
                    <span class="dim-dialog__title">
                        <ControlOutlined /> {{ t("TXT_CODE_d07742fe") }}
                    </span>
                </div>
                <div class="dim-dialog__body">
                    <div class="dim-placeholder">
                        <ControlOutlined class="dim-placeholder__icon" />
                        <p class="dim-placeholder__text">{{ t("TXT_CODE_d07742fe") }}</p>
                        <p class="dim-placeholder__hint">{{ t("TXT_CODE_6c5985ca") }}</p>
                    </div>
                </div>
            </div>
        </div>

        <DesktopManagerBtns :instance-id="instanceId" :daemon-id="daemonId"
            @open-server-config="(type: string) => emit('open-server-config', instanceId, daemonId, type)"
            @open-file-manager="emit('open-file-manager', instanceId, daemonId, getInstanceName || instanceId)"
            @open-mod-manager="emit('open-mod-manager', instanceId, daemonId)"
            @open-schedule="emit('open-schedule', instanceId, daemonId)"
            @open-event-config="emit('open-event-config', instanceId, daemonId)"
            @open-term-config="emit('open-term-config', instanceId, daemonId)"
            @open-mc-ping="emit('open-mc-ping', instanceId, daemonId)"
            @open-java-manager="emit('open-java-manager', instanceId, daemonId)"
            @open-instance-action="(actionId: string) => emit('open-instance-action', actionId, instanceId, daemonId)" />
    </div>
</template>

<style lang="scss" scoped>
.dim {
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--desktop-window-text);
    font-size: 13px;
}

.dim-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--desktop-window-border);
    flex-wrap: wrap;

    &__left,
    &__right {
        display: flex;
        align-items: center;
        gap: 8px;
    }
}

.dim-btn {
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    border-radius: 6px;
    color: var(--desktop-window-text);
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 4px;

    &:hover:not(:disabled) {
        background: var(--desktop-window-control-hover);
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    &--sm {
        padding: 4px 10px;
        font-size: 11px;
    }

    &--icon {
        padding: 4px 8px;
        font-size: 14px;
    }

    &--primary {
        color: #52c41a;
        border-color: rgba(82, 196, 26, 0.3);
        background: rgba(82, 196, 26, 0.1);

        &:hover:not(:disabled) {
            background: rgba(82, 196, 26, 0.2);
        }
    }

    &--danger {
        color: #ff4d4f;
        border-color: rgba(255, 77, 79, 0.3);
        background: rgba(255, 77, 79, 0.1);

        &:hover:not(:disabled) {
            background: rgba(255, 77, 79, 0.2);
        }
    }
}

.dim-instance__header {
    display: flex;
    align-items: center;
    gap: 8px;
}

.dim-instance__status {
    font-size: 14px;
    line-height: 1;
    display: flex;
    align-items: center;

    &.status--running {
        color: #52c41a;
    }

    &.status--stopped {
        color: #8c8c8c;
    }

    &.status--busy {
        color: #ff4d4f;
    }
}

.dim-instance__name {
    font-size: 14px;
    font-weight: 500;
    color: var(--desktop-window-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
}

.dim-instance__badge {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 500;
    white-space: nowrap;

    &.status--running {
        background: rgba(82, 196, 26, 0.15);
        color: #52c41a;
    }

    &.status--stopped {
        background: rgba(140, 140, 140, 0.15);
        color: #8c8c8c;
    }

    &.status--busy {
        background: rgba(255, 77, 79, 0.15);
        color: #ff4d4f;
    }
}

.dim-instance__type {
    background: var(--desktop-window-titlebar-bg);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    color: var(--desktop-window-text-secondary);
}

.dim-instance__players {
    font-size: 11px;
    color: var(--desktop-window-text-secondary);
    display: flex;
    align-items: center;
    gap: 4px;
}

.dim-perf {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border-right: 1px solid var(--desktop-window-border);
    margin-right: 5px;
}

.dim-perf__item {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--desktop-window-titlebar-bg);
    cursor: default;

    &.dim-perf__cpu--low {
        color: var(--color-blue-5, #1677ff);
    }

    &.dim-perf__cpu--mid {
        color: var(--color-gold-6, #faad14);
    }

    &.dim-perf__cpu--high {
        color: var(--color-red-5, #ff4d4f);
    }

    &.dim-perf__mem--low {
        color: var(--color-purple-5, #722ed1);
    }

    &.dim-perf__mem--mid {
        color: var(--color-gold-6, #faad14);
    }

    &.dim-perf__mem--high {
        color: var(--color-red-5, #ff4d4f);
    }

    &.dim-perf__net {
        color: var(--color-green-6, #52c41a);
    }
}

.dim-body {
    flex: 1;
    overflow: hidden;
    position: relative;
}

.dim-list {
    height: 100%;
    padding: 8px;
    overflow: hidden;
    position: relative;
}

:deep(.console-wrapper) {
    height: 100%;
    display: flex;
    flex-direction: column;
}

:deep(.terminal-wrapper) {
    flex: 1;
    margin-bottom: 12px;
}

:deep(.command-input) {
    flex-shrink: 0;
}

.dim-dialog {
    height: 100%;
    display: flex;
    flex-direction: column;

    &__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-bottom: 1px solid var(--desktop-window-border);
        flex-shrink: 0;
    }

    &__title {
        font-size: 13px;
        font-weight: 500;
        color: var(--desktop-window-text);
        display: flex;
        align-items: center;
        gap: 6px;
    }

    &__body {
        flex: 1;
        overflow: auto;
        padding: 16px;
    }

    &--full {
        .dim-dialog__body {
            padding: 0;
        }
    }
}

.dim-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--desktop-window-text-muted);

    &__icon {
        font-size: 48px;
        opacity: 0.4;
    }

    &__text {
        font-size: 16px;
        font-weight: 500;
        margin: 0;
    }

    &__hint {
        font-size: 12px;
        margin: 0;
        opacity: 0.6;
    }
}
</style>
