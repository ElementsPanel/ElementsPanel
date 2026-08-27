<script setup lang="ts">
import { t } from "@/lang/i18n";
import { userInfoApiAdvanced } from "@/services/apis/index";
import {
    killInstance,
    openInstance,
    restartInstance,
    stopInstance
} from "@/services/apis/instance";
import { INSTANCE_STATUS_CODE } from "@/types/const";
import type { UserInstance } from "@/types/user";
import {
    CaretRightOutlined,
    ClockCircleOutlined,
    CloseCircleOutlined,
    InboxOutlined,
    LoadingOutlined,
    MinusCircleOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    QuestionCircleOutlined,
    ReloadOutlined,
    SearchOutlined,
    StopOutlined,
    TeamOutlined
} from "@ant-design/icons-vue";
import { computed, onMounted, onUnmounted, ref, type Component } from "vue";

interface MyAppInstance extends UserInstance {
    info?: Record<string, any>;
    config?: IGlobalInstanceConfig;
    endTime?: number;
}

const instances = ref<MyAppInstance[]>([]);
const loading = ref(false);
const searchText = ref("");
const statusFilter = ref<string>("all");
const operatingIds = ref<Set<string>>(new Set());

let refreshTimer: ReturnType<typeof setInterval> | null = null;

const { execute: executeUserInfoAdvanced } = userInfoApiAdvanced();
const { execute: executeOpen } = openInstance();
const { execute: executeStop } = stopInstance();
const { execute: executeKill } = killInstance();
const { execute: executeRestart } = restartInstance();

const filteredInstances = computed(() => {
    let list = instances.value;
    if (searchText.value.trim()) {
        const keyword = searchText.value.trim().toLowerCase();
        list = list.filter(
            (i) =>
                (i.nickname || "").toLowerCase().includes(keyword) ||
                i.instanceUuid.toLowerCase().includes(keyword)
        );
    }
    if (statusFilter.value !== "all") {
        const code = Number(statusFilter.value) as INSTANCE_STATUS_CODE;
        list = list.filter((i) => i.status === code);
    }
    return list;
});

const instanceCounts = computed(() => {
    const running = instances.value.filter((i) => i.status === INSTANCE_STATUS_CODE.RUNNING).length;
    const stopped = instances.value.filter((i) => i.status === INSTANCE_STATUS_CODE.STOPPED).length;
    const total = instances.value.length;
    return { running, stopped, total };
});

const getStatusText = (status: INSTANCE_STATUS_CODE): string => {
    const map: Record<INSTANCE_STATUS_CODE, string> = {
        [INSTANCE_STATUS_CODE.BUSY]: t("TXT_CODE_342a04a9"),
        [INSTANCE_STATUS_CODE.STOPPED]: t("TXT_CODE_DESKTOP_IM_STOPPED"),
        [INSTANCE_STATUS_CODE.STOPPING]: t("TXT_CODE_DESKTOP_IM_STOPPING"),
        [INSTANCE_STATUS_CODE.STARTING]: t("TXT_CODE_DESKTOP_IM_STARTING"),
        [INSTANCE_STATUS_CODE.RUNNING]: t("TXT_CODE_DESKTOP_IM_RUNNING")
    };
    return map[status] || t("TXT_CODE_DESKTOP_IM_UNKNOWN");
};

const getStatusClass = (status: INSTANCE_STATUS_CODE): string => {
    const map: Record<INSTANCE_STATUS_CODE, string> = {
        [INSTANCE_STATUS_CODE.BUSY]: "status--busy",
        [INSTANCE_STATUS_CODE.STOPPED]: "status--stopped",
        [INSTANCE_STATUS_CODE.STOPPING]: "status--stopping",
        [INSTANCE_STATUS_CODE.STARTING]: "status--starting",
        [INSTANCE_STATUS_CODE.RUNNING]: "status--running"
    };
    return map[status] || "";
};

const statusIconMap: Record<number, Component> = {
    [INSTANCE_STATUS_CODE.BUSY]: ClockCircleOutlined,
    [INSTANCE_STATUS_CODE.STOPPED]: MinusCircleOutlined,
    [INSTANCE_STATUS_CODE.STOPPING]: PauseCircleOutlined,
    [INSTANCE_STATUS_CODE.STARTING]: ClockCircleOutlined,
    [INSTANCE_STATUS_CODE.RUNNING]: PlayCircleOutlined
};

const getStatusIconComponent = (status: INSTANCE_STATUS_CODE): Component => {
    return statusIconMap[status] || QuestionCircleOutlined;
};

