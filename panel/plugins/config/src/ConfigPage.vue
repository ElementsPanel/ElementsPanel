<script setup lang="ts">
import { t } from "@/lang/i18n";
import { ctx } from "@/plugin/context";
import { getValidatorErrorMsg } from "@/tools/validator";
import { message } from "@/tools/vuetifyToast";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import {
  VAlert,
  VBtn,
  VBtnToggle,
  VCard,
  VCardActions,
  VCardText,
  VChip,
  VDialog,
  VList,
  VListItem,
  VProgressCircular,
  VProgressLinear,
  VSelect,
  VSpacer,
  VTooltip
} from "vuetify/components";
import {
  nodeList,
  nodePluginList,
  nodePluginSettings,
  pluginList,
  pluginSettings,
  removePlugin,
  setNodePluginEnabled,
  setPluginEnabled,
  updateNodePluginSettings,
  updatePluginSettings,
  type NodePluginRecord,
  type NodeSummary,
  type PluginRecord,
  type PluginChangeResult,
  type SettingsSchema
} from "./api";
import SchemaForm from "./SchemaForm.vue";

// The panel reports installed plugins after applying the user override layer; a
// disabled plugin has to stay listed for the enable button to turn it back on.
//
// The form beside the list is not a component any plugin shipped: a plugin
// describes its configuration on its backend, and this page renders that
// description. That is the only reason a daemon plugin can have a settings form
// at all 鈥?the browser holds no copy of a daemon plugin.

type Scope = "panel" | "node";

const scope = ref<Scope>("panel");
const route = useRoute();
const router = useRouter();
/** The plugin named by the URL, used once its list has actually arrived. */
const preferredPluginId = ref(String(route.query.plugin ?? ""));

const loading = ref(true);
const pending = ref<string>("");
const plugins = ref<PluginRecord[]>([]);
const selectedId = ref("");

const nodes = ref<NodeSummary[]>([]);
const selectedNodeId = ref("");
const nodePlugins = ref<NodePluginRecord[]>([]);
const nodeSelectedId = ref("");
/** Why the node scope has nothing to show, when it has nothing to show. */
const nodeError = ref("");

const nodeLabel = (node: NodeSummary) =>
  `${node.remarks || `${node.ip}:${node.port}`}${
    node.available ? "" : ` (${t("TXT_CODE_PLUGIN_NODE_OFFLINE")})`
  }`;

const selectedNode = computed(() => nodes.value.find((item) => item.uuid === selectedNodeId.value));
const nodeItems = computed(() =>
  nodes.value.map((node) => ({ title: nodeLabel(node), value: node.uuid }))
);

const currentList = computed<Array<PluginRecord | NodePluginRecord>>(() =>
  scope.value === "panel" ? plugins.value : nodePlugins.value
);

const currentId = computed({
  get: () => (scope.value === "panel" ? selectedId.value : nodeSelectedId.value),
  set: (value: string) => {
    if (scope.value === "panel") selectedId.value = value;
    else nodeSelectedId.value = value;
  }
});

const selectedPlugin = computed(() =>
  currentList.value.find((item) => item.id === currentId.value)
);
const selectedPanelPlugin = computed(() =>
  scope.value === "panel" ? plugins.value.find((item) => item.id === selectedId.value) : undefined
);

