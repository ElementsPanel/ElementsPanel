<script setup lang="ts">
import { useInstanceInfo } from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import {
    ExclamationCircleOutlined,
    FolderOutlined,
    LoadingOutlined,
    ReloadOutlined,
    SearchOutlined,
    UploadOutlined
} from "@ant-design/icons-vue";
import { Flex, message } from "ant-design-vue";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import LocalModTable from "@instance/widgets/instance/mod-manager/LocalModTable.vue";
import ModConfigModal from "../instance/mod-manager/ModConfigModal.vue";
import ModFloatingTools from "@instance/widgets/instance/mod-manager/ModFloatingTools.vue";
import ModVersionModal from "../instance/mod-manager/ModVersionModal.vue";
import SearchModTable from "@instance/widgets/instance/mod-manager/SearchModTable.vue";
import { useDeferredTasks } from "@instance/widgets/instance/mod-manager/useDeferredTasks";
import { useLocalMods } from "@instance/widgets/instance/mod-manager/useLocalMods";
import { useModConfig } from "@instance/widgets/instance/mod-manager/useModConfig";
import { useModSearch } from "../instance/mod-manager/useModSearch";
import { useModUpload } from "@instance/widgets/instance/mod-manager/useModUpload";
import DesktopWindow from "./DesktopWindow.vue";

const TAB_KEY_MODS = "TAB_KEY_MODS";
const TAB_KEY_PLUGINS = "TAB_KEY_PLUGINS";
const TAB_KEY_DOWNLOAD = "TAB_KEY_DOWNLOAD";

const props = defineProps<{
    instanceId: string;
    daemonId: string;
}>();

const emit = defineEmits<{
    (e: "close"): void;
    (e: "open-file-editor", filePath: string, fileName: string): void;
}>();

const { instanceInfo, isRunning: isInstanceRunning } = useInstanceInfo({
    instanceId: props.instanceId,
    daemonId: props.daemonId,
    autoRefresh: true
});

const activeKey = ref(TAB_KEY_MODS);
const headerSearchQuery = ref("");

const windowWidth = ref(window.innerWidth);
const windowHeight = ref(window.innerHeight);

const updateWindowSize = () => {
    windowWidth.value = window.innerWidth;
    windowHeight.value = window.innerHeight;
};

onMounted(() => {
    window.addEventListener("resize", updateWindowSize);
});

onUnmounted(() => {
    window.removeEventListener("resize", updateWindowSize);
});

const isWindows = computed(() => {
    const config = instanceInfo.value?.config;
    if (config?.crlf === 2) return true;
    const cwd = config?.cwd || "";
    if (/^[a-zA-Z]:\\/.test(cwd) || cwd.includes("\\")) return true;
    return false;
});

const isRunning = computed(() => {
    const s = instanceInfo.value?.status;
    return s === 2 || s === 3;
});

const fileLockDialog = ref({
    show: false,
    type: "",
    name: "",
    data: null as any,
    immediateFn: null as (() => Promise<void>) | null,
    resolve: null as ((value: "cancel" | "immediate" | "queue") => void) | null
});

const checkAndConfirm = async (
    type: string,
    name: string,
    data: any,
    immediateFn: () => Promise<void>
) => {
    if (isWindows.value && isRunning.value) {
        return new Promise<void>((resolve) => {
            fileLockDialog.value = {
                show: true,
                type,
                name,
                data,
                immediateFn,
                resolve: (action: "cancel" | "immediate" | "queue") => {
                    fileLockDialog.value.show = false;
                    if (action === "immediate") {
                        immediateFn().then(resolve);
                    } else if (action === "queue") {
                        addDeferredTask(type, name, data);
                        resolve();
                    } else {
                        resolve();
                    }
                }
            };
        });
    } else {
        await immediateFn();
    }
};

const handleFileLockCancel = () => {
    if (fileLockDialog.value.resolve) {
        fileLockDialog.value.resolve("cancel");
    }
};

const handleFileLockImmediate = () => {
    if (fileLockDialog.value.resolve) {
        fileLockDialog.value.resolve("immediate");
    }
};