const fetchInstances = async (silent = false) => {
    if (!silent) loading.value = true;
    try {
        const res = await executeUserInfoAdvanced({
            params: { advanced: true, uuid: "" }
        });
        if (res.value) {
            const userInstances: MyAppInstance[] = (res.value.instances || []).map((inst: any) => ({
                instanceUuid: inst.instanceUuid,
                daemonId: inst.daemonId,
                nickname: inst.nickname || inst.config?.nickname || t("TXT_CODE_DESKTOP_IM_UNNAMED"),
                status: inst.status ?? 0,
                hostIp: inst.hostIp || "",
                config: inst.config || undefined,
                info: inst.info || {},
                endTime: inst.endTime
            }));
            instances.value = userInstances;
        }
    } catch (err) {
        console.error("Failed to fetch user instances:", err);
    } finally {
        if (!silent) loading.value = false;
    }
};

const handleStart = async (uuid: string, daemonId: string) => {
    operatingIds.value.add(uuid);
    try {
        await executeOpen({
            params: { uuid, daemonId }
        });
        setTimeout(() => fetchInstances(true), 1000);
    } catch (err) {
        console.error("Failed to start instance:", err);
    } finally {
        operatingIds.value.delete(uuid);
    }
};

const handleStop = async (uuid: string, daemonId: string) => {
    operatingIds.value.add(uuid);
    try {
        await executeStop({
            params: { uuid, daemonId }
        });
        setTimeout(() => fetchInstances(true), 1000);
    } catch (err) {
        console.error("Failed to stop instance:", err);
    } finally {
        operatingIds.value.delete(uuid);
    }
};

const handleRestart = async (uuid: string, daemonId: string) => {
    operatingIds.value.add(uuid);
    try {
        await executeRestart({
            params: { uuid, daemonId }
        });
        setTimeout(() => fetchInstances(true), 1000);
    } catch (err) {
        console.error("Failed to restart instance:", err);
    } finally {
        operatingIds.value.delete(uuid);
    }
};

const handleKill = async (uuid: string, daemonId: string) => {
    operatingIds.value.add(uuid);
    try {
        await executeKill({
            params: { uuid, daemonId }
        });
        setTimeout(() => fetchInstances(true), 1000);
    } catch (err) {
        console.error("Failed to kill instance:", err);
    } finally {
        operatingIds.value.delete(uuid);
    }
};

const isOperating = (uuid: string) => operatingIds.value.has(uuid);

const emit = defineEmits<{
    (e: "open-console", instance: any, daemonId: string): void;
}>();

const handleInstanceDblClick = (instance: MyAppInstance) => {
    if (instance.daemonId) {
        const detail: any = {
            instanceUuid: instance.instanceUuid,
            config: {
                nickname: instance.nickname
            },
            status: instance.status,
            info: instance.info || {}
        };
        emit("open-console", detail, instance.daemonId);
    }
};

onMounted(async () => {
    await fetchInstances();
    refreshTimer = setInterval(() => fetchInstances(true), 10000);
});

onUnmounted(() => {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
});
</script>

