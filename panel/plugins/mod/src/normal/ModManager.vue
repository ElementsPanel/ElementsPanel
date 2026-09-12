<script setup lang="ts">
import BetweenMenus from "@/components/BetweenMenus.vue";
import CardPanel from "@/components/CardPanel.vue";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useInstanceInfo } from "@/hooks/useInstance";
import { useScreen } from "@/hooks/useScreen";
import type { LayoutCard } from "@/types";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { FrontendFileManagerService } from "@/plugin";
import { usePluginService } from "@/plugin/context";
import { VAlert, VBadge, VBtn, VCol, VIcon, VRow, VSelect, VTab, VTabs, VTextField, VWindow, VWindowItem } from "vuetify/components";
import LocalModTable from "./mod-manager/LocalModTable.vue";
import ModConfigModal from "./mod-manager/ModConfigModal.vue";
import ModFloatingTools from "./mod-manager/ModFloatingTools.vue";
import ModVersionModal from "./mod-manager/ModVersionModal.vue";
import SearchModTable from "./mod-manager/SearchModTable.vue";

import { Modal } from "@/tools/vuetifyModal";
import { message } from "@/tools/vuetifyToast";
import { useDeferredTasks } from "./mod-manager/useDeferredTasks";
import { useLocalMods } from "./mod-manager/useLocalMods";
import { useModConfig } from "./mod-manager/useModConfig";
import { useModSearch } from "./mod-manager/useModSearch";
import { useModUpload } from "./mod-manager/useModUpload";

// Tab key constants
const TAB_KEY_MODS = "TAB_KEY_MODS";
const TAB_KEY_PLUGINS = "TAB_KEY_PLUGINS";
const TAB_KEY_DOWNLOAD = "TAB_KEY_DOWNLOAD";

const props = defineProps<{
  card: LayoutCard;
}>();

const { t } = useI18n();
const { isPhone } = useScreen();
const { getMetaOrRouteValue } = useLayoutCardTools(props.card);
const instanceId = getMetaOrRouteValue("instanceId");
const daemonId = getMetaOrRouteValue("daemonId");

const { instanceInfo, isRunning: isInstanceRunning } = useInstanceInfo({
  instanceId,
  daemonId,
  autoRefresh: true
});

const activeKey = ref(TAB_KEY_MODS);
const headerSearchQuery = ref("");

const isWindows = computed(() => {
  const config = instanceInfo.value?.config;
  // 1. Check CRLF flag (2 is Windows)
  if (config?.crlf === 2) return true;
  // 2. Check CWD path format (if it starts with C:\ or contains backslash \, it's Windows)
  const cwd = config?.cwd || "";
  if (/^[a-zA-Z]:\\/.test(cwd) || cwd.includes("\\")) return true;
  return false;
});
const isRunning = computed(() => {
  const s = instanceInfo.value?.status;
  return s === 2 || s === 3;
});

// Remove debug logs
// watch([isWindows, isRunning], ([win, run]) => { ... });