const handleFileLockQueue = () => {
    if (fileLockDialog.value.resolve) {
        fileLockDialog.value.resolve("queue");
    }
};

const {
    deferredTasks,
    autoExecute,
    isExecuting,
    addDeferredTask,
    removeDeferredTask,
    executeDeferredTask,
    executeAllDeferredTasks
} = useDeferredTasks(props.instanceId, props.daemonId, async () => {
    await loadMods();
});

watch(
    () => isInstanceRunning.value,
    (running) => {
        if (!running) {
            loadMods();
        }
    }
);

const {
    loading,
    loadingExtra,
    mods,
    folders,
    loadMods: originalLoadMods,
    onToggle,
    onDelete,
    fileStatus,
    tablePagination
} = useLocalMods(props.instanceId, props.daemonId, checkAndConfirm, addDeferredTask);

const getCurrentFolder = () => {
    if (activeKey.value === TAB_KEY_MODS) return "mods";
    if (activeKey.value === TAB_KEY_PLUGINS) return "plugins";
    return undefined;
};

const loadMods = async (folder?: string) => {
    const targetFolder = folder !== undefined ? folder : getCurrentFolder();
    await originalLoadMods(targetFolder);
};

const {
    searchFilters,
    searchLoading,
    searched,
    searchResults,
    searchTotal,
    searchPage,
    searchLimit,
    mcVersions,
    loaderOptions,
    loadMcVersions,
    onSearch,
    resetSearch,
    showVersions,
    onDownload,
    showVersionModal,
    selectedMod,
    versions,
    versionsLoading,
    formatDate,
    saveLocationDialog
} = useModSearch(props.instanceId, props.daemonId, () => mods.value, loadMods, folders, true);

const openExternal = (mod: any) => {
    const { source, id, slug, name } = mod;
    const baseUrlMap: Record<string, string> = {
        Modrinth: `https://modrinth.com/project/${slug || id}`,
        CurseForge: `https://www.curseforge.com/projects/${id}`,
        SpigotMC: `https://www.spigotmc.org/resources/${id}`,
        MCMod: `https://www.mcmod.cn/class/${id}.html`
    };
    const url = baseUrlMap[source];
    if (!url) {
        message.error(t("TXT_CODE_8d2a42a2"));
    } else {
        window.open(url, "_blank");
    }
};

const handleDownload = async (version: any) => {
    const task = await onDownload(version);
    if (task) {
        await checkAndConfirm(task.type, task.name, task.data, task.immediateFn);
    }
};

const handleSaveLocationSelect = (type: "mod" | "plugin") => {
    if (saveLocationDialog.value.resolve) {
        saveLocationDialog.value.resolve(type);
    }
    saveLocationDialog.value.show = false;
    saveLocationDialog.value.resolve = null;
    saveLocationDialog.value.reject = null;
};

const handleSaveLocationCancel = () => {
    if (saveLocationDialog.value.reject) {
        saveLocationDialog.value.reject(new Error("Cancelled"));
    }
    saveLocationDialog.value.show = false;
    saveLocationDialog.value.resolve = null;
    saveLocationDialog.value.reject = null;
};

const {
    opacity,
    handleDragover,
    handleDragleave,
    handleDrop,
    onUploadClick,
    onFileChange,
    fileInput
} = useModUpload(props.instanceId, props.daemonId, activeKey, loadMods);

const { showConfigModal, currentMod, configFiles, configLoading, openConfig } =
    useModConfig(props.instanceId, props.daemonId, ref(null));

const handleEditFile = (file: any) => {
    showConfigModal.value = false;
    emit("open-file-editor", file.path, file.name);
};

const hasModsFolder = computed(() => folders.value.includes("mods"));
const hasPluginsFolder = computed(() => folders.value.includes("plugins"));

watch(
    [hasModsFolder, hasPluginsFolder, loading],
    ([hasMods, hasPlugins, isLoading]) => {
        if (isLoading) return;
        if (hasMods && activeKey.value === TAB_KEY_MODS) return;
        if (hasPlugins && activeKey.value === TAB_KEY_PLUGINS) return;
        if (activeKey.value === TAB_KEY_DOWNLOAD) return;

        if (hasMods) {
            activeKey.value = TAB_KEY_MODS;
            loadMods("mods");
        } else if (hasPlugins) {
            activeKey.value = TAB_KEY_PLUGINS;
            loadMods("plugins");
        } else {
            activeKey.value = TAB_KEY_DOWNLOAD;
        }
    },
    { immediate: true }
);

