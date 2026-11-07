<script setup lang="ts">
import PageToolbar from "@elementspanel/epanel-plugin-console/components/PageToolbar";
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { getValidatorErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { computeNodeName } from "@elementspanel/epanel-plugin-console/tools/nodes";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  VAvatar,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VChip,
  VCol,
  VContainer,
  VIcon,
  VImg,
  VList,
  VListItem,
  VMenu,
  VProgressCircular,
  VRow,
  VSpacer,
  VTab,
  VTabs,
  VTextField
} from "vuetify/components";
import { pluginMarketList, pluginMarketNodes, type MarketNode, type MarketPlugin } from "../api";
import { usePluginIcons } from "../hooks/usePluginIcons";
import PluginMarketSideBadge from "./PluginMarketSideBadge.vue";
import PluginMarketInstall from "./PluginMarketInstall.vue";
import PluginMarketChanges from "./PluginMarketChanges.vue";
import PluginMarketUpdates from "./PluginMarketUpdates.vue";
import { activeOperations, applyingChanges, installedChange } from "../operations";

const props = defineProps<{ embedded?: boolean; daemonId?: string }>();
const emit = defineEmits<{ select: [pluginId: string]; "target-change": [daemonId: string] }>();
const selectedDaemonId = ref(props.daemonId ?? "");
const nodes = ref<MarketNode[]>([]);
const nodesLoading = ref(false);
const currentNode = computed(() =>
  nodes.value.find((node) => node.daemonId === selectedDaemonId.value)
);
const targetLabel = computed(() =>
  selectedDaemonId.value
    ? currentNode.value
      ? computeNodeName(
          currentNode.value.ip,
          currentNode.value.available,
          currentNode.value.remarks
        )
      : selectedDaemonId.value
    : t("TXT_CODE_PLUGIN_MARKET_CURRENT_PANEL")
);
const loading = ref(false);
// Whether the last refresh failed: an empty list then means "unreachable", not "no plugins".
const failed = ref(false);
const failureMessage = ref("");
const plugins = ref<MarketPlugin[]>([]);
const keyword = ref<string | null>("");
const activeTab = ref<"browse" | "updates">("browse");
const updateView = ref<InstanceType<typeof PluginMarketUpdates>>();
const updatesLoading = ref(false);
const { icons, load } = usePluginIcons();
let requestId = 0;
let nodesRequestId = 0;

const visiblePlugins = computed(() => {
  const q = (keyword.value ?? "").trim().toLowerCase();
  if (!q) return plugins.value;
  return plugins.value.filter((plugin) =>
    [plugin.displayName, plugin.name, plugin.summary].some((field) =>
      String(field ?? "")
        .toLowerCase()
        .includes(q)
    )
  );
});

// Load the filtered catalogue's declared icons for the release shown on each card.
watch(
  visiblePlugins,
  (list) => {
    for (const plugin of list) void load(plugin.id, Boolean(plugin.iconUrl), plugin.latestVersion?.version);
  },
  { immediate: true }
);

async function refresh() {
  const request = ++requestId;
  loading.value = true;
  try {
    const { execute } = pluginMarketList();
    const daemonId = selectedDaemonId.value;
    const response = await execute({ params: { daemonId }, forceRequest: true, timeout: 60000 });
    if (request === requestId) {
      plugins.value = (response.value ?? []).map((plugin) => ({
        ...plugin,
        targetDaemonId: daemonId
      }));
      failed.value = false;
      failureMessage.value = "";
    }
  } catch (error) {
    if (request === requestId) {
      failed.value = true;
      failureMessage.value = getValidatorErrorMsg(error);
      message.error(failureMessage.value);
    }
  } finally {
    if (request === requestId) loading.value = false;
  }
}

async function refreshNodes() {
  const request = ++nodesRequestId;
  nodesLoading.value = true;
  try {
    const response = await pluginMarketNodes().execute({ forceRequest: true });
    if (request === nodesRequestId) nodes.value = response.value ?? [];
  } catch (error) {
    if (request === nodesRequestId) message.error(getValidatorErrorMsg(error));
  } finally {
    if (request === nodesRequestId) nodesLoading.value = false;
  }
}

function refreshActive() {
  void refreshNodes();
  if (activeTab.value === "updates") void updateView.value?.refresh();
  else void refresh();
}

watch(
  () => props.daemonId,
  (daemonId) => {
    if (daemonId !== undefined) selectedDaemonId.value = daemonId;
  }
);
watch(selectedDaemonId, (daemonId) => {
  plugins.value = [];
  failed.value = false;
  emit("target-change", daemonId);
  void refresh();
});

function selectPlugin(plugin: MarketPlugin) {
  if (props.embedded) emit("select", plugin.id);
}

