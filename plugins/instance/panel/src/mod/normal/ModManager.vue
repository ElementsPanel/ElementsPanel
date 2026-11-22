<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import PageToolbar from "@elementspanel/epanel-plugin-console/components/PageToolbar";
import CardPanel from "@elementspanel/epanel-plugin-console/components/CardPanel";
import { useInstanceInfo } from "@elementspanel/epanel-plugin-console/hooks/useInstance";
import { useScreen } from "@elementspanel/epanel-plugin-console/hooks/useScreen";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import type { FrontendFileManagerService } from "@elements-panel/sdk";
import { usePluginService } from "@elements-panel/sdk";
import { VAlert, VBadge, VBtn, VCol, VIcon, VProgressCircular, VRow, VSelect, VTab, VTabs, VTextField, VWindow, VWindowItem } from "vuetify/components";
import LocalModTable from "./mod-manager/LocalModTable.vue";
import ModConfigModal from "./mod-manager/ModConfigModal.vue";
import ModVersionModal from "./mod-manager/ModVersionModal.vue";
import SearchModTable from "./mod-manager/SearchModTable.vue";

import { Modal } from "@elementspanel/epanel-plugin-console/tools/vuetifyModal";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { useDeferredTasks } from "./mod-manager/useDeferredTasks";
import { useLocalMods } from "./mod-manager/useLocalMods";
import { useModConfig } from "./mod-manager/useModConfig";
import { useModSearch } from "./mod-manager/useModSearch";
import { useModUpload } from "./mod-manager/useModUpload";

const TAB_KEY_MODS = "TAB_KEY_MODS";
const TAB_KEY_PLUGINS = "TAB_KEY_PLUGINS";
const TAB_KEY_DOWNLOAD = "TAB_KEY_DOWNLOAD";

const { t } = useI18n();
const { isPhone } = useScreen();
const route = useRoute();
const instanceId = String(route.query.instanceId ?? "");
const daemonId = String(route.query.daemonId ?? "");

const { instanceInfo, isRunning: isInstanceRunning } = useInstanceInfo({
  instanceId,
  daemonId,
  autoRefresh: true
});

const activeKey = ref(TAB_KEY_MODS);
const headerSearchQuery = ref("");

const isWindows = computed(() => {
  const config = instanceInfo.value?.config;
  // CRLF mode 2 indicates Windows.
  if (config?.crlf === 2) return true;
  // Also detect Windows from drive prefixes or backslashes.
  const cwd = config?.cwd || "";
  if (/^[a-zA-Z]:\\/.test(cwd) || cwd.includes("\\")) return true;
  return false;
});
const isRunning = computed(() => {
  const s = instanceInfo.value?.status;
  return s === 2 || s === 3;
});


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
            { default: () => t("TXT_CODE_COMMON_CANCEL") }
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

const { addDeferredTask } = useDeferredTasks(instanceId!, daemonId!, async () => {
  await loadMods();
});