const filterBySearch = (list: any[]) => {
    if (!headerSearchQuery.value) return list;
    const query = headerSearchQuery.value.toLowerCase();
    return list.filter(
        (m: any) =>
            (m.name || "").toLowerCase().includes(query) || (m.file || "").toLowerCase().includes(query)
    );
};

const filteredMods = computed(() => filterBySearch(mods.value));
const filteredPlugins = computed(() => filterBySearch(mods.value));

const columns = computed(() => {
    const cols: any[] = [
        {
            title: "",
            key: "icon",
            dataIndex: "icon",
            width: 50,
            align: "center"
        },
        {
            title: t("TXT_CODE_NAME"),
            key: "name",
            dataIndex: "name",
            sorter: (a: any, b: any) => (a.name || "").localeCompare(b.name || "")
        },
        {
            title: t("TXT_CODE_VERSION"),
            key: "version",
            dataIndex: "version",
            width: 120
        },
        {
            title: t("TXT_CODE_STATUS"),
            key: "enabled",
            dataIndex: "enabled",
            width: 80,
            align: "center",
            sorter: (a: any, b: any) => (a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1)
        },
        {
            title: t("TXT_CODE_OPERATE"),
            key: "action",
            dataIndex: "action",
            width: 140,
            align: "center"
        }
    ];
    return cols;
});

const searchColumns = computed(() => {
    const cols: any[] = [
        { title: "", key: "icon", dataIndex: "icon", width: 50, align: "center" },
        {
            title: t("TXT_CODE_NAME"),
            key: "name",
            dataIndex: "name"
        },
        {
            title: t("TXT_CODE_VERSION"),
            key: "version",
            dataIndex: "version",
            width: 140,
            align: "left"
        },
        {
            title: t("TXT_CODE_TYPE"),
            key: "type",
            dataIndex: "type",
            width: 80,
            align: "center"
        },
        {
            title: t("TXT_CODE_SOURCE"),
            key: "source",
            dataIndex: "source",
            width: 100,
            align: "center"
        },
        {
            title: t("TXT_CODE_OPERATE"),
            key: "action",
            dataIndex: "action",
            width: 100,
            align: "center"
        }
    ];
    return cols;
});

const handleTableChange = (pagination: any) => {
    if (
        tablePagination.current !== pagination.current ||
        tablePagination.pageSize !== pagination.pageSize
    ) {
        tablePagination.current = pagination.current;
        tablePagination.pageSize = pagination.pageSize;
        loadMods(getCurrentFolder());
    }
};

const handleTabChange = (newKey: string | number) => {
    tablePagination.current = 1;
    if (newKey === TAB_KEY_MODS || newKey === TAB_KEY_PLUGINS) {
        loadMods(newKey === TAB_KEY_MODS ? "mods" : "plugins");
    }
};

onMounted(async () => {
    loadMcVersions();
    await loadMods(getCurrentFolder());
});
</script>