function onCardKeydown(event: KeyboardEvent, plugin: MarketPlugin) {
  if (event.target !== event.currentTarget) return;
  if (!props.embedded || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  selectPlugin(plugin);
}

function updateInstalled(pluginId: string, version: string | undefined) {
  const plugin = plugins.value.find((item) => item.id === pluginId);
  if (plugin) plugin.installedVersion = version;
}

defineExpose({ updateInstalled });
watch(installedChange, (change) => {
  if (change && (change.daemonId === undefined || change.daemonId === selectedDaemonId.value))
    void refresh();
});
onMounted(() => {
  void refresh();
  void refreshNodes();
});
onBeforeUnmount(() => {
  requestId++;
  nodesRequestId++;
});
</script>

<template>
  <main class="plugin-market" :class="{ 'plugin-market--embedded': embedded }">
    <VContainer fluid class="plugin-market-container">
      <PageToolbar :title="t('TXT_CODE_PLUGIN_MARKET')" icon="mdi-puzzle-outline">
        <template #search>
          <VTextField
            v-model="keyword"
            :label="t('TXT_CODE_PLUGIN_MARKET_SEARCH')"
            prepend-inner-icon="mdi-magnify"
            hide-details
            clearable
            density="comfortable"
            variant="solo-filled"
          />
        </template>
        <template #actions>
          <PluginMarketChanges />
          <VBtn
            variant="text"
            :loading="activeTab === 'updates' ? updatesLoading : loading"
            :disabled="applyingChanges"
            @click="refreshActive"
          >
            {{ t("TXT_CODE_PLUGIN_MARKET_REFRESH") }}
          </VBtn>
        </template>
      </PageToolbar>

      <div class="plugin-market-navigation">
        <VTabs
          v-model="activeTab"
          align-tabs="start"
          color="primary"
          density="compact"
          class="plugin-market-tabs"
          :disabled="applyingChanges || Boolean(activeOperations)"
        >
          <VTab value="browse">{{ t("TXT_CODE_PLUGIN_MARKET_BROWSE") }}</VTab>
          <VTab value="updates">{{ t("TXT_CODE_PLUGIN_MARKET_UPDATES") }}</VTab>
        </VTabs>
        <div class="plugin-market-navigation-actions">
          <VBtn
            v-if="activeTab === 'updates'"
            class="plugin-market-update-all"
            color="primary"
            prepend-icon="mdi-update"
            :disabled="!updateView?.canUpdate"
            :loading="updateView?.preparingTargets"
            @click="updateView?.updateAll()"
          >
            {{ t("TXT_CODE_PLUGIN_MARKET_UPDATE_ALL") }}
          </VBtn>
          <VMenu location="bottom end">
            <template #activator="{ props: menuProps }">
              <VBtn
                v-bind="menuProps"
                class="plugin-market-node-selector"
                variant="tonal"
                prepend-icon="mdi-server-outline"
                :loading="nodesLoading"
                :disabled="applyingChanges || Boolean(activeOperations)"
                :aria-label="t('TXT_CODE_PLUGIN_MARKET_SELECT_NODES')"
              >
                <span class="node-name">{{ targetLabel }}</span>
                <VIcon icon="mdi-chevron-down" end />
              </VBtn>
            </template>
            <VList density="comfortable">
              <VListItem
                :active="!selectedDaemonId"
                :title="t('TXT_CODE_PLUGIN_MARKET_CURRENT_PANEL')"
                prepend-icon="mdi-monitor-dashboard"
                @click="selectedDaemonId = ''"
              />
              <VListItem
                v-for="node in nodes"
                :key="node.daemonId"
                :active="selectedDaemonId === node.daemonId"
                :disabled="!node.available"
                :title="computeNodeName(node.ip, node.available, node.remarks)"
                :prepend-icon="node.available ? 'mdi-database-outline' : 'mdi-server-off-outline'"
                @click="selectedDaemonId = node.daemonId"
              />
            </VList>
          </VMenu>
        </div>
      </div>

      <PluginMarketUpdates
        v-if="activeTab === 'updates'"
        ref="updateView"
        :keyword="keyword"
        :daemon-id="selectedDaemonId"
        @loading="updatesLoading = $event"
      />

      <div v-show="activeTab === 'browse'">
        <div v-if="loading && !plugins.length" class="plugin-market-loading">
          <VProgressCircular indeterminate />
        </div>

        <Empty
          v-else-if="!plugins.length"
          :icon="failed ? 'mdi-lan-disconnect' : 'mdi-puzzle-outline'"
          :title="
            failed
              ? failureMessage || t('TXT_CODE_PLUGIN_MARKET_UNREACHABLE')
              : t('TXT_CODE_PLUGIN_MARKET_EMPTY')
          "
          :description="t('TXT_CODE_NO_DATA')"
        />

        <VRow v-else-if="visiblePlugins.length" class="plugin-market-grid">
          <VCol v-for="plugin in visiblePlugins" :key="plugin.id" cols="12" md="6" lg="4">
            <VCard
              class="plugin-market-card h-100"
              elevation="0"
              :to="
                embedded
                  ? undefined
                  : {
                      path: `/market/plugins/${encodeURIComponent(plugin.id)}`,
                      query: { daemonId: selectedDaemonId }
                    }
              "
              :role="embedded ? 'button' : undefined"
              :tabindex="embedded ? 0 : undefined"
              link
              @click="selectPlugin(plugin)"
              @keydown="onCardKeydown($event, plugin)"
            >
              <VCardText class="plugin-market-card-content">
                <div class="plugin-market-card-head">
                  <!-- Keep the generic icon out while a declared custom icon is loading. -->
                  <VAvatar
                    class="plugin-market-icon"
                    size="52"
                    rounded="12px"
                    color="surface"
                    variant="flat"
                  >
                    <VImg
                      v-if="icons[plugin.id]"
                      :src="icons[plugin.id]"
                      alt=""
                      cover
                      transition="fade-transition"
                      class="plugin-market-icon-image"
                      @error="delete icons[plugin.id]"
                    />
                    <VIcon v-else icon="mdi-puzzle-outline" size="28" />
                  </VAvatar>
                  <div class="plugin-market-card-heading">
                    <div class="text-h6">
                      {{ plugin.displayName }}
                    </div>
                    <div class="text-caption text-medium-emphasis">
                      {{ plugin.author?.displayName ?? "" }}
                      <span v-if="plugin.category">· {{ plugin.category }}</span>
                    </div>
                  </div>
                </div>
                <div class="plugin-market-card-summary text-body-2 mt-2">
                  {{ plugin.summary || t("TXT_CODE_PLUGIN_MARKET_NO_SUMMARY") }}
                </div>
              </VCardText>

              <VCardActions class="plugin-market-card-actions">
                <VChip v-if="plugin.latestVersion" size="small" variant="tonal">
                  {{
                    t("TXT_CODE_PLUGIN_MARKET_VERSION", { version: plugin.latestVersion.version })
                  }}
                </VChip>
                <PluginMarketSideBadge :sides="plugin.sides" />
                <VSpacer />
                <PluginMarketInstall
                  :plugin="plugin"
                  :version="plugin.latestVersion"
                  :embedded="embedded"
                  @installed="updateInstalled"
                />
              </VCardActions>
            </VCard>
          </VCol>
        </VRow>

        <Empty v-else-if="!loading" icon="mdi-magnify" :title="t('TXT_CODE_NO_DATA')" />
      </div>
    </VContainer>
  </main>
</template>

<style lang="scss" scoped>
// Same shell as the application market page: identical container width, gutters
// and mobile breakpoint, so the two markets line up.
.plugin-market {
  width: 100%;
  min-height: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow-x: hidden;
}

.plugin-market-container {
  width: 100%;
  min-width: 0;
  max-width: var(--app-max-width);
  margin: 0 auto;
  box-sizing: border-box;
  padding: 20px 24px 32px;
}

.plugin-market-navigation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
  margin-bottom: 28px;
}