<template>
    <div class="ma">
        <div class="ma-toolbar">
            <div class="ma-toolbar__left">
                <div class="ma-select">
                    <select v-model="statusFilter" class="ma-select__input">
                        <option value="all">{{ t("TXT_CODE_DESKTOP_IM_ALL_STATUS") }}</option>
                        <option :value="String(INSTANCE_STATUS_CODE.RUNNING)">
                            {{ t("TXT_CODE_DESKTOP_IM_RUNNING") }}
                        </option>
                        <option :value="String(INSTANCE_STATUS_CODE.STOPPED)">
                            {{ t("TXT_CODE_DESKTOP_IM_STOPPED") }}
                        </option>
                        <option :value="String(INSTANCE_STATUS_CODE.STARTING)">
                            {{ t("TXT_CODE_DESKTOP_IM_STARTING") }}
                        </option>
                        <option :value="String(INSTANCE_STATUS_CODE.STOPPING)">
                            {{ t("TXT_CODE_DESKTOP_IM_STOPPING") }}
                        </option>
                    </select>
                </div>
            </div>

            <div class="ma-toolbar__right">
                <div class="ma-search">
                    <input v-model="searchText" type="text" class="ma-search__input"
                        :placeholder="t('TXT_CODE_DESKTOP_IM_SEARCH')" />
                    <span class="ma-search__icon">
                        <SearchOutlined />
                    </span>
                </div>

                <button class="ma-btn ma-btn--icon" @click="fetchInstances()">
                    <LoadingOutlined v-if="loading" />
                    <ReloadOutlined v-else />
                </button>
            </div>
        </div>

        <div class="ma-stats">
            <div class="ma-stats__item">
                <span class="ma-stats__dot ma-stats__dot--total"></span>
                <span>{{ t("TXT_CODE_DESKTOP_IM_TOTAL") }}: {{ instanceCounts.total }}</span>
            </div>
            <div class="ma-stats__item">
                <span class="ma-stats__dot ma-stats__dot--running"></span>
                <span>{{ t("TXT_CODE_DESKTOP_IM_RUNNING") }}: {{ instanceCounts.running }}</span>
            </div>
            <div class="ma-stats__item">
                <span class="ma-stats__dot ma-stats__dot--stopped"></span>
                <span>{{ t("TXT_CODE_DESKTOP_IM_STOPPED") }}: {{ instanceCounts.stopped }}</span>
            </div>
        </div>

        <div class="ma-list" :class="{ 'ma-list--loading': loading }">
            <div v-if="loading && instances.length === 0" class="ma-empty">
                <div class="ma-spinner"></div>
                <p>{{ t("TXT_CODE_DESKTOP_IM_LOADING") }}</p>
            </div>

            <div v-else-if="filteredInstances.length === 0" class="ma-empty">
                <span class="ma-empty__icon">
                    <InboxOutlined />
                </span>
                <p>{{ t("TXT_CODE_DESKTOP_IM_NO_INSTANCES") }}</p>
            </div>

            <div v-for="instance in filteredInstances" :key="instance.instanceUuid" class="ma-instance"
                :class="{ 'ma-instance--operating': isOperating(instance.instanceUuid) }"
                @click="handleInstanceDblClick(instance)">
                <div class="ma-instance__info">
                    <div class="ma-instance__header">
                        <span class="ma-instance__status" :class="getStatusClass(instance.status)">
                            <component :is="getStatusIconComponent(instance.status)" />
                        </span>
                        <span class="ma-instance__name">{{
                            instance.nickname || t("TXT_CODE_DESKTOP_IM_UNNAMED")
                        }}</span>
                        <span class="ma-instance__badge" :class="getStatusClass(instance.status)">
                            {{ getStatusText(instance.status) }}
                        </span>
                    </div>
                    <div class="ma-instance__meta">
                        <span class="ma-instance__expire"
                            :title="instance.endTime ? new Date(instance.endTime).toLocaleString() : t('TXT_CODE_DESKTOP_IM_PERMANENT')">
                            {{ instance.endTime ? new Date(instance.endTime).toLocaleString() :
                                t('TXT_CODE_DESKTOP_IM_PERMANENT') }}
                        </span>
                        <span v-if="instance.config?.type" class="ma-instance__type">
                            {{ instance.config.type }}
                        </span>
                        <span v-if="
                            instance.info?.currentPlayers !== undefined &&
                            instance.info?.maxPlayers !== undefined &&
                            instance.info.maxPlayers > 0 &&
                            instance.status === INSTANCE_STATUS_CODE.RUNNING
                        " class="ma-instance__players">
                            <TeamOutlined /> {{ instance.info.currentPlayers }}/{{ instance.info.maxPlayers }}
                        </span>
                    </div>
                </div>

                <div class="ma-instance__actions">
                    <button v-if="instance.status === INSTANCE_STATUS_CODE.STOPPED" class="ma-action ma-action--start"
                        :disabled="isOperating(instance.instanceUuid)" :title="t('TXT_CODE_DESKTOP_IM_START')"
                        @click.stop="handleStart(instance.instanceUuid, instance.daemonId)">
                        <CaretRightOutlined />
                    </button>
                    <button v-if="instance.status === INSTANCE_STATUS_CODE.RUNNING" class="ma-action ma-action--restart"
                        :disabled="isOperating(instance.instanceUuid)" :title="t('TXT_CODE_DESKTOP_IM_RESTART')"
                        @click.stop="handleRestart(instance.instanceUuid, instance.daemonId)">
                        <ReloadOutlined />
                    </button>
                    <button v-if="instance.status === INSTANCE_STATUS_CODE.RUNNING" class="ma-action ma-action--stop"
                        :disabled="isOperating(instance.instanceUuid)" :title="t('TXT_CODE_DESKTOP_IM_STOP')"
                        @click.stop="handleStop(instance.instanceUuid, instance.daemonId)">
                        <StopOutlined />
                    </button>
                    <button v-if="
                        instance.status === INSTANCE_STATUS_CODE.RUNNING ||
                        instance.status === INSTANCE_STATUS_CODE.STOPPING
                    " class="ma-action ma-action--kill" :disabled="isOperating(instance.instanceUuid)"
                        :title="t('TXT_CODE_DESKTOP_IM_KILL')"
                        @click.stop="handleKill(instance.instanceUuid, instance.daemonId)">
                        <CloseCircleOutlined />
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.ma {
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--desktop-window-text);
    font-size: 13px;
}