<template>
    <div class="dmm">
        <div v-if="activeKey === TAB_KEY_MODS || activeKey === TAB_KEY_PLUGINS" class="dmm-header">
            <div class="dmm-header__right">
                <div class="dmm-search">
                    <a-input v-model:value="headerSearchQuery" :placeholder="t('TXT_CODE_SEARCH_PLACEHOLDER')"
                        allow-clear size="small" style="width: 200px">
                        <template #suffix>
                            <SearchOutlined />
                        </template>
                    </a-input>
                </div>
                <button class="dmm-btn dmm-btn--sm" @click="onUploadClick" :title="t('TXT_CODE_ae09d79d')">
                    <UploadOutlined /> {{ t("TXT_CODE_ae09d79d") }}
                </button>
                <button class="dmm-btn dmm-btn--sm dmm-btn--primary" :disabled="loading" @click="() => loadMods()"
                    :title="t('TXT_CODE_REFRESH')">
                    <ReloadOutlined :spin="loading" /> {{ t("TXT_CODE_REFRESH") }}
                </button>
            </div>
        </div>

        <div class="dmm-body">
            <div class="dmm-content" @dragover.prevent="handleDragover" @dragleave.prevent="handleDragleave"
                @drop.prevent="handleDrop">
                <div v-if="opacity" class="dmm-drag-overlay">
                    <div class="dmm-drag-overlay__inner">
                        <UploadOutlined class="dmm-drag-overlay__icon" />
                        <div class="dmm-drag-overlay__text">{{ t("TXT_CODE_DRAG_TO_UPLOAD") }}</div>
                    </div>
                </div>

                <a-alert v-if="isWindows && isRunning" type="warning" show-icon class="dmm-alert">
                    <template #message>
                        <div class="text-left">
                            <div class="font-bold">{{ t("TXT_CODE_MOD_WIN_FILE_LOCK_TITLE") }}</div>
                            <div class="text-xs opacity-80 font-normal mt-1">
                                {{ t("TXT_CODE_MOD_WIN_RUNNING_ALERT") }}
                            </div>
                        </div>
                    </template>
                </a-alert>

                <a-tabs v-model:activeKey="activeKey" class="dmm-tabs" destroy-inactive-tab-pane
                    @change="handleTabChange">
                    <a-tab-pane v-if="hasModsFolder" :key="TAB_KEY_MODS">
                        <template #tab>
                            <Flex align="center" :gap="6">
                                {{ t("TXT_CODE_MOD_LIST") }}
                                <a-badge v-if="!loading && activeKey === TAB_KEY_MODS" :count="filteredMods.length"
                                    :show-zero="true" :overflow-count="999" :number-style="{
                                        backgroundColor: '#f0f0f0',
                                        color: '#555',
                                        boxShadow: 'none'
                                    }" size="small" />
                                <LoadingOutlined v-if="loading || loadingExtra"
                                    style="font-size: 12px; color: #1890ff" />
                            </Flex>
                        </template>
                        <div class="dmm-table-wrapper">
                            <LocalModTable :key="TAB_KEY_MODS" :loading="loading" :data-source="filteredMods"
                                :columns="columns" :pagination="tablePagination" @change="handleTableChange"
                                @toggle="onToggle" @delete="onDelete" @config="openConfig" @open-external="openExternal"
                                @refresh="loadMods" />
                        </div>
                    </a-tab-pane>

                    <a-tab-pane v-if="hasPluginsFolder" :key="TAB_KEY_PLUGINS">
                        <template #tab>
                            <Flex align="center" :gap="6">
                                {{ t("TXT_CODE_PLUGIN_LIST") }}
                                <a-badge v-if="!loading && activeKey === TAB_KEY_PLUGINS"
                                    :count="filteredPlugins.length" :show-zero="true" :overflow-count="999"
                                    :number-style="{
                                        backgroundColor: '#f0f0f0',
                                        color: '#555',
                                        boxShadow: 'none'
                                    }" size="small" />
                                <LoadingOutlined v-if="loading || loadingExtra"
                                    style="font-size: 12px; color: #1890ff" />
                            </Flex>
                        </template>
                        <div class="dmm-table-wrapper">
                            <LocalModTable :key="TAB_KEY_PLUGINS" :loading="loading" :data-source="filteredPlugins"
                                :columns="columns" :pagination="tablePagination" @change="handleTableChange"
                                @toggle="onToggle" @delete="onDelete" @config="openConfig" @open-external="openExternal"
                                @refresh="loadMods" />
                        </div>
                    </a-tab-pane>

                    <a-tab-pane :key="TAB_KEY_DOWNLOAD" :tab="t('TXT_CODE_25bf0004')">
                        <div class="dmm-download">
                            <a-form layout="horizontal" :model="searchFilters" class="dmm-search-form">
                                <a-row :gutter="[12, 8]">
                                    <a-col :span="6">
                                        <a-form-item>
                                            <a-input v-model:value="searchFilters.query"
                                                :placeholder="t('TXT_CODE_SEARCH_PLACEHOLDER')" size="small"
                                                @press-enter="onSearch" />
                                        </a-form-item>
                                    </a-col>
                                    <a-col :span="4">
                                        <a-form-item>
                                            <a-select v-model:value="searchFilters.source" size="small">
                                                <a-select-option value="all">
                                                    {{ t("TXT_CODE_9693b0e1") }}
                                                </a-select-option>
                                                <a-select-option value="modrinth">Modrinth</a-select-option>
                                                <a-select-option value="curseforge">CurseForge</a-select-option>
                                                <a-select-option value="spigotmc">SpigotMC</a-select-option>
                                            </a-select>
                                        </a-form-item>
                                    </a-col>
                                    <a-col :span="4">
                                        <a-form-item>
                                            <a-select v-model:value="searchFilters.version" show-search allow-clear
                                                size="small" :placeholder="t('TXT_CODE_743b4fe7')">
                                                <a-select-option value="">
                                                    {{ t("TXT_CODE_2af87548") }}
                                                </a-select-option>
                                                <a-select-option v-for="v in mcVersions" :key="v" :value="v">
                                                    {{ v }}
                                                </a-select-option>
                                            </a-select>
                                        </a-form-item>
                                    </a-col>
                                    <a-col :span="3">
                                        <a-form-item>
                                            <a-select v-model:value="searchFilters.type" size="small">
                                                <a-select-option value="all">
                                                    {{ t("TXT_CODE_cc4db8f0") }}
                                                </a-select-option>
                                                <a-select-option value="mod">
                                                    {{ t("TXT_CODE_MOD") }}
                                                </a-select-option>
                                                <a-select-option value="plugin">
                                                    {{ t("TXT_CODE_PLUGIN") }}
                                                </a-select-option>
                                            </a-select>
                                        </a-form-item>
                                    </a-col>
                                    <a-col :span="3">
                                        <a-form-item>
                                            <a-select v-model:value="searchFilters.environment" size="small">
                                                <a-select-option value="all">
                                                    {{ t("TXT_CODE_74e77b4c") }}
                                                </a-select-option>
                                                <a-select-option value="server">
                                                    {{ t("TXT_CODE_SERVER") }}
                                                </a-select-option>
                                                <a-select-option value="client">
                                                    {{ t("TXT_CODE_CLIENT") }}
                                                </a-select-option>
                                            </a-select>
                                        </a-form-item>
                                    </a-col>
                                    <a-col :span="4">
                                        <a-form-item>
                                            <a-select v-model:value="searchFilters.loader" show-search allow-clear
                                                size="small" :options="loaderOptions" option-filter-prop="label"
                                                style="width: 100%" :placeholder="t('TXT_CODE_SELECT_LOADER')" />
                                        </a-form-item>
                                    </a-col>
                                </a-row>
                                <div class="dmm-search-actions">
                                    <a-button type="primary" size="small" :loading="searchLoading" @click="onSearch">
                                        <template #icon>
                                            <SearchOutlined />
                                        </template>
                                        {{ t("TXT_CODE_SEARCH") }}
                                    </a-button>
                                    <a-button size="small" @click="resetSearch">{{ t("TXT_CODE_880fedf7") }}</a-button>
                                </div>
                            </a-form>
                            <SearchModTable :loading="searchLoading" :data-source="searchResults"
                                :columns="searchColumns" :mods="mods" :pagination="{
                                    current: searchPage,
                                    pageSize: searchLimit,
                                    total: searchTotal,
                                    showSizeChanger: true,
                                    pageSizeOptions: ['10', '20', '50'],
                                    showTotal: (total: number) => t('TXT_CODE_TOTAL_ITEMS', { total })
                                }" @change="(p: any) => onSearch(p.current, p.pageSize)" @show-versions="showVersions"
                                @open-external="openExternal" @download="handleDownload" />
                        </div>
                    </a-tab-pane>
                </a-tabs>

                <ModVersionModal v-model:visible="showVersionModal" :selected-mod="selectedMod" :versions="versions"
                    :versions-loading="versionsLoading" :search-filters="searchFilters" :mods="mods" :is-desktop="true"
                    @download="handleDownload" />

                <ModConfigModal v-model:visible="showConfigModal" :current-mod="currentMod" :config-files="configFiles"
                    :config-loading="configLoading" :is-desktop="true" @edit="handleEditFile" />
            </div>
        </div>

        <ModFloatingTools v-model:deferred-tasks="deferredTasks" v-model:auto-execute="autoExecute"
            :instance-id="props.instanceId" :daemon-id="props.daemonId" :file-status="fileStatus"
            :is-executing="isExecuting" @execute-task="executeDeferredTask" @execute-all="executeAllDeferredTasks"
            @remove-task="removeDeferredTask" @refresh="loadMods" />

        <input ref="fileInput" type="file" multiple style="display: none" accept=".jar,.zip" @change="onFileChange" />

        <Teleport to="body">
            <Transition name="dmm-dialog-fade">
                <DesktopWindow v-if="saveLocationDialog.show" id="mod-save-location-dialog"
                    :title="t('TXT_CODE_MOD_SELECT_SAVE_DIR')" :icon="ExclamationCircleOutlined"
                    :visible="saveLocationDialog.show" :minimized="false" :maximized="false" :active="true"
                    :initial-width="360" :initial-height="220" :initial-x="windowWidth / 2 - 180"
                    :initial-y="windowHeight / 2 - 100" :z-index="10003" :show-minimize="false" :show-maximize="false"
                    :resizable="false" @close="handleSaveLocationCancel">
                    <div class="dmm-dialog-content">
                        <div class="dmm-dialog__body dmm-dialog__body--column">
                            <ExclamationCircleOutlined class="dmm-dialog__warn-icon" />
                            <p class="dmm-dialog__desc">{{ t("TXT_CODE_MOD_SELECT_SAVE_DIR") }}</p>
                        </div>
                        <div class="dmm-dialog__footer">
                            <button class="dmm-dialog-btn dmm-dialog-btn--default" @click="handleSaveLocationCancel">
                                {{ t("TXT_CODE_a0451c97") }}
                            </button>
                            <button class="dmm-dialog-btn dmm-dialog-btn--primary"
                                :class="{ 'dmm-dialog-btn--highlighted': saveLocationDialog.detectedType === 'mod' }"
                                @click="handleSaveLocationSelect('mod')">
                                <FolderOutlined /> {{ t("TXT_CODE_MOD") }}
                            </button>
                            <button class="dmm-dialog-btn dmm-dialog-btn--primary"
                                :class="{ 'dmm-dialog-btn--highlighted': saveLocationDialog.detectedType === 'plugin' }"
                                @click="handleSaveLocationSelect('plugin')">
                                <FolderOutlined /> {{ t("TXT_CODE_PLUGIN") }}
                            </button>
                        </div>
                    </div>
                </DesktopWindow>
            </Transition>
        </Teleport>

        <Teleport to="body">
            <Transition name="dmm-dialog-fade">
                <DesktopWindow v-if="fileLockDialog.show" id="mod-file-lock-dialog"
                    :title="t('TXT_CODE_MOD_WIN_FILE_LOCK_TITLE')" :icon="ExclamationCircleOutlined"
                    :visible="fileLockDialog.show" :minimized="false" :maximized="false" :active="true"
                    :initial-width="400" :initial-height="240" :initial-x="windowWidth / 2 - 200"
                    :initial-y="windowHeight / 2 - 110" :z-index="10004" :show-minimize="false" :show-maximize="false"
                    :resizable="false" @close="handleFileLockCancel">
                    <div class="dmm-dialog-content">
                        <div class="dmm-dialog__body dmm-dialog__body--column">
                            <ExclamationCircleOutlined class="dmm-dialog__warn-icon" />
                            <p class="dmm-dialog__desc">{{ t("TXT_CODE_MOD_WIN_FILE_LOCK_DESC") }}</p>
                        </div>
                        <div class="dmm-dialog__footer">
                            <button class="dmm-dialog-btn dmm-dialog-btn--default" @click="handleFileLockCancel">
                                {{ t("TXT_CODE_a0451c97") }}
                            </button>
                            <button class="dmm-dialog-btn dmm-dialog-btn--danger" @click="handleFileLockImmediate">
                                {{ t("TXT_CODE_MOD_TRY_IMMEDIATELY") }}
                            </button>
                            <button class="dmm-dialog-btn dmm-dialog-btn--primary" @click="handleFileLockQueue">
                                {{ t("TXT_CODE_MOD_ADD_TO_QUEUE") }}
                            </button>
                        </div>
                    </div>
                </DesktopWindow>
            </Transition>
        </Teleport>
    </div>
