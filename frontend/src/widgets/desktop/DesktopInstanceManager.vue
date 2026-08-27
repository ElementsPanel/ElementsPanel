<script setup lang="ts">
import { useInstanceTagSearch, useInstanceTagTips } from "@/hooks/useInstanceTag";
import { t } from "@/lang/i18n";
import { remoteInstances, remoteNodeList } from "@/services/apis";
import {
    batchDelete,
    batchKill,
    batchRestart,
    batchStart,
    batchStop,
    killInstance,
    openInstance,
    restartInstance,
    stopInstance
} from "@/services/apis/instance";
import { reportErrorMsg } from "@/tools/validator";
import type { InstanceDetail, NodeStatus } from "@/types";
import { INSTANCE_STATUS_CODE } from "@/types/const";
import {
    ApiOutlined,
    CaretRightOutlined,
    ClockCircleOutlined,
    CloseCircleOutlined,
    CloseOutlined,
    DeleteOutlined,
    DownOutlined,
    ExclamationCircleOutlined,
    InboxOutlined,
    LeftOutlined,
    LoadingOutlined,
    MinusCircleOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    PlusOutlined,
    QuestionCircleOutlined,
    RedoOutlined,
    ReloadOutlined,
    RightOutlined,
    SearchOutlined,
    StopOutlined,
    TeamOutlined,
    WarningOutlined
} from "@ant-design/icons-vue";
import { notification } from "ant-design-vue";
import { computed, onMounted, onUnmounted, ref, type Component } from "vue";
import DesktopWindow from "./DesktopWindow.vue";

const nodes = ref<NodeStatus[]>([]);
const selectedNodeId = ref<string>("");
const instances = ref<InstanceDetail[]>([]);
const loading = ref(false);
const searchText = ref("");
const statusFilter = ref<string>("all");
const currentPage = ref(1);
const totalPages = ref(1);
const pageSize = 20;
const operatingIds = ref<Set<string>>(new Set());

const multipleMode = ref(false);
const selectedInstance = ref<InstanceDetail[]>([]);

const { updateTagTips, tagTips } = useInstanceTagTips();
const {
    tags: selectedTags,
    setRefreshFn,
    selectTag,
    removeTag,
    isTagSelected,
    clearTags
} = useInstanceTagSearch();

let refreshTimer: ReturnType<typeof setInterval> | null = null;

const deleteDialog = ref<{
    show: boolean;
    deleteFile: boolean;
    loading: boolean;
    uuids: string[];
    paths: string[];
}>({
    show: false,
    deleteFile: false,
    loading: false,
    uuids: [],
    paths: []
});

const windowWidth = ref(window.innerWidth);
const windowHeight = ref(window.innerHeight);

const { execute: executeNodeList } = remoteNodeList();
const { execute: executeRemoteInstances } = remoteInstances();
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
                i.config.nickname.toLowerCase().includes(keyword) ||
                i.instanceUuid.toLowerCase().includes(keyword)
        );
    }
    if (statusFilter.value !== "all") {
        const code = Number(statusFilter.value) as INSTANCE_STATUS_CODE;
        list = list.filter((i) => i.status === code);
    }
    return list;
});

const selectedNode = computed(() => nodes.value.find((n) => n.uuid === selectedNodeId.value));

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

const fetchNodes = async () => {
    try {
        const res = await executeNodeList();
        if (res.value) {
            nodes.value = res.value;
            if (nodes.value.length > 0 && !selectedNodeId.value) {
                selectedNodeId.value = nodes.value[0].uuid;
            }
        }
    } catch (err) {
        console.error("Failed to fetch nodes:", err);
    }
};

const fetchInstances = async (silent = false) => {
    if (!selectedNodeId.value) return;
    if (!silent) loading.value = true;
    try {
        const res = await executeRemoteInstances({
            params: {
                daemonId: selectedNodeId.value,
                page: currentPage.value,
                page_size: pageSize,
                instance_name: searchText.value.trim() || undefined,
                status: statusFilter.value !== "all" ? statusFilter.value : undefined,
                tag: JSON.stringify(selectedTags.value)
            }
        });
        if (res.value) {
            instances.value = res.value.data || [];
            totalPages.value = res.value.maxPage || 1;
            updateTagTips(res.value.allTags || []);
        }
    } catch (err) {
        console.error("Failed to fetch instances:", err);
    } finally {
        if (!silent) loading.value = false;
    }
};