.plugin-market-tabs {
  flex: 1;
  min-width: 0;
}

.plugin-market-node-selector {
  flex-shrink: 0;
}

.plugin-market-navigation-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}

.node-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-market-loading {
  min-height: 38vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

// A card is a column: the description takes the space that is left, so the
// version chips stay on the last line of every card
// instead of following the text up and down.
.plugin-market-card {
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
}

.plugin-market-card-content {
  flex: 1 0 auto;
}

// 图标与标题排在一行：图标是插件在市场里的门面，标题紧跟着它。
.plugin-market-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.plugin-market-card-heading {
  min-width: 0;
  overflow-wrap: anywhere;
}

.plugin-market-icon {
  flex-shrink: 0;
  overflow: hidden;
}

.plugin-market-icon-image {
  width: 100%;
  height: 100%;
}

.plugin-market-card-summary {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.5;
  text-overflow: ellipsis;
}

.plugin-market-card-actions {
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding-top: 8px;
}

@media (max-width: 992px) {
  .plugin-market-navigation {
    flex-wrap: wrap;
    gap: 8px;
  }

  .plugin-market-container {
    padding: 16px 12px 28px;
  }
}

.plugin-market--embedded {
  height: 100%;
  min-height: 0;
  overflow-y: auto;

  .plugin-market-container {
    max-width: none;
    padding: 20px;
  }

  .plugin-market-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
    gap: 20px;
  }

  :deep(.page-toolbar) {
    margin-bottom: 24px;
    gap: 12px;
  }

  :deep(.page-toolbar-title) {
    flex: 1 1 200px;
    font-size: 18px;
  }

  :deep(.page-toolbar-search) {
    flex: 1 1 240px;
  }

  :deep(.page-toolbar-actions) {
    flex: 0 0 auto;
    justify-content: flex-end;
  }
}
</style>