</template>

<style lang="scss" scoped>
.dmm {
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--desktop-window-text);
    font-size: 13px;
}

.dmm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--desktop-window-border);
    flex-shrink: 0;

    &__left,
    &__right {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    &__title {
        font-size: 13px;
        font-weight: 500;
        color: var(--desktop-window-text);
        display: flex;
        align-items: center;
        gap: 6px;
    }
}

.dmm-btn {
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
        color: #1890ff;
        border-color: rgba(24, 144, 255, 0.3);
        background: rgba(24, 144, 255, 0.1);

        &:hover:not(:disabled) {
            background: rgba(24, 144, 255, 0.2);
        }
    }
}

.dmm-search {
    :deep(.ant-input) {
        background: var(--desktop-window-titlebar-bg);
        border-color: var(--desktop-window-border);
        color: var(--desktop-window-text);
        font-size: 12px;

        &::placeholder {
            color: var(--desktop-window-text-muted);
        }
    }

    :deep(.ant-input-suffix) {
        color: var(--desktop-window-text-muted);
    }
}

.dmm-body {
    flex: 1;
    overflow: hidden;
    position: relative;
}

.dmm-content {
    height: 100%;
    overflow: auto;
    padding: 8px 12px;
    position: relative;
}

.dmm-drag-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 100;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: rgba(128, 128, 128, 0.1);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 2px dashed var(--ant-primary-color);
    border-radius: 8px;
    pointer-events: none;

    &__inner {
        text-align: center;
    }

    &__icon {
        font-size: 48px;
        color: var(--ant-primary-color);
    }

    &__text {
        margin-top: 8px;
        font-size: 16px;
        font-weight: bold;
        color: var(--ant-primary-color);
    }
}