watch(
  () => isInstanceRunning.value,
  (running) => {
    if (!running) {
      // Refresh when the server stops so files released by the process become available.
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
    message.error(t("TXT_CODE_COMMON_THIS_MODULE_OR_PLUGIN_DOES_NOT_CURRENTLY_SUPPORT_EXPANDING_DETAILS"));
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

/** Resolve the optional editor reactively so unloading removes the dialog. */
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
    // Preserve a valid selected tab.
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
    (m) =>
      (m.name || "").toLowerCase().includes(query) || (m.file || "").toLowerCase().includes(query)
  );
};

const filteredMods = computed(() => {
  return filterBySearch(mods.value);
});

const filteredPlugins = computed(() => {
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

const handleTabChange = (newKey: unknown) => {
  const key = String(newKey);
  tablePagination.current = 1;
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
    <PageToolbar :title="t('TXT_CODE_MOD_MANAGER')" icon="mdi-package-variant-closed">
      <template #search>
        <VTextField
          v-if="activeKey === TAB_KEY_MODS || activeKey === TAB_KEY_PLUGINS"
          v-model="headerSearchQuery"
          :label="t('TXT_CODE_SEARCH_PLACEHOLDER')"
          prepend-inner-icon="mdi-magnify"
          hide-details
          clearable
          density="comfortable"
        />
      </template>
      <template #actions>
        <VBtn v-if="activeKey === TAB_KEY_MODS || activeKey === TAB_KEY_PLUGINS" variant="tonal" @click="onUploadClick">
          <VIcon start icon="mdi-upload" />
          {{ t("TXT_CODE_COMMON_UPLOAD") }}
        </VBtn>
        <VBtn v-if="activeKey !== TAB_KEY_DOWNLOAD" color="primary" :loading="loading" @click="() => loadMods()">
          <VIcon start icon="mdi-refresh" />
          {{ t("TXT_CODE_REFRESH") }}
        </VBtn>
      </template>
    </PageToolbar>

    <VRow density="compact">
      <VCol cols="12">
        <CardPanel class="containerWrapper" :padding="false" :full-height="false">
          <template #body>
            <div class="mod-manager-content" @dragover.prevent="handleDragover"
              @dragleave.prevent="handleDragleave" @drop.prevent="handleDrop">
              <div v-if="opacity" class="drag-upload-mask">
                <div class="text-center">
                  <VIcon icon="mdi-upload" size="48" color="primary" />
                  <div class="mt-1 text-lg font-bold" style="color: var(--color-primary)">
                    {{ t("TXT_CODE_DRAG_TO_UPLOAD") }}
                  </div>
                </div>
              </div>

              <VAlert v-if="isWindows && isRunning" type="warning" variant="tonal" class="mod-manager-alert">
                <template #text>
                  <div class="text-left">
                    <div class="font-bold">{{ t("TXT_CODE_MOD_WIN_FILE_LOCK_TITLE") }}</div>
                    <div class="text-xs opacity-80 font-normal mt-0">
                      {{ t("TXT_CODE_MOD_WIN_RUNNING_ALERT") }}
                    </div>
                  </div>
                </template>
              </VAlert>

              <VTabs v-model="activeKey" class="mod-manager-tabs" @update:model-value="handleTabChange">
                <VTab v-if="hasModsFolder" :value="TAB_KEY_MODS">
                  {{ t("TXT_CODE_MOD_LIST") }}
                  <VBadge v-if="!loading" inline :content="filteredMods.length" color="secondary" />
                  <VProgressCircular v-if="loading || loadingExtra" indeterminate size="14" width="2" class="ms-2" />
                </VTab>
                <VTab v-if="hasPluginsFolder" :value="TAB_KEY_PLUGINS">
                  {{ t("TXT_CODE_PLUGIN_LIST") }}
                  <VBadge v-if="!loading" inline :content="filteredPlugins.length" color="secondary" />
                  <VProgressCircular v-if="loading || loadingExtra" indeterminate size="14" width="2" class="ms-2" />
                </VTab>
                <VTab :value="TAB_KEY_DOWNLOAD">{{ t("TXT_CODE_COMMON_DOWNLOAD_MODULES_PLUGINS") }}</VTab>
              </VTabs>
              <VWindow v-model="activeKey" :touch="false">
                <VWindowItem v-if="hasModsFolder" :value="TAB_KEY_MODS">
                  <div class="mod-manager-panel">
                    <LocalModTable :key="TAB_KEY_MODS" :loading="loading" :data-source="filteredMods" :columns="columns"
                      :pagination="tablePagination" @change="handleTableChange" @toggle="onToggle" @delete="onDelete"
                      @config="openConfig" @open-external="openExternal" @refresh="loadMods" />
                  </div>
                </VWindowItem>

                <VWindowItem v-if="hasPluginsFolder" :value="TAB_KEY_PLUGINS">
                  <div class="mod-manager-panel">
                    <LocalModTable :key="TAB_KEY_PLUGINS" :loading="loading" :data-source="filteredPlugins"
                      :columns="columns" :pagination="tablePagination" @change="handleTableChange" @toggle="onToggle"
                      @delete="onDelete" @config="openConfig" @open-external="openExternal" @refresh="loadMods" />
                  </div>
                </VWindowItem>

                <VWindowItem :value="TAB_KEY_DOWNLOAD">
                  <div class="mod-manager-panel">
                    <div class="mod-manager-search">
                      <VRow density="compact" class="search-form">
                        <VCol cols="12" :md="4"><VTextField v-model="searchFilters.query" :placeholder="t('TXT_CODE_SEARCH_PLACEHOLDER')" prepend-inner-icon="mdi-magnify" density="compact" hide-details @keyup.enter="onSearch" /></VCol>
                        <VCol cols="6" :md="2"><VSelect v-model="searchFilters.source" :items="[{ title: t('TXT_CODE_COMMON_ALL_PLATFORMS'), value: 'all' }, { title: 'Modrinth', value: 'modrinth' }, { title: 'CurseForge', value: 'curseforge' }, { title: 'SpigotMC', value: 'spigotmc' }]" density="compact" hide-details>
                          <template #no-data><Empty :icon="false" compact /></template>
                        </VSelect></VCol>
                        <VCol cols="6" :md="2"><VSelect v-model="searchFilters.version" :items="[{ title: t('TXT_CODE_COMMON_ALL_VERSIONS'), value: '' }, ...mcVersions.map((v) => ({ title: v, value: v }))]" :placeholder="t('TXT_CODE_COMMON_PLEASE_SELECT_CONTENT')" clearable density="compact" hide-details>
                          <template #no-data><Empty :icon="false" compact /></template>
                        </VSelect></VCol>
                        <VCol cols="6" :md="2"><VSelect v-model="searchFilters.type" :items="[{ title: t('TXT_CODE_MOD_ALL_TYPES'), value: 'all' }, { title: t('TXT_CODE_MOD'), value: 'mod' }, { title: t('TXT_CODE_PLUGIN'), value: 'plugin' }]" density="compact" hide-details>
                          <template #no-data><Empty :icon="false" compact /></template>
                        </VSelect></VCol>
                        <VCol cols="6" :md="2"><VSelect v-model="searchFilters.environment" :items="[{ title: t('TXT_CODE_COMMON_CLIENT_SERVER'), value: 'all' }, { title: t('TXT_CODE_SERVER'), value: 'server' }, { title: t('TXT_CODE_CLIENT'), value: 'client' }]" density="compact" hide-details>
                          <template #no-data><Empty :icon="false" compact /></template>
                        </VSelect></VCol>
                        <VCol cols="6" :md="2"><VSelect v-model="searchFilters.loader" :items="loaderOptions.flatMap((group) => group.options)" item-title="label" item-value="value" :placeholder="t('TXT_CODE_SELECT_LOADER')" clearable density="compact" hide-details>
                          <template #no-data><Empty :icon="false" compact /></template>
                        </VSelect></VCol>
                      </VRow>
                      <div class="d-flex flex-wrap ga-2 justify-end">
                        <VBtn color="primary" :loading="searchLoading" @click="onSearch"><VIcon start icon="mdi-magnify" />{{ t("TXT_CODE_SEARCH") }}</VBtn>
                        <VBtn variant="tonal" @click="resetSearch">{{ t("TXT_CODE_COMMON_RESET_FILTER_CONDITIONS") }}</VBtn>
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

    <input ref="fileInput" type="file" multiple style="display: none" accept=".jar,.zip" @change="onFileChange" />
  </div>
</template>

<style scoped>
.container {
  width: 100%;
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 20px 24px 32px;
  box-sizing: border-box;
}

@media (max-width: 992px) {
  .container {
    padding: 16px 12px 28px;
  }
}

.containerWrapper.card-panel {
  overflow: hidden;
}

.mod-manager-content {
  position: relative;
  padding: 20px;
}

.drag-upload-mask {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: rgba(128, 128, 128, 0.1);
  border: 2px dashed var(--color-primary);
  border-radius: var(--app-dialog-radius);
  pointer-events: none;
}

.containerWrapper :deep(.local-mod-table),
.containerWrapper :deep(.search-mod-table) {
  --app-list-inset: 0px;
  background: transparent;
}

.mod-manager-panel {
  padding-top: 16px;
}

.mod-manager-search {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.search-form {
  margin: 0;
}

.mod-manager-alert {
  margin-bottom: 16px;
  padding: 10px 18px !important;
}

.mod-manager-alert :deep(.v-alert__content) {
  text-align: left !important;
}

.search-form :deep(.v-field__input) {
  text-align: left !important;
}

@media (max-width: 992px) {
  .mod-manager-content {
    padding: 16px 12px;
  }
}
</style>