.ma-toolbar {
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

.ma-select {
    display: flex;
    align-items: center;
    gap: 6px;

    &__input {
        background: var(--desktop-window-titlebar-bg);
        border: 1px solid var(--desktop-window-border);
        border-radius: 6px;
        color: var(--desktop-window-text);
        padding: 6px 10px;
        font-size: 12px;
        outline: none;
        cursor: pointer;
        max-width: 200px;

        &:focus {
            border-color: rgba(22, 119, 255, 0.5);
        }

        option {
            background: var(--desktop-window-bg);
            color: var(--desktop-window-text);
        }
    }
}

.ma-search {
    position: relative;

    &__input {
        background: var(--desktop-window-titlebar-bg);
        border: 1px solid var(--desktop-window-border);
        border-radius: 6px;
        color: var(--desktop-window-text);
        padding: 6px 10px 6px 28px;
        font-size: 12px;
        outline: none;
        width: 180px;
        transition: all 0.2s;

        &::placeholder {
            color: var(--desktop-window-text-muted);
        }

        &:focus {
            border-color: rgba(22, 119, 255, 0.5);
            width: 220px;
        }
    }

    &__icon {
        position: absolute;
        left: 8px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 12px;
        pointer-events: none;
        display: flex;
        align-items: center;
    }
}

.ma-btn {
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

    &--icon {
        padding: 6px 8px;
        font-size: 14px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
    }
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

.ma-stats {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--desktop-window-border);
    font-size: 12px;
    color: var(--desktop-window-text-muted);
    flex-wrap: wrap;

    &__item {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    &__dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;

        &--total {
            background: #1677ff;
        }

        &--running {
            background: #52c41a;
        }

        &--stopped {
            background: #8c8c8c;
        }
    }
}

.ma-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;

    &--loading {
        opacity: 0.7;
    }

    &::-webkit-scrollbar {
        width: 6px;
    }

    &::-webkit-scrollbar-thumb {
        background: var(--desktop-window-border);
        border-radius: 3px;
    }

    &::-webkit-scrollbar-track {
        background: transparent;
    }
}

.ma-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 16px;
    color: var(--desktop-window-text-muted);

    &__icon {
        font-size: 36px;
        margin-bottom: 12px;
    }

    p {
        margin: 8px 0 0;
        font-size: 13px;
    }
}

.ma-spinner {
    width: 28px;
    height: 28px;
    border: 3px solid var(--desktop-window-border);
    border-top-color: #1677ff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 8px;
}

.ma-instance {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    margin-bottom: 4px;
    border-radius: 8px;
    background: var(--desktop-window-titlebar-bg);
    border: 1px solid var(--desktop-window-border);
    transition: all 0.2s;
    cursor: default;
    user-select: none;

    &:hover {
        background: var(--desktop-window-control-hover);
        border-color: var(--desktop-window-border);
    }

    &--operating {
        opacity: 0.6;
        pointer-events: none;
    }

    &__info {
        flex: 1;
        min-width: 0;
    }

    &__header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
    }

    &__status {
        font-size: 12px;
        line-height: 1;
        display: flex;
        align-items: center;
    }

    &__name {
        font-size: 13px;
        font-weight: 500;
        color: var(--desktop-window-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 300px;
    }

    &__badge {
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

        &.status--starting,
        &.status--stopping {
            background: rgba(250, 173, 20, 0.15);
            color: #faad14;
        }

        &.status--busy {
            background: rgba(255, 77, 79, 0.15);
            color: #ff4d4f;
        }
    }

    &__meta {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 11px;
        color: var(--desktop-window-text-muted);
    }

    &__expire {
        font-size: 11px;
        color: var(--desktop-window-text-muted);
    }

    &__type {
        background: var(--desktop-window-control-hover);
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 10px;
    }

    &__players {
        font-size: 11px;
        color: var(--desktop-window-text-muted);
        display: flex;
        align-items: center;
        gap: 4px;
    }

    &__actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
        margin-left: 12px;
    }
}

.ma-action {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--desktop-window-titlebar-bg);
    line-height: 1;

    &:hover:not(:disabled) {
        transform: scale(1.1);
    }

    &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }

    &--start {
        color: #52c41a;

        &:hover:not(:disabled) {
            background: rgba(82, 196, 26, 0.2);
        }
    }

    &--stop {
        color: #faad14;

        &:hover:not(:disabled) {
            background: rgba(250, 173, 20, 0.2);
        }
    }

    &--restart {
        color: #1677ff;

        &:hover:not(:disabled) {
            background: rgba(22, 119, 255, 0.2);
        }
    }

    &--kill {
        color: #ff4d4f;

        &:hover:not(:disabled) {
            background: rgba(255, 77, 79, 0.2);
        }
    }
}
</style>