const checkAndConfirm = async (
  type: string,
  name: string,
  data: any,
  immediateFn: () => Promise<void>
) => {
  if (isWindows.value && isRunning.value) {
    const { createVNode } = await import("vue");
    Modal.confirm({
      title: t("TXT_CODE_MOD_WIN_FILE_LOCK_TITLE"),
      icon: createVNode("i", { class: "mdi mdi-alert-circle-outline" }),
      content: t("TXT_CODE_MOD_WIN_FILE_LOCK_DESC"),
      okText: t("TXT_CODE_MOD_ADD_TO_QUEUE"),
      cancelText: t("TXT_CODE_MOD_TRY_IMMEDIATELY"),
      closable: true,
      maskClosable: true,
      footer: createVNode(
        "div",
        {
          style: {
            marginTop: "24px",
            textAlign: "right",
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px"
          }
        },
        [
          createVNode(
            VBtn,
            {
              variant: "text",
              onClick: () => {
                Modal.destroyAll();
              }
            },
            { default: () => t("TXT_CODE_a0451c97") }
          ),
          createVNode(
            VBtn,
            {
              color: "error",
              onClick: () => {
                Modal.destroyAll();
                immediateFn();
              }
            },
            { default: () => t("TXT_CODE_MOD_TRY_IMMEDIATELY") }
          ),
          createVNode(
            VBtn,
            {
              color: "primary",
              onClick: () => {
                Modal.destroyAll();
                addDeferredTask(type, name, data);
              }
            },
            { default: () => t("TXT_CODE_MOD_ADD_TO_QUEUE") }
          )
        ]
      )
    });
  } else {
    await immediateFn();
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
} = useDeferredTasks(instanceId!, daemonId!, async () => {
  await loadMods();
});

watch(
  () => isInstanceRunning.value,
  (running) => {
    if (!running) {
      // When the server stops, refresh the list immediately to get the latest status (file locks are released)
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
} = useLocalMods(instanceId!, daemonId!, checkAndConfirm, addDeferredTask);

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
  formatDate
} = useModSearch(instanceId!, daemonId!, () => mods.value, loadMods, folders);

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

const {
  opacity,
  handleDragover,
  handleDragleave,
  handleDrop,
  onUploadClick,
  onFileChange,
  fileInput
} = useModUpload(instanceId!, daemonId!, activeKey, loadMods);

const FileEditorDialog = ref();

/**
 * The file editor belongs to `plugins/file`. Resolved through a
 * `computed` so the dialog appears and disappears with the plugin; without it
 * the button that opens it simply has nothing to open.
 */
const fileEditorComponent = computed(
  () => usePluginService<FrontendFileManagerService>("file")?.FileEditor
);


const { showConfigModal, currentMod, configFiles, configLoading, openConfig, editFile } =
  useModConfig(instanceId!, daemonId!, FileEditorDialog);

const hasModsFolder = computed(() => folders.value.includes("mods"));
const hasPluginsFolder = computed(() => folders.value.includes("plugins"));

watch(
  [hasModsFolder, hasPluginsFolder, loading],
  ([hasMods, hasPlugins, isLoading]) => {
    if (isLoading) return;
    // If currently on a valid tab (Mod list, Plugin list, or Download page), do not auto-jump
    if (hasMods && activeKey.value === TAB_KEY_MODS) return;
    if (hasPlugins && activeKey.value === TAB_KEY_PLUGINS) return;
    if (activeKey.value === TAB_KEY_DOWNLOAD) return;

    // Only perform initial jump if the current tab is invalid (e.g., just entered the page or folder status changed)
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
    (m) =>
      (m.name || "").toLowerCase().includes(query) || (m.file || "").toLowerCase().includes(query)
  );
};

const filteredMods = computed(() => {
  // Backend already filters by folder, just apply local search
  return filterBySearch(mods.value);
});

const filteredPlugins = computed(() => {
  // Backend already filters by folder, just apply local search
  return filterBySearch(mods.value);
});

const columns = computed(() => {
  const cols: any[] = [
    {
      title: "",
      key: "icon",
      dataIndex: "icon",
      width: isPhone.value ? 50 : 60,
      align: "center"
    },
    {
      title: t("TXT_CODE_NAME"),
      key: "name",
      dataIndex: "name",
      sorter: (a: any, b: any) => (a.name || "").localeCompare(b.name || "")
    }
  ];

  if (!isPhone.value) {
    cols.push(
      {
        title: t("TXT_CODE_VERSION"),
        key: "version",
        dataIndex: "version",
        width: 140
      },
      {
        title: t("TXT_CODE_STATUS"),
        key: "enabled",
        dataIndex: "enabled",
        width: 100,
        align: "center",
        sorter: (a: any, b: any) => (a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1)
      }
    );
  }

  cols.push({
    title: t("TXT_CODE_OPERATE"),
    key: "action",
    dataIndex: "action",
    width: isPhone.value ? 90 : 160,
    align: "center"
  });

  return cols;
});

const searchColumns = computed(() => {
  const cols: any[] = [
    { title: "", key: "icon", dataIndex: "icon", width: isPhone.value ? 50 : 60, align: "center" },
    {
      title: t("TXT_CODE_NAME"),
      key: "name",
      dataIndex: "name"
    }
  ];

  if (!isPhone.value) {
    cols.push(
      {
        title: t("TXT_CODE_VERSION"),
        key: "version",
        dataIndex: "version",
        width: 160,
        align: "left"
      },
      {
        title: t("TXT_CODE_TYPE"),
        key: "type",
        dataIndex: "type",
        width: 100,
        align: "center"
      },
      {
        title: t("TXT_CODE_SOURCE"),
        key: "source",
        dataIndex: "source",
        width: 120,
        align: "center"
      }
    );
  }

  cols.push({
    title: t("TXT_CODE_OPERATE"),
    key: "action",
    dataIndex: "action",
    width: isPhone.value ? 90 : 120,
    align: "center"
  });

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

// Handle tab change event
const handleTabChange = (newKey: unknown) => {
  const key = String(newKey);
  tablePagination.current = 1; // Reset to first page on tab change
  if (key === TAB_KEY_MODS || key === TAB_KEY_PLUGINS) {
    loadMods(key === TAB_KEY_MODS ? "mods" : "plugins");
  }
};

onMounted(async () => {
  loadMods(getCurrentFolder());
  loadMcVersions();
});
</script>

<template>
  <div class="container">
    <VRow dense>
      <VCol cols="12">
        <BetweenMenus>
          <template #left>
            <h4 v-if="!isPhone" class="text-h6 mb-0">
              <VIcon icon="mdi-apps" class="mr-1" />
              {{ t("TXT_CODE_MOD_MANAGER") }}
            </h4>
            <div v-else style="width: 40px"></div>
          </template>
          <template #center>
            <div v-if="activeKey === TAB_KEY_MODS || activeKey === TAB_KEY_PLUGINS" class="search-input">
              <VTextField v-model="headerSearchQuery" :placeholder="t('TXT_CODE_SEARCH_PLACEHOLDER')" clearable density="compact" append-inner-icon="mdi-magnify" :style="isPhone ? 'width: 180px' : 'width: 300px'" hide-details />
            </div>
          </template>
          <template #right>
            <div class="d-flex ga-2">
              <VBtn v-if="activeKey === TAB_KEY_MODS || activeKey === TAB_KEY_PLUGINS" variant="tonal" @click="onUploadClick">
                  <VIcon start icon="mdi-upload" />
                {{ t("TXT_CODE_ae09d79d") }}
              </VBtn>
              <VBtn v-if="activeKey !== TAB_KEY_DOWNLOAD" color="primary" :loading="loading"
                @click="() => loadMods()">
                  <VIcon start icon="mdi-refresh" />
                {{ t("TXT_CODE_REFRESH") }}
              </VBtn>
            </div>
          </template>
        </BetweenMenus>
      </VCol>

      <VCol cols="12">
        <CardPanel class="containerWrapper" :padding="false">
          <template #body>
            <div :class="isPhone ? 'p-2' : 'p-4'" style="position: relative" @dragover.prevent="handleDragover"
              @dragleave.prevent="handleDragleave" @drop.prevent="handleDrop">
              <div v-if="opacity" class="drag-upload-mask" style="
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
                  z-index: 100;
                  border: 2px dashed var(--color-primary);
                  border-radius: 8px;
                  pointer-events: none;
                ">
                <div class="text-center">
                  <VIcon icon="mdi-upload" size="48" color="primary" />
                  <div class="mt-2 text-lg font-bold" style="color: var(--color-primary)">
                    {{ t("TXT_CODE_DRAG_TO_UPLOAD") }}
                  </div>
                </div>
              </div>

              <VAlert v-if="isWindows && isRunning" type="warning" variant="tonal" class="mb-4 mt-2 mod-manager-alert">
                <template #text>
                  <div class="text-left">
                    <div class="font-bold">{{ t("TXT_CODE_MOD_WIN_FILE_LOCK_TITLE") }}</div>
                    <div class="text-xs opacity-80 font-normal mt-1">
                      {{ t("TXT_CODE_MOD_WIN_RUNNING_ALERT") }}
                    </div>
                  </div>
                </template>
              </VAlert>

              <VTabs v-model="activeKey" class="mod-manager-tabs" @update:model-value="handleTabChange">
                <VTab v-if="hasModsFolder" :value="TAB_KEY_MODS">{{ t("TXT_CODE_MOD_LIST") }} <VBadge v-if="!loading" inline :content="filteredMods.length" color="secondary" /><VIcon v-if="loading || loadingExtra" icon="mdi-loading" size="14" class="loading-icon" /></VTab>
                <VTab v-if="hasPluginsFolder" :value="TAB_KEY_PLUGINS">{{ t("TXT_CODE_PLUGIN_LIST") }} <VBadge v-if="!loading" inline :content="filteredPlugins.length" color="secondary" /><VIcon v-if="loading || loadingExtra" icon="mdi-loading" size="14" class="loading-icon" /></VTab>
                <VTab :value="TAB_KEY_DOWNLOAD">{{ t("TXT_CODE_25bf0004") }}</VTab>
              </VTabs>
              <VWindow v-model="activeKey" :touch="false">
                <VWindowItem v-if="hasModsFolder" :value="TAB_KEY_MODS">
                  <div :class="isPhone ? 'p-2' : 'p-10'">
                    <LocalModTable :key="TAB_KEY_MODS" :loading="loading" :data-source="filteredMods" :columns="columns"
                      :pagination="tablePagination" @change="handleTableChange" @toggle="onToggle" @delete="onDelete"
                      @config="openConfig" @open-external="openExternal" @refresh="loadMods" />
                  </div>
                </VWindowItem>

                <VWindowItem v-if="hasPluginsFolder" :value="TAB_KEY_PLUGINS">
                  <div :class="isPhone ? 'p-2' : 'p-10'">
                    <LocalModTable :key="TAB_KEY_PLUGINS" :loading="loading" :data-source="filteredPlugins"
                      :columns="columns" :pagination="tablePagination" @change="handleTableChange" @toggle="onToggle"
                      @delete="onDelete" @config="openConfig" @open-external="openExternal" @refresh="loadMods" />
                  </div>
                </VWindowItem>

                <VWindowItem :value="TAB_KEY_DOWNLOAD">
                  <div :class="isPhone ? 'p-2' : 'p-10'">
                    <div>
                      <VRow dense class="search-form mt-2">
                        <VCol cols="12" :md="4"><VTextField v-model="searchFilters.query" :placeholder="t('TXT_CODE_SEARCH_PLACEHOLDER')" prepend-inner-icon="mdi-magnify" density="compact" hide-details @keyup.enter="onSearch" /></VCol>
                        <VCol cols="6" :md="2"><VSelect v-model="searchFilters.source" :items="[{ title: t('TXT_CODE_9693b0e1'), value: 'all' }, { title: 'Modrinth', value: 'modrinth' }, { title: 'CurseForge', value: 'curseforge' }, { title: 'SpigotMC', value: 'spigotmc' }]" density="compact" hide-details /></VCol>
                        <VCol cols="6" :md="2"><VSelect v-model="searchFilters.version" :items="[{ title: t('TXT_CODE_2af87548'), value: '' }, ...mcVersions.map((v) => ({ title: v, value: v }))]" :placeholder="t('TXT_CODE_743b4fe7')" clearable density="compact" hide-details /></VCol>
                        <VCol cols="6" :md="2"><VSelect v-model="searchFilters.type" :items="[{ title: t('TXT_CODE_cc4db8f0'), value: 'all' }, { title: t('TXT_CODE_MOD'), value: 'mod' }, { title: t('TXT_CODE_PLUGIN'), value: 'plugin' }]" density="compact" hide-details /></VCol>
                        <VCol cols="6" :md="2"><VSelect v-model="searchFilters.environment" :items="[{ title: t('TXT_CODE_74e77b4c'), value: 'all' }, { title: t('TXT_CODE_SERVER'), value: 'server' }, { title: t('TXT_CODE_CLIENT'), value: 'client' }]" density="compact" hide-details /></VCol>
                        <VCol cols="6" :md="2"><VSelect v-model="searchFilters.loader" :items="loaderOptions.flatMap((group) => group.options)" :placeholder="t('TXT_CODE_SELECT_LOADER')" clearable density="compact" hide-details /></VCol>
                      </VRow>
                      <div class="d-flex ga-2 justify-end mt-2">
                        <VBtn color="primary" :loading="searchLoading" @click="onSearch"><VIcon start icon="mdi-magnify" />{{ t("TXT_CODE_SEARCH") }}</VBtn>
                        <VBtn variant="tonal" @click="resetSearch">{{ t("TXT_CODE_880fedf7") }}</VBtn>
                      </div>
                    </div>
                    <SearchModTable :loading="searchLoading" :data-source="searchResults" :columns="searchColumns"
                      :mods="mods" :pagination="{
                        current: searchPage,
                        pageSize: searchLimit,
                        total: searchTotal,
                        showSizeChanger: true,
                        pageSizeOptions: ['10', '20', '50'],
                        showTotal: (total: number) => t('TXT_CODE_TOTAL_ITEMS', { total })
                      }" @change="(p: any) => onSearch(p.current, p.pageSize)" @show-versions="showVersions"
                      @open-external="openExternal" @download="handleDownload" />
                  </div>
                </VWindowItem>
              </VWindow>

              <ModVersionModal v-model:visible="showVersionModal" :selected-mod="selectedMod" :versions="versions"
                :versions-loading="versionsLoading" :search-filters="searchFilters" :mods="mods"
                @download="handleDownload" />

              <ModConfigModal v-model:visible="showConfigModal" :current-mod="currentMod" :config-files="configFiles"
                :config-loading="configLoading" @edit="editFile" />

              <component :is="fileEditorComponent" v-if="fileEditorComponent" ref="FileEditorDialog" :daemon-id="daemonId!" :instance-id="instanceId!" />
            </div>
          </template>
        </CardPanel>
      </VCol>
    </VRow>

    <ModFloatingTools v-model:deferred-tasks="deferredTasks" v-model:auto-execute="autoExecute"
      :instance-id="instanceId!" :daemon-id="daemonId!" :file-status="fileStatus" :is-executing="isExecuting"
      @execute-task="executeDeferredTask" @execute-all="executeAllDeferredTasks" @remove-task="removeDeferredTask"
      @refresh="loadMods" />

    <input ref="fileInput" type="file" multiple style="display: none" accept=".jar,.zip" @change="onFileChange" />
  </div>
</template>

<style scoped>
.containerWrapper {
  overflow: hidden;
}

.mod-manager-tabs {
  margin-bottom: 0;
  padding: 0 20px;
}

@media (max-width: 585px) {
  :deep(.menus-item-center) {
    width: auto !important;
    flex: 1 !important;
    justify-content: center !important;
  }

  :deep(.menus-item-left),
  :deep(.menus-item-right) {
    display: flex !important;
    flex: 0 0 auto !important;
  }
}

.search-form {
  margin-bottom: 20px;
}

.mod-manager-alert {
  padding: 10px 18px !important;
}

.mod-manager-alert :deep(.v-alert__content) {
  text-align: left !important;
}

.search-form :deep(.v-field__input) {
  text-align: left !important;
}

</style>