/** The selected plugin's declared form, or null when it declared none. */
const schema = ref<SettingsSchema | null>(null);
const schemaLoading = ref(false);
let schemaRequest = 0;
let nodePluginsRequest = 0;
let disposed = false;
const savingSettings = ref(false);
const lastResult = ref<PluginChangeResult | null>(null);
const stateLabels = {
  disabled: "TXT_CODE_PLUGIN_STATE_DISABLED",
  pending: "TXT_CODE_PLUGIN_STATE_PENDING",
  loading: "TXT_CODE_PLUGIN_STATE_LOADING",
  active: "TXT_CODE_PLUGIN_STATE_ACTIVE",
  failed: "TXT_CODE_PLUGIN_LOAD_FAILED",
  unloading: "TXT_CODE_PLUGIN_STATE_UNLOADING",
  "restart-required": "TXT_CODE_PLUGIN_RESTART_REQUIRED"
};
const frontendPlugin = computed(() =>
  scope.value === "panel"
    ? ctx.plugins.loaded.find((item) => item.metadata.id === currentId.value)
    : undefined
);
const recordResult = (result?: PluginChangeResult | boolean) => {
  lastResult.value = result && typeof result === "object" ? result : null;
  if (lastResult.value?.application === "failed")
    notify(lastResult.value.error || t("TXT_CODE_PLUGIN_LOAD_FAILED"), "error");
};
const disableCandidate = ref<{
  scope: Scope;
  plugin: PluginRecord | NodePluginRecord;
  nodeId: string;
} | null>(null);
const disableConfirmOpen = ref(false);
const deleteConfirmOpen = ref(false);
const deletingPlugin = ref(false);
const deleteCandidate = ref<PluginRecord | null>(null);
const notify = (text: string, color: "success" | "error") => {
  if (color === "error") message.error(text);
  else message.success(text);
};

const notifyError = (error: unknown) => {
  console.error("Plugin configuration error:", error);
  notify(getValidatorErrorMsg(error, t("TXT_CODE_6a365d01")), "error");
};

const loadSchema = async () => {
  if (disposed) return;
  const request = ++schemaRequest;
  schema.value = null;
  schemaLoading.value = false;
  const id = currentId.value;
  if (!id) return;
  if (scope.value === "node" && !selectedNodeId.value) return;
  schemaLoading.value = true;
  try {
    if (scope.value === "panel") {
      const { execute } = pluginSettings();
      const res = await execute({ params: { id } });
      if (request === schemaRequest) schema.value = res.value ?? null;
    } else {
      const { execute } = nodePluginSettings();
      const res = await execute({ params: { daemonId: selectedNodeId.value, id } });
      if (request === schemaRequest) schema.value = res.value ?? null;
    }
  } catch (error: any) {
    // A plugin that declared nothing is the common case; a real failure is
    // reported by the list above, which uses the same connection.
    if (request === schemaRequest) schema.value = null;
  } finally {
    if (request === schemaRequest) schemaLoading.value = false;
  }
};

const retryFrontend = async () => {
  if (!currentId.value || pending.value) return;
  pending.value = currentId.value;
  try {
    await ctx.plugins.reload(currentId.value);
  } catch (error) {
    notifyError(error);
  } finally {
    pending.value = "";
  }
};

const saveSettings = async () => {
  if (!schema.value || savingSettings.value) return;
  const targetScope = scope.value;
  const targetNode = selectedNodeId.value;
  const targetId = schema.value.id;
  savingSettings.value = true;
  const reloadPanel = scope.value === "panel" && ["i18n", "console"].includes(schema.value.id);
  try {
    const values = schema.value.values;
    if (targetScope === "panel") {
      const { execute } = updatePluginSettings();
      recordResult((await execute({ params: { id: targetId }, data: values })).value);
    } else {
      const { execute } = updateNodePluginSettings();
      recordResult(
        (
          await execute({
            params: { daemonId: targetNode, id: targetId },
            data: values
          })
        ).value
      );
    }
    if (!lastResult.value || lastResult.value.application === "applied")
      notify(t("TXT_CODE_d3de39b4"), "success");
    if (reloadPanel) {
      window.setTimeout(() => window.location.reload(), 400);
      return;
    }
    if (
      scope.value === targetScope &&
      selectedNodeId.value === targetNode &&
      currentId.value === targetId
    ) {
      await loadSchema();
    }
  } catch (error: any) {
    notifyError(error);
  } finally {
    savingSettings.value = false;
  }
};