const handleStart = async (uuid: string) => {
    operatingIds.value.add(uuid);
    try {
        await executeOpen({
            params: { uuid, daemonId: selectedNodeId.value }
        });
        setTimeout(() => fetchInstances(true), 1000);
    } catch (err) {
        console.error("Failed to start instance:", err);
    } finally {
        operatingIds.value.delete(uuid);
    }
};

const handleStop = async (uuid: string) => {
    operatingIds.value.add(uuid);
    try {
        await executeStop({
            params: { uuid, daemonId: selectedNodeId.value }
        });
        setTimeout(() => fetchInstances(true), 1000);
    } catch (err) {
        console.error("Failed to stop instance:", err);
    } finally {
        operatingIds.value.delete(uuid);
    }
};

const handleRestart = async (uuid: string) => {
    operatingIds.value.add(uuid);
    try {
        await executeRestart({
            params: { uuid, daemonId: selectedNodeId.value }
        });
        setTimeout(() => fetchInstances(true), 1000);
    } catch (err) {
        console.error("Failed to restart instance:", err);
    } finally {
        operatingIds.value.delete(uuid);
    }
};

const handleKill = async (uuid: string) => {
    operatingIds.value.add(uuid);
    try {
        await executeKill({
            params: { uuid, daemonId: selectedNodeId.value }
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
    (e: "open-console", instance: InstanceDetail, daemonId: string): void;
    (e: "open-new-instance"): void;
}>();

const findInstance = (item: InstanceDetail) => {
    return selectedInstance.value.find((i) => i.instanceUuid === item.instanceUuid);
};

const selectInstance = (item: InstanceDetail) => {
    const index = selectedInstance.value.findIndex((i) => i.instanceUuid === item.instanceUuid);
    if (index !== -1) {
        selectedInstance.value.splice(index, 1);
    } else {
        selectedInstance.value.push(item);
    }
};

const handleInstanceClick = (e: MouseEvent, instance: InstanceDetail) => {
    if (multipleMode.value) {
        e.preventDefault();
        selectInstance(instance);
        return;
    }
    if (selectedNodeId.value) {
        emit("open-console", instance, selectedNodeId.value);
    }
};

const selectAllInstances = () => {
    if (filteredInstances.value.length === selectedInstance.value.length) {
        selectedInstance.value = [];
    } else {
        for (const item of filteredInstances.value) {
            if (findInstance(item)) continue;
            selectedInstance.value.push(item);
        }
    }
};

const exitMultipleMode = () => {
    multipleMode.value = false;
    selectedInstance.value = [];
};

const instanceOperations = [
    {
        title: t("TXT_CODE_57245e94"),
        icon: PlayCircleOutlined,
        click: () => batchOperation("start")
    },
    {
        title: t("TXT_CODE_b1dedda3"),
        icon: PauseCircleOutlined,
        click: () => batchOperation("stop")
    },
    {
        title: t("TXT_CODE_47dcfa5"),
        icon: RedoOutlined,
        click: () => batchOperation("restart")
    },
    {
        title: t("TXT_CODE_7b67813a"),
        icon: CloseOutlined,
        click: () => {
            batchOperation("kill");
        }
    },
    {
        title: t("TXT_CODE_ecbd7449"),
        icon: DeleteOutlined,
        click: () => batchDeleteInstance(false)
    },
    {
        title: t("TXT_CODE_9ef27367"),
        icon: WarningOutlined,
        click: () => batchDeleteInstance(true)
    }
];

const batchOperation = async (actName: "start" | "stop" | "kill" | "restart") => {
    if (selectedInstance.value.length === 0) return reportErrorMsg(t("TXT_CODE_a0a77be5"));
    const operationMap = {
        start: async () => exec(batchStart().execute, t("TXT_CODE_2b5fd76e")),
        stop: async () => exec(batchStop().execute, t("TXT_CODE_4822a21")),
        kill: async () => exec(batchKill().execute, t("TXT_CODE_effefaab")),
        restart: async () => exec(batchRestart().execute, t("TXT_CODE_effefaab"))
    };

    const exec = async (fn: Function, msg: string) => {
        try {
            const state = await fn({
                data: selectedInstance.value.map((item) => ({
                    instanceUuid: item.instanceUuid,
                    daemonId: selectedNodeId.value
                }))
            });
            if (state.value) {
                notification.success({
                    message: msg,
                    description: t("TXT_CODE_1514d08f")
                });
                exitMultipleMode();
                await fetchInstances(true);
            }
        } catch (err: any) {
            console.error(err);
            reportErrorMsg(err.message);
        }
    };

    operationMap[actName]();
};

const batchDeleteInstance = async (deleteFile: boolean) => {
    if (selectedInstance.value.length === 0) return reportErrorMsg(t("TXT_CODE_a0a77be5"));
    const uuids: string[] = [];
    const paths: string[] = [];
    for (const i of selectedInstance.value) {
        uuids.push(i.instanceUuid);
        if (i.config?.cwd) {
            paths.push(i.config.cwd);
        }
    }
    deleteDialog.value = {
        show: true,
        deleteFile,
        loading: false,
        uuids,
        paths
    };
};

const handleDeleteConfirm = async () => {
    const { execute, state } = batchDelete();
    deleteDialog.value.loading = true;
    try {
        await execute({
            params: {
                daemonId: selectedNodeId.value
            },
            data: {
                uuids: deleteDialog.value.uuids,
                deleteFile: deleteDialog.value.deleteFile
            }
        });
        if (state.value) {
            deleteDialog.value.show = false;
            exitMultipleMode();
            notification.success({
                message: t("TXT_CODE_c3c06801"),
                description: t("TXT_CODE_50075e02")
            });
            await fetchInstances(true);
        }
    } catch (err: any) {
        console.error(err);
        reportErrorMsg(err.message);
    } finally {
        deleteDialog.value.loading = false;
    }
};

const handleDeleteCancel = () => {
    deleteDialog.value.show = false;
};

const handleInstanceDblClick = (instance: InstanceDetail) => {
    if (selectedNodeId.value && !multipleMode.value) {
        emit("open-console", instance, selectedNodeId.value);
    }
};

import { watch } from "vue";

watch(selectedNodeId, () => {
    currentPage.value = 1;
    fetchInstances();
});

watch([searchText, statusFilter], () => {
    currentPage.value = 1;
    fetchInstances();
});

onMounted(async () => {
    const updateWindowSize = () => {
        windowWidth.value = window.innerWidth;
        windowHeight.value = window.innerHeight;
    };
    window.addEventListener("resize", updateWindowSize);

    await fetchNodes();
    await fetchInstances();
    setRefreshFn(fetchInstances);
    refreshTimer = setInterval(() => fetchInstances(true), 10000);
});

onUnmounted(() => {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
    window.removeEventListener("resize", () => {
        windowWidth.value = window.innerWidth;
        windowHeight.value = window.innerHeight;
    });
});
</script>

<template>
    <div class="dim">
        <div class="dim-toolbar">
            <div class="dim-toolbar__left">
                <div class="dim-select">
                    <label class="dim-select__label">{{ t("TXT_CODE_DESKTOP_IM_NODE") }}:</label>
                    <select v-model="selectedNodeId" class="dim-select__input">
                        <option v-for="node in nodes" :key="node.uuid" :value="node.uuid">
                            {{ node.remarks || node.ip }}:{{ node.port }}
                            {{ node.available ? "" : ` (${t("TXT_CODE_DESKTOP_IM_OFFLINE")})` }}
                        </option>
                    </select>
                </div>

                <div class="dim-select">
                    <select v-model="statusFilter" class="dim-select__input">
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

            <div class="dim-toolbar__right">
                <div v-if="multipleMode" class="dim-batch-actions">
                    <button class="dim-btn" @click="exitMultipleMode">
                        {{ t("TXT_CODE_5366af54") }}
                    </button>
                    <button class="dim-btn" @click="selectAllInstances">
                        {{ filteredInstances.length === selectedInstance.length ? t("TXT_CODE_df87c46d") :
                            t("TXT_CODE_f466d7a") }}
                    </button>
                    <a-dropdown>
                        <template #overlay>
                            <a-menu>
                                <a-menu-item v-for="item in instanceOperations" :key="item.title" @click="item.click">
                                    <component :is="item.icon" />
                                    {{ item.title }}
                                </a-menu-item>
                            </a-menu>
                        </template>
                        <button class="dim-btn dim-btn--primary">
                            {{ t("TXT_CODE_8fd8bfd3") }}
                            <DownOutlined />
                        </button>
                    </a-dropdown>
                </div>
                <div v-else class="dim-batch-actions">
                    <button class="dim-btn" @click="multipleMode = true">
                        {{ t("TXT_CODE_5cb656b9") }}
                    </button>
                </div>

                <div class="dim-search">
                    <input v-model="searchText" type="text" class="dim-search__input"
                        :placeholder="t('TXT_CODE_DESKTOP_IM_SEARCH')" />
                    <span class="dim-search__icon">
                        <SearchOutlined />
                    </span>
                </div>

                <button class="dim-btn dim-btn--icon" @click="fetchInstances()">
                    <LoadingOutlined v-if="loading" />
                    <ReloadOutlined v-else />
                </button>

                <button class="dim-btn dim-btn--primary" @click="emit('open-new-instance')">
                    <PlusOutlined /> {{ t("TXT_CODE_DESKTOP_IM_NEW_INSTANCE") }}
                </button>
            </div>
        </div>

        <div class="dim-stats">
            <div class="dim-stats__item">
                <span class="dim-stats__dot dim-stats__dot--total"></span>
                <span>{{ t("TXT_CODE_DESKTOP_IM_TOTAL") }}: {{ instanceCounts.total }}</span>
            </div>
            <div class="dim-stats__item">
                <span class="dim-stats__dot dim-stats__dot--running"></span>
                <span>{{ t("TXT_CODE_DESKTOP_IM_RUNNING") }}: {{ instanceCounts.running }}</span>
            </div>
            <div class="dim-stats__item">
                <span class="dim-stats__dot dim-stats__dot--stopped"></span>
                <span>{{ t("TXT_CODE_DESKTOP_IM_STOPPED") }}: {{ instanceCounts.stopped }}</span>
            </div>
            <div v-if="selectedNode" class="dim-stats__node">
                <span>
                    <ApiOutlined /> {{ selectedNode.remarks || selectedNode.ip }}
                </span>
                <span :class="selectedNode.available ? 'dim-stats__online' : 'dim-stats__offline'">
                    {{ selectedNode.available ? t("TXT_CODE_DESKTOP_IM_ONLINE") : t("TXT_CODE_DESKTOP_IM_OFFLINE") }}
                </span>
            </div>
        </div>

        <div v-if="tagTips && tagTips.length > 0" class="dim-tags">
            <a-tag v-if="selectedTags.length > 0" color="red" class="dim-tag" @click="clearTags">
                {{ t("TXT_CODE_7333c7f7") }}
            </a-tag>
            <a-tag v-for="item in tagTips" :key="item" class="dim-tag"
                :class="{ 'dim-tag--active': isTagSelected(item) }"
                @click="isTagSelected(item) ? removeTag(item) : selectTag(item)">
                {{ item }}
            </a-tag>
        </div>

        <div class="dim-list" :class="{ 'dim-list--loading': loading }">
            <div v-if="loading && instances.length === 0" class="dim-empty">
                <div class="dim-spinner"></div>
                <p>{{ t("TXT_CODE_DESKTOP_IM_LOADING") }}</p>
            </div>

            <div v-else-if="filteredInstances.length === 0" class="dim-empty">
                <span class="dim-empty__icon">
                    <InboxOutlined />
                </span>
                <p>{{ t("TXT_CODE_DESKTOP_IM_NO_INSTANCES") }}</p>
            </div>

            <div v-for="instance in filteredInstances" :key="instance.instanceUuid" class="dim-instance"
                :class="{ 'dim-instance--operating': isOperating(instance.instanceUuid), 'dim-instance--selected': findInstance(instance) }"
                @click="handleInstanceClick($event, instance)">
                <div class="dim-instance__info">
                    <div class="dim-instance__header">
                        <span class="dim-instance__status" :class="getStatusClass(instance.status)">
                            <component :is="getStatusIconComponent(instance.status)" />
                        </span>
                        <span class="dim-instance__name">{{
                            instance.config.nickname || t("TXT_CODE_DESKTOP_IM_UNNAMED")
                        }}</span><span class="dim-instance__badge" :class="getStatusClass(instance.status)">
                            {{ getStatusText(instance.status) }}
                        </span>
                    </div>
                    <div class="dim-instance__meta">
                        <span class="dim-instance__expire"
                            :title="instance.config.endTime ? new Date(instance.config.endTime).toLocaleString() : t('TXT_CODE_DESKTOP_IM_PERMANENT')">
                            {{ instance.config.endTime ? new Date(instance.config.endTime).toLocaleString() :
                                t('TXT_CODE_DESKTOP_IM_PERMANENT') }}
                        </span>
                        <span v-if="instance.config.type" class="dim-instance__type">
                            {{ instance.config.type }}
                        </span><span v-if="
                            instance.info?.currentPlayers !== undefined &&
                            instance.info?.maxPlayers !== undefined &&
                            instance.info.maxPlayers > 0 &&
                            instance.status === INSTANCE_STATUS_CODE.RUNNING
                        " class="dim-instance__players">
                            <TeamOutlined /> {{ instance.info.currentPlayers }}/{{ instance.info.maxPlayers }}
                        </span>
                    </div>
                </div>

                <div class="dim-instance__actions">
                    <button v-if="instance.status === INSTANCE_STATUS_CODE.STOPPED" class="dim-action dim-action--start"
                        :disabled="isOperating(instance.instanceUuid)" :title="t('TXT_CODE_DESKTOP_IM_START')"
                        @click.stop="handleStart(instance.instanceUuid)">
                        <CaretRightOutlined />
                    </button>
                    <button v-if="instance.status === INSTANCE_STATUS_CODE.RUNNING"
                        class="dim-action dim-action--restart" :disabled="isOperating(instance.instanceUuid)"
                        :title="t('TXT_CODE_DESKTOP_IM_RESTART')" @click.stop="handleRestart(instance.instanceUuid)">
                        <ReloadOutlined />
                    </button>
                    <button v-if="instance.status === INSTANCE_STATUS_CODE.RUNNING" class="dim-action dim-action--stop"
                        :disabled="isOperating(instance.instanceUuid)" :title="t('TXT_CODE_DESKTOP_IM_STOP')"
                        @click.stop="handleStop(instance.instanceUuid)">
                        <StopOutlined />
                    </button>
                    <button v-if="
                        instance.status === INSTANCE_STATUS_CODE.RUNNING ||
                        instance.status === INSTANCE_STATUS_CODE.STOPPING
                    " class="dim-action dim-action--kill" :disabled="isOperating(instance.instanceUuid)"
                        :title="t('TXT_CODE_DESKTOP_IM_KILL')" @click.stop="handleKill(instance.instanceUuid)">
                        <CloseCircleOutlined />
                    </button>
                </div>
            </div>
        </div>

        <div v-if="totalPages > 1" class="dim-pagination">
            <button class="dim-btn dim-btn--sm" :disabled="currentPage <= 1" @click="currentPage--; fetchInstances()">
                <LeftOutlined /> {{ t("TXT_CODE_DESKTOP_IM_PREV") }}
            </button>
            <span class="dim-pagination__info">{{ currentPage }} / {{ totalPages }}</span>
            <button class="dim-btn dim-btn--sm" :disabled="currentPage >= totalPages"
                @click="currentPage++; fetchInstances()">
                {{ t("TXT_CODE_DESKTOP_IM_NEXT") }}
                <RightOutlined />
            </button>
        </div>

        <Teleport to="body">
            <Transition name="dim-dialog-fade">
                <DesktopWindow v-if="deleteDialog.show" id="instance-manager-delete-dialog"
                    :title="deleteDialog.deleteFile ? t('TXT_CODE_9ef27367') : t('TXT_CODE_ecbd7449')"
                    :icon="ExclamationCircleOutlined" :visible="deleteDialog.show" :minimized="false" :maximized="false"
                    :active="true" :initial-width="420" :initial-height="300" :initial-x="windowWidth / 2 - 210"
                    :initial-y="windowHeight / 2 - 120" :z-index="10006" :show-minimize="false" :show-maximize="false"
                    :resizable="false" @close="handleDeleteCancel">
                    <div class="dim-dialog-content">
                        <div class="dim-dialog__body dim-dialog__body--column">
                            <ExclamationCircleOutlined class="dim-dialog__warn-icon" />
                            <p class="dim-dialog__desc">
                                {{ deleteDialog.deleteFile ? t("TXT_CODE_18d2f8ae") : t("TXT_CODE_ac01315a") }}
                            </p>
                            <p v-if="deleteDialog.paths.length === 1" class="dim-dialog__path">
                                {{ t("TXT_CODE_91d70059") }}<br />{{ deleteDialog.paths.join() }}
                            </p>
                        </div>
                        <div class="dim-dialog__footer">
                            <button class="dim-btn dim-btn--default" :disabled="deleteDialog.loading"
                                @click="handleDeleteCancel">
                                {{ t("TXT_CODE_a0451c97") }}
                            </button>
                            <button class="dim-btn dim-btn--danger" :disabled="deleteDialog.loading"
                                @click="handleDeleteConfirm">
                                <LoadingOutlined v-if="deleteDialog.loading" />
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

.dim-select {
    display: flex;
    align-items: center;
    gap: 6px;

    &__label {
        color: var(--desktop-window-text-secondary);
        font-size: 12px;
        white-space: nowrap;
    }

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

.dim-search {
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

    &--icon {
        padding: 6px 8px;
        font-size: 14px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    &--sm {
        padding: 4px 10px;
        font-size: 11px;
    }

    &--primary {
        background: #1677ff;
        border-color: #1677ff;
        color: #fff;

        &:hover:not(:disabled) {
            background: #4096ff;
            border-color: #4096ff;
        }
    }

    &--default {
        background: var(--desktop-window-titlebar-bg);
        border: 1px solid var(--desktop-window-border);

        &:hover:not(:disabled) {
            background: var(--desktop-window-control-hover);
        }
    }

    &--danger {
        background: var(--color-red-5, #ff4d4f);
        border-color: var(--color-red-5, #ff4d4f);
        color: #fff;

        &:hover:not(:disabled) {
            background: var(--color-red-6, #ff7875);
            border-color: var(--color-red-6, #ff7875);
        }
    }
}

.dim-batch-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: 8px;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

.dim-stats {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--desktop-window-border);
    font-size: 12px;
    color: var(--desktop-window-text-secondary);
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

    &__node {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    &__online {
        color: #52c41a;
        font-weight: 500;
    }

    &__offline {
        color: #ff4d4f;
        font-weight: 500;
    }
}

.dim-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--desktop-window-border);

    .dim-tag {
        background: var(--desktop-window-titlebar-bg);
        border: 1px solid var(--desktop-window-border);
        color: var(--desktop-window-text-secondary);
        margin: 0;
        padding: 2px 10px;
        border-radius: 10px;
        font-size: 11px;
        line-height: 18px;
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
            border-color: rgba(22, 119, 255, 0.5);
            color: var(--desktop-window-text);
        }

        &--active {
            background: rgba(22, 119, 255, 0.15);
            border-color: rgba(22, 119, 255, 0.6);
            color: #1677ff;
        }
    }
}

.dim-list {
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
        background: var(--desktop-window-text-muted);
        border-radius: 3px;
    }

    &::-webkit-scrollbar-track {
        background: transparent;
    }
}

.dim-empty {
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

.dim-spinner {
    width: 28px;
    height: 28px;
    border: 3px solid var(--desktop-window-border);
    border-top-color: #1677ff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 8px;
}

.dim-instance {
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

    &--selected {
        background: rgba(22, 119, 255, 0.15);
        border-color: rgba(22, 119, 255, 0.3);
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
        color: var(--desktop-window-text-secondary);
    }

    &__expire {
        font-size: 11px;
        color: var(--desktop-window-text-secondary);
    }

    &__type {
        background: var(--desktop-window-titlebar-bg);
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 10px;
    }

    &__players {
        font-size: 11px;
        color: var(--desktop-window-text-secondary);
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

.dim-action {
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

.dim-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 10px 16px;
    border-top: 1px solid var(--desktop-window-border);

    &__info {
        font-size: 12px;
        color: var(--desktop-window-text-secondary);
    }
}

.dim-dialog-fade-enter-active,
.dim-dialog-fade-leave-active {
    transition: all 0.25s cubic-bezier(0.25, 0.10, 0.25, 1.00);
}

.dim-dialog-fade-enter-from,
.dim-dialog-fade-leave-to {
    opacity: 0;
    transform: scale(0.95);
}

.dim-dialog-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: transparent;
}

.dim-dialog__body {
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

.dim-dialog__warn-icon {
    font-size: 36px;
    color: var(--color-warning, #faad14);
}

.dim-dialog__desc {
    margin: 0;
    color: var(--desktop-window-text);
    font-size: 14px;
    text-align: center;
    line-height: 1.6;
}

.dim-dialog__path {
    margin: 0;
    color: var(--desktop-window-text-secondary);
    font-size: 12px;
    text-align: center;
    line-height: 1.6;
    word-break: break-all;
}

.dim-dialog__footer {
    padding: 12px 20px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--desktop-window-border);
}
</style>