.dmm-alert {
    margin-bottom: 12px;
    padding: 8px 14px !important;

    :deep(.ant-alert-content) {
        text-align: left !important;
    }
}

.dmm-tabs {
    :deep(.ant-tabs-nav) {
        margin-bottom: 0;
    }

    :deep(.ant-tabs-tab) {
        font-size: 12px;
        padding: 6px 12px;
    }
}

.dmm-table-wrapper {
    padding: 8px 0;
}

.dmm-download {
    padding: 8px 0;
}

.dmm-search-form {
    margin-bottom: 12px;

    :deep(.ant-form-item) {
        margin-bottom: 0;
    }

    :deep(.ant-input),
    :deep(.ant-select-selection-item),
    :deep(.ant-select-selection-placeholder) {
        text-align: left !important;
        font-size: 12px;
    }
}

.dmm-search-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 8px;
}

.dmm-dialog-fade-enter-active,
.dmm-dialog-fade-leave-active {
    transition: all 0.25s cubic-bezier(0.25, 0.10, 0.25, 1.00);
}

.dmm-dialog-fade-enter-from,
.dmm-dialog-fade-leave-to {
    opacity: 0;
    transform: scale(0.95);
}

.dmm-dialog-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: transparent;
}

.dmm-dialog__body {
    padding: 20px;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;

    &--column {
        flex-direction: column;
        gap: 12px;
    }
}

.dmm-dialog__warn-icon {
    font-size: 36px;
    color: var(--color-warning, #faad14);
}

.dmm-dialog__desc {
    margin: 0;
    color: var(--desktop-window-text);
    font-size: 14px;
    text-align: center;
    line-height: 1.6;
}

.dmm-dialog__footer {
    padding: 12px 20px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--desktop-window-border);
}

.dmm-dialog-btn {
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

    &--danger {
        background: var(--color-red-5, #ff4d4f);
        color: #fff;
        border-color: var(--color-red-5, #ff4d4f);

        &:hover:not(:disabled) {
            background: var(--color-red-6, #ff7875);
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
</style>