const load = async () => {
  loading.value = true;
  try {
    const { execute } = pluginList();
    const res = await execute();
    plugins.value = res.value ?? [];
  } catch (error: any) {
    notifyError(error);
  } finally {
    loading.value = false;
  }
};

/**
 * The node routes exist only while `plugins/node` does, so a failure here is the
 * expected answer on a panel without it rather than something to shout about.
 */
const loadNodes = async () => {
  loading.value = true;
  nodeError.value = "";
  try {
    const { execute } = nodeList();
    const res = await execute();
    nodes.value = res.value ?? [];
    if (!nodes.value.some((item) => item.uuid === selectedNodeId.value)) {
      selectedNodeId.value = nodes.value.find((item) => item.available)?.uuid || "";
    }
  } catch (error: any) {
    nodes.value = [];
    selectedNodeId.value = "";
    nodeError.value = error?.message ?? String(error);
  } finally {
    loading.value = false;
  }
};

const loadNodePlugins = async () => {
  if (disposed) return;
  const request = ++nodePluginsRequest;
  nodePlugins.value = [];
  if (!selectedNodeId.value) return;
  loading.value = true;
  nodeError.value = "";
  try {
    const { execute } = nodePluginList();
    const res = await execute({ params: { daemonId: selectedNodeId.value } });
    if (request === nodePluginsRequest) nodePlugins.value = res.value ?? [];
  } catch (error: any) {
    if (request === nodePluginsRequest) nodeError.value = error?.message ?? String(error);
  } finally {
    if (request === nodePluginsRequest) loading.value = false;
  }
};

/**
 * Toggling a plugin reconnects the node, because that is what makes a daemon
 * rebind its protocol events. The list is therefore re-read with a few retries:
 * the first attempt often lands while the socket is still coming back up.
 */
const reloadNodePluginsAfterToggle = async () => {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (disposed) return;
    await loadNodePlugins();
    if (!nodeError.value) return;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
};

onMounted(() => {
  load();
  window.addEventListener("elementspanel:plugins-changed", load);
});
onUnmounted(() => {
  window.removeEventListener("elementspanel:plugins-changed", load);
  disposed = true;
  schemaRequest++;
  nodePluginsRequest++;
});

/**
 * Leaving must not drag this page's parameters into the next one. The shared
 * `toPage()` helper copies the current query along, and `scope`, `daemonId` and
 * `plugin` describe a plugin tab, not the page being opened — an instance page
 * would otherwise inherit a daemon it was never opened for. Only the values this
 * page contributed are dropped, so a link that asks for a key by another value
 * still gets it.
 */
onBeforeRouteLeave((to) => {
  if (to.path === "/plugins/config") return true;
  const query = { ...to.query };
  const contributed: Record<string, string> = {
    scope: scope.value,
    daemonId: selectedNodeId.value,
    plugin: currentId.value
  };
  let inherited = false;
  for (const [key, value] of Object.entries(contributed)) {
    if (value && query[key] === value) {
      delete query[key];
      inherited = true;
    }
  }
  return inherited ? { path: to.path, query } : true;
});

watch(scope, (value) => {
  if (value === "node" && !nodes.value.length && !nodeError.value) loadNodes();
});

watch(selectedNodeId, () => loadNodePlugins());

watch(
  () => [route.query.scope, route.query.daemonId, route.query.plugin],
  ([targetScope, daemonId, pluginId]) => {
    if (typeof pluginId === "string") preferredPluginId.value = pluginId;
    if (targetScope !== "node") return;
    scope.value = "node";
    if (typeof daemonId === "string") selectedNodeId.value = daemonId;
  },
  { immediate: true }
);

watch(
  plugins,
  (value) => {
    if (!value.some((item) => item.id === selectedId.value)) {
      selectedId.value =
        value.find((item) => item.id === preferredPluginId.value)?.id || value[0]?.id || "";
    }
  },
  { immediate: true }
);

watch(nodePlugins, (value) => {
  if (!value.some((item) => item.id === nodeSelectedId.value)) {
    nodeSelectedId.value =
      value.find((item) => item.id === preferredPluginId.value)?.id || value[0]?.id || "";
  }
});

// Whatever is selected, its form comes from the backend that declared it.
watch(
  [scope, currentId, selectedNodeId],
  () => {
    lastResult.value = null;
    loadSchema();
  },
  { immediate: true }
);

/**
 * The address bar follows the open plugin, so a tab can be copied out of it and
 * reopened: `/plugins/config?scope=panel&plugin=<id>`, or with `daemonId` added
 * when the plugin belongs to a daemon.
 *
 * The rewrite deliberately skips the router. A router navigation runs the global
 * guard, which starts the top progress bar and leaves it on screen for a second
 * on every selection. A desktop window hosts this page inside the desktop route,
 * where the address bar belongs to the desktop, so nothing is written there.
 */
let lastSyncedPath = "";
const syncRoute = () => {
  if (route.path !== "/plugins/config") return;
  const query: Record<string, string> = { scope: scope.value };
  if (scope.value === "node" && selectedNodeId.value) query.daemonId = selectedNodeId.value;
  if (currentId.value) query.plugin = currentId.value;
  preferredPluginId.value = currentId.value;
  const fullPath = router.resolve({ query }).fullPath;
  if (fullPath === lastSyncedPath) return;
  lastSyncedPath = fullPath;
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, "", `${pathname}${search}#${fullPath}`);
};

watch([scope, currentId, selectedNodeId], syncRoute);

const apply = async (plugin: PluginRecord, enabled: boolean) => {
  pending.value = plugin.id;
  try {
    const { execute } = setPluginEnabled();
    recordResult((await execute({ data: { id: plugin.id, enabled } })).value?.result);
    // The panel has already applied the change to its own half. The browser
    // reconciles itself against the manifest, which now reflects the switch, so
    // the plugin's routes, cards and menus appear or disappear with it.
    await ctx.plugins.refresh();
    await load();
    if (!lastResult.value || lastResult.value.application === "applied")
      notify(t(enabled ? "TXT_CODE_PLUGIN_ENABLED" : "TXT_CODE_PLUGIN_DISABLED"), "success");
  } catch (error: any) {
    notifyError(error);
    await load();
  } finally {
    pending.value = "";
  }
};

/**
 * The daemon applies the switch itself and answers with the updated record, so
 * there is nothing for the browser to reconcile 鈥?only the list to re-read.
 */
const applyNode = async (
  plugin: NodePluginRecord,
  enabled: boolean,
  daemonId = selectedNodeId.value
) => {
  pending.value = plugin.id;
  try {
    const { execute } = setNodePluginEnabled();
    recordResult(
      (
        await execute({
          params: { daemonId },
          data: { id: plugin.id, enabled }
        })
      ).value?.result
    );
    if (!lastResult.value || lastResult.value.application === "applied")
      notify(t(enabled ? "TXT_CODE_PLUGIN_ENABLED" : "TXT_CODE_PLUGIN_DISABLED"), "success");
  } catch (error: any) {
    notifyError(error);
  } finally {
    pending.value = "";
    await reloadNodePluginsAfterToggle();
  }
};

/**
 * Enabling is immediate; disabling asks first, because it removes whatever the
 * plugin contributed 鈥?including, for some plugins, authentication itself.
 */
const toggle = (plugin: PluginRecord | NodePluginRecord, enabled: boolean) => {
  const targetScope = scope.value;
  const nodeId = selectedNodeId.value;
  const commit = () =>
    targetScope === "panel"
      ? apply(plugin as PluginRecord, enabled)
      : applyNode(plugin as NodePluginRecord, enabled, nodeId);
  if (enabled) return commit();
  disableCandidate.value = { scope: targetScope, plugin, nodeId };
  disableConfirmOpen.value = true;
};

const toggleSelected = (enabled: boolean) => {
  if (selectedPlugin.value) toggle(selectedPlugin.value, enabled);
};

watch(disableConfirmOpen, (open) => {
  if (!open) disableCandidate.value = null;
});

const confirmDisable = () => {
  const candidate = disableCandidate.value;
  if (!candidate) {
    disableConfirmOpen.value = false;
    return;
  }
  disableConfirmOpen.value = false;
  return candidate.scope === "panel"
    ? apply(candidate.plugin as PluginRecord, false)
    : applyNode(candidate.plugin as NodePluginRecord, false, candidate.nodeId);
};

const confirmRemove = async () => {
  const plugin = deleteCandidate.value;
  if (!plugin || !plugin.removable || deletingPlugin.value) return;
  deletingPlugin.value = true;
  try {
    const { execute } = removePlugin();
    await execute({ params: { id: plugin.id } });
    deleteConfirmOpen.value = false;
    deleteCandidate.value = null;
    await ctx.plugins.refresh();
    await load();
    notify(t("TXT_CODE_PLUGIN_DELETED"), "success");
  } catch (error) {
    notifyError(error);
  } finally {
    deletingPlugin.value = false;
  }
};
</script>

<template>
  <div class="plugin-config-page">
    <VProgressLinear v-if="loading" class="plugin-config-loading" color="primary" indeterminate />

    <div class="plugin-config-sidebar">
      <VBtnToggle v-model="scope" class="plugin-config-scope" mandatory>
        <VBtn value="panel" size="small" variant="text">{{
          t("TXT_CODE_PLUGIN_SCOPE_PANEL")
        }}</VBtn>
        <VBtn value="node" size="small" variant="text">{{ t("TXT_CODE_PLUGIN_SCOPE_NODE") }}</VBtn>
      </VBtnToggle>

      <VSelect
        v-if="scope === 'node'"
        v-model="selectedNodeId"
        class="plugin-config-node-select"
        :items="nodeItems"
        :loading="loading"
        :placeholder="t('TXT_CODE_PLUGIN_NODE_SELECT')"
        :menu-props="{ contentClass: 'plugin-config-node-menu' }"
        hide-details
      />

      <div class="plugin-config-heading">{{ t("TXT_CODE_PLUGIN_LIST") }}</div>
      <VList class="plugin-config-list" density="compact">
        <VListItem
          v-for="plugin in currentList"
          :key="plugin.id"
          :active="plugin.id === currentId"
          :class="{ 'plugin-config-item-off': !plugin.enabled }"
          :title="plugin.id"
          @click="currentId = plugin.id"
        >
          <template #append>
            <span
              class="plugin-config-item-dot"
              :class="{
                'plugin-config-item-dot-off':
                  !plugin.enabled || (plugin.state && plugin.state !== 'active')
              }"
            ></span>
          </template>
        </VListItem>
        <div v-if="!currentList.length" class="plugin-config-empty">
          {{ t("TXT_CODE_NO_DATA") }}
        </div>
      </VList>
    </div>

    <div class="plugin-config-content">
      <VAlert
        v-if="scope === 'node' && nodeError"
        class="plugin-config-alert"
        type="warning"
        variant="tonal"
        :title="t('TXT_CODE_PLUGIN_NODE_LIST_FAILED')"
        :text="nodeError"
      />

      <template v-if="selectedPlugin">
        <div class="plugin-config-title-row">
          <div>
            <h2>{{ selectedPlugin.id }}</h2>
          </div>
          <div class="plugin-config-meta">
            <VChip
              v-if="selectedPlugin.state"
              size="small"
              :color="selectedPlugin.state === 'active' ? 'success' : 'warning'"
            >
              {{ t(stateLabels[selectedPlugin.state]) }}
            </VChip>
            <span v-if="scope === 'node' && selectedNode" class="plugin-config-version">
              {{ nodeLabel(selectedNode) }}
            </span>
            <span v-if="selectedPlugin.version" class="plugin-config-version">
              {{ t("TXT_CODE_VERSION") }} {{ selectedPlugin.version }}
            </span>
            <VTooltip
              :text="t(selectedPlugin.enabled ? 'TXT_CODE_PLUGIN_DISABLE' : 'TXT_CODE_PLUGIN_ENABLE')"
              location="top"
            >
              <template #activator="{ props: tooltipProps }">
                <span v-bind="tooltipProps">
                  <VBtn
                    :icon="selectedPlugin.enabled ? 'mdi-power-off' : 'mdi-power'"
                    :color="selectedPlugin.enabled ? 'warning' : 'success'"
                    variant="text"
                    :loading="pending === selectedPlugin.id"
                    :disabled="Boolean(pending)"
                    :aria-label="
                      t(
                        selectedPlugin.enabled
                          ? 'TXT_CODE_PLUGIN_DISABLE'
                          : 'TXT_CODE_PLUGIN_ENABLE'
                      )
                    "
                    @click="toggleSelected(!selectedPlugin.enabled)"
                  />
                </span>
              </template>
            </VTooltip>
            <VTooltip
              v-if="schema?.fields.some((field) => field.type !== 'link')"
              :text="t('TXT_CODE_PLUGIN_SAVE_SETTINGS')"
              location="top"
            >
              <template #activator="{ props: tooltipProps }">
                <span v-bind="tooltipProps">
                  <VBtn
                    icon="mdi-content-save"
                    color="primary"
                    variant="text"
                    :loading="savingSettings"
                    :disabled="schemaLoading"
                    :aria-label="t('TXT_CODE_PLUGIN_SAVE_SETTINGS')"
                    @click="saveSettings"
                  />
                </span>
              </template>
            </VTooltip>
            <VTooltip
              v-if="scope === 'panel'"
              :text="
                t(
                  selectedPanelPlugin?.removable
                    ? 'TXT_CODE_PLUGIN_DELETE'
                    : 'TXT_CODE_PLUGIN_DELETE_UNAVAILABLE'
                )
              "
              location="top"
            >
              <template #activator="{ props: tooltipProps }">
                <span v-bind="tooltipProps">
                  <VBtn
                    icon="mdi-delete"
                    color="error"
                    variant="text"
                    :loading="deletingPlugin"
                    :disabled="!selectedPanelPlugin?.removable || deletingPlugin"
                    :aria-label="
                      t(
                        selectedPanelPlugin?.removable
                          ? 'TXT_CODE_PLUGIN_DELETE'
                          : 'TXT_CODE_PLUGIN_DELETE_UNAVAILABLE'
                      )
                    "
                    @click="
                      deleteCandidate = selectedPanelPlugin || null;
                      deleteConfirmOpen = Boolean(deleteCandidate)
                    "
                  />
                </span>
              </template>
            </VTooltip>
          </div>
        </div>

        <VAlert
          v-if="!selectedPlugin.enabled"
          class="plugin-config-alert"
          type="warning"
          variant="tonal"
          :title="t('TXT_CODE_PLUGIN_IS_DISABLED')"
        />
        <VAlert
          v-else-if="selectedPlugin.error"
          class="plugin-config-alert"
          type="error"
          variant="tonal"
          :title="t('TXT_CODE_PLUGIN_LOAD_FAILED')"
          :text="selectedPlugin.error"
        />

        <VAlert
          v-if="lastResult?.application === 'restart-required' || frontendPlugin?.restartRequired"
          class="plugin-config-alert"
          type="warning"
          variant="tonal"
          :text="t('TXT_CODE_PLUGIN_RESTART_REQUIRED')"
        />
        <VAlert
          v-else-if="frontendPlugin?.reloadRequired"
          class="plugin-config-alert"
          type="warning"
          variant="tonal"
          :text="t('TXT_CODE_PLUGIN_REFRESH_REQUIRED')"
        />
        <VAlert
          v-else-if="lastResult?.application === 'pending'"
          class="plugin-config-alert"
          type="info"
          variant="tonal"
          :text="t('TXT_CODE_PLUGIN_SAVED_PENDING')"
        />
        <VAlert
          v-if="frontendPlugin?.error"
          class="plugin-config-alert"
          type="error"
          variant="tonal"
          :title="t('TXT_CODE_PLUGIN_FRONTEND_FAILED')"
          :text="frontendPlugin.error.message"
        />

        <VBtn v-if="frontendPlugin?.error" class="mb-4" variant="text" @click="retryFrontend">{{
          t("TXT_CODE_9277af78")
        }}</VBtn>
        <div v-if="schemaLoading" class="plugin-config-schema-loading">
          <VProgressCircular color="primary" indeterminate size="28" />
        </div>
        <div v-else-if="schema && schema.fields.length" class="plugin-config-form">
          <SchemaForm :fields="schema.fields" :values="schema.values" @save="saveSettings" />
        </div>
        <div v-else class="plugin-config-no-config">
          {{ t("TXT_CODE_PLUGIN_NO_CONFIG") }}
        </div>
      </template>
      <div v-else-if="!nodeError" class="plugin-config-no-config">{{ t("TXT_CODE_NO_DATA") }}</div>
    </div>

    <VDialog v-model="disableConfirmOpen" max-width="460">
      <VCard
        :title="t('TXT_CODE_PLUGIN_DISABLE_CONFIRM_TITLE', { name: disableCandidate?.plugin.id || '' })"
        class="plugin-config-confirm-card"
        rounded="xl"
      >
        <VCardText>{{ t("TXT_CODE_PLUGIN_DISABLE_CONFIRM") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" @click="disableConfirmOpen = false">
            {{ t("TXT_CODE_PLUGIN_CANCEL") }}
          </VBtn>
          <VBtn color="error" @click="confirmDisable">
            {{ t("TXT_CODE_PLUGIN_DISABLE") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <VDialog v-model="deleteConfirmOpen" max-width="460">
      <VCard
        :title="t('TXT_CODE_PLUGIN_DELETE_CONFIRM_TITLE', { name: deleteCandidate?.id || '' })"
        class="plugin-config-confirm-card"
        rounded="xl"
      >
        <VCardText>{{ t("TXT_CODE_PLUGIN_DELETE_CONFIRM") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" @click="deleteConfirmOpen = false">
            {{ t("TXT_CODE_PLUGIN_CANCEL") }}
          </VBtn>
          <VBtn
            color="error"
            prepend-icon="mdi-delete"
            :loading="deletingPlugin"
            @click="confirmRemove"
          >
            {{ t("TXT_CODE_PLUGIN_DELETE") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

<style lang="scss" scoped>
.plugin-config-page {
  position: relative;
  display: flex;
  width: 100%;
  box-sizing: border-box;
  height: min(720px, calc(100vh - 140px));
  min-height: 0;
  overflow: hidden;
  border-radius: 24px;
  background: var(--background-color-white);
  backdrop-filter: saturate(180%) blur(20px);
  color: var(--text-color);
}

:global(.desktop-container .plugin-config-page) {
  --plugin-config-surface-color: #ffffff;

  height: 100%;
  background: var(--plugin-config-surface-color);
}

:global(.app-dark-theme .desktop-container .plugin-config-page) {
  --plugin-config-surface-color: #1f1f27;
}

.plugin-config-sidebar {
  display: flex;
  flex-direction: column;
  flex: 0 0 240px;
  box-sizing: border-box;
  min-height: 0;
  padding: 24px 16px;
  overflow: hidden;
  background: var(--background-color-white);
}

:global(.desktop-container .plugin-config-sidebar),
:global(.desktop-container .plugin-config-content) {
  background: var(--plugin-config-surface-color);
}

.plugin-config-scope {
  display: flex;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 0 10px 12px;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
}

.plugin-config-scope :deep(.v-btn) {
  flex: 1;
  min-height: 32px;
  border-radius: 24px;
  color: var(--text-color) !important;
  text-align: center;
}

:global(.app-dark-theme) .plugin-config-scope :deep(.v-btn) {
  color: #fff !important;
}

.plugin-config-scope :deep(.v-btn--active) {
  background: rgb(var(--v-theme-primary));
  color: #fff !important;
}

.plugin-config-node-select {
  flex: 0 0 auto;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 0 0 8px;
  box-sizing: border-box;
}

.plugin-config-node-select :deep(.v-input__control),
.plugin-config-node-select :deep(.v-field) {
  width: 100%;
  min-width: 0;
}

.plugin-config-node-select :deep(.v-field__input) {
  min-width: 0;
  overflow: hidden;
}

.plugin-config-node-select :deep(.v-select__selection-text) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-config-heading {
  flex-shrink: 0;
  margin: 12px 10px 8px;
  line-height: 20px;
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
  opacity: 0.72;
}

.plugin-config-list {
  min-height: 0;
  flex: 1;
  width: 100%;
  box-sizing: border-box;
  overflow-y: auto;
  scrollbar-gutter: auto;
  background: transparent;
  padding: 0 10px 4px;
}

.plugin-config-list :deep(.v-list-item) {
  min-height: 36px;
  margin: 0 0 6px;
  padding-top: 2px;
  padding-bottom: 2px;
  overflow: hidden;
  border-radius: 24px !important;
  color: var(--text-color);
}

.plugin-config-list :deep(.v-list-item__content) {
  min-width: 0;
  overflow: hidden;
}

.plugin-config-list :deep(.v-list-item-title) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-config-list :deep(.v-list-item--active) {
  background: rgba(22, 119, 255, 0.12);
}

.plugin-config-list :deep(.v-list-item__overlay),
.plugin-config-list :deep(.v-list-item__underlay) {
  border-radius: inherit;
}

.plugin-config-list :deep(.plugin-config-item-off .v-list-item-title) {
  opacity: 0.42;
}

.plugin-config-item-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success);
}

.plugin-config-item-dot-off {
  background: var(--color-gray-6);
}

:global(.plugin-config-node-menu) {
  max-width: min(420px, calc(100vw - 32px));
  overflow: hidden;
  border-radius: 16px !important;
}

:global(.plugin-config-node-menu .v-list) {
  padding: 4px;
  background: rgb(var(--v-theme-surface));
}

:global(.plugin-config-node-menu .v-list-item) {
  min-height: 40px;
  border-radius: 12px;
}

:global(.plugin-config-node-menu .v-list-item-title) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-config-empty,
.plugin-config-no-config {
  padding: 28px 12px;
  color: var(--text-color);
  font-size: 13px;
  opacity: 0.62;
  text-align: center;
}

.plugin-config-content {
  min-width: 0;
  flex: 1;
  padding: 32px;
  padding-top: 20px;
  overflow: auto;
}

.plugin-config-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.plugin-config-title-row h2 {
  margin: 0;
  color: var(--text-color);
  font-size: 20px;
}

.plugin-config-meta {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.plugin-config-version {
  color: var(--text-color);
  font-size: 12px;
  opacity: 0.62;
}

.plugin-config-alert {
  margin-bottom: 20px;
}

.plugin-config-form {
  min-height: 100px;
}

.plugin-config-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
}

.plugin-config-schema-loading {
  display: flex;
  min-height: 120px;
  align-items: center;
  justify-content: center;
}

@media (max-width: 720px) {
  .plugin-config-page {
    flex-direction: column;
    height: auto;
    min-height: 0;
  }

  .plugin-config-sidebar {
    flex-basis: auto;
    max-height: 220px;
    padding: 16px 12px;
  }

  .plugin-config-list {
    flex: initial;
    max-height: 140px;
  }

  .plugin-config-content {
    padding: 24px;
  }

  .plugin-config-title-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>
