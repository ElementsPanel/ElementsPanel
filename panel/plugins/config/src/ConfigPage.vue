<script setup lang="ts">
import { t } from "@/lang/i18n";
import { ctx } from "@/plugin/context";
import { reportErrorMsg } from "@/tools/validator";
import { message, Modal } from "ant-design-vue";
import { computed, onMounted, ref, watch } from "vue";
import {
  nodeList,
  nodePluginList,
  nodePluginSettings,
  pluginList,
  pluginSettings,
  setNodePluginEnabled,
  setPluginEnabled,
  updateNodePluginSettings,
  updatePluginSettings,
  type NodePluginRecord,
  type NodeSummary,
  type PluginRecord,
  type SettingsSchema
} from "./api";
import SchemaForm from "./SchemaForm.vue";

// The panel reports what is installed, because `plugin.json` is where the enable
// switch lives; a disabled plugin has to stay listed for the switch to turn it
// back on.
//
// The form beside the list is not a component any plugin shipped: a plugin
// describes its configuration on its backend, and this page renders that
// description. That is the only reason a daemon plugin can have a settings form
// at all — the browser holds no copy of a daemon plugin.

type Scope = "panel" | "node";

const scope = ref<Scope>("panel");

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

const selectedNode = computed(() => nodes.value.find((item) => item.uuid === selectedNodeId.value));

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

/** The selected plugin's declared form, or null when it declared none. */
const schema = ref<SettingsSchema | null>(null);
const schemaLoading = ref(false);
const savingSettings = ref(false);

const loadSchema = async () => {
  schema.value = null;
  const id = currentId.value;
  if (!id) return;
  if (scope.value === "node" && !selectedNodeId.value) return;
  schemaLoading.value = true;
  try {
    if (scope.value === "panel") {
      const { execute } = pluginSettings();
      const res = await execute({ params: { id } });
      schema.value = res.value ?? null;
    } else {
      const { execute } = nodePluginSettings();
      const res = await execute({ params: { daemonId: selectedNodeId.value, id } });
      schema.value = res.value ?? null;
    }
  } catch (error: any) {
    // A plugin that declared nothing is the common case; a real failure is
    // reported by the list above, which uses the same connection.
    schema.value = null;
  } finally {
    schemaLoading.value = false;
  }
};

const saveSettings = async () => {
  if (!schema.value) return;
  savingSettings.value = true;
  const reloadPanel = scope.value === "panel" && schema.value.id === "i18n";
  try {
    const values = schema.value.values;
    if (scope.value === "panel") {
      const { execute } = updatePluginSettings();
      await execute({ params: { id: schema.value.id }, data: values });
    } else {
      const { execute } = updateNodePluginSettings();
      await execute({
        params: { daemonId: selectedNodeId.value, id: schema.value.id },
        data: values
      });
    }
    message.success(t("TXT_CODE_d3de39b4"));
    if (reloadPanel) {
      window.setTimeout(() => window.location.reload(), 400);
      return;
    }
    await loadSchema();
  } catch (error: any) {
    reportErrorMsg(error?.message ?? String(error));
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
    reportErrorMsg(error?.message ?? String(error));
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
  nodePlugins.value = [];
  if (!selectedNodeId.value) return;
  loading.value = true;
  nodeError.value = "";
  try {
    const { execute } = nodePluginList();
    const res = await execute({ params: { daemonId: selectedNodeId.value } });
    nodePlugins.value = res.value ?? [];
  } catch (error: any) {
    nodeError.value = error?.message ?? String(error);
  } finally {
    loading.value = false;
  }
};

/**
 * Toggling a plugin reconnects the node, because that is what makes a daemon
 * rebind its protocol events. The list is therefore re-read with a few retries:
 * the first attempt often lands while the socket is still coming back up.
 */
const reloadNodePluginsAfterToggle = async () => {
  for (let attempt = 0; attempt < 4; attempt++) {
    await loadNodePlugins();
    if (!nodeError.value) return;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
};

onMounted(load);

watch(scope, (value) => {
  if (value === "node" && !nodes.value.length && !nodeError.value) loadNodes();
});

watch(selectedNodeId, () => loadNodePlugins());

watch(
  plugins,
  (value) => {
    if (!value.some((item) => item.id === selectedId.value)) {
      selectedId.value = value[0]?.id || "";
    }
  },
  { immediate: true }
);

watch(nodePlugins, (value) => {
  if (!value.some((item) => item.id === nodeSelectedId.value)) {
    nodeSelectedId.value = value[0]?.id || "";
  }
});

// Whatever is selected, its form comes from the backend that declared it.
watch([scope, currentId, selectedNodeId], () => loadSchema(), { immediate: true });

const apply = async (plugin: PluginRecord, enabled: boolean) => {
  pending.value = plugin.id;
  try {
    const { execute } = setPluginEnabled();
    await execute({ data: { id: plugin.id, enabled } });
    // The panel has already applied the change to its own half. The browser
    // reconciles itself against the manifest, which now reflects the switch, so
    // the plugin's routes, cards and menus appear or disappear with it.
    await ctx.plugins.refresh();
    await load();
    message.success(t(enabled ? "TXT_CODE_PLUGIN_ENABLED" : "TXT_CODE_PLUGIN_DISABLED"));
  } catch (error: any) {
    reportErrorMsg(error?.message ?? String(error));
    await load();
  } finally {
    pending.value = "";
  }
};

/**
 * The daemon applies the switch itself and answers with the updated record, so
 * there is nothing for the browser to reconcile — only the list to re-read.
 */
const applyNode = async (plugin: NodePluginRecord, enabled: boolean) => {
  pending.value = plugin.id;
  try {
    const { execute } = setNodePluginEnabled();
    await execute({
      params: { daemonId: selectedNodeId.value },
      data: { id: plugin.id, enabled }
    });
    message.success(t(enabled ? "TXT_CODE_PLUGIN_ENABLED" : "TXT_CODE_PLUGIN_DISABLED"));
  } catch (error: any) {
    reportErrorMsg(error?.message ?? String(error));
  } finally {
    pending.value = "";
    await reloadNodePluginsAfterToggle();
  }
};

/**
 * Enabling is immediate; disabling asks first, because it removes whatever the
 * plugin contributed — including, for some plugins, authentication itself.
 */
const toggle = (plugin: PluginRecord | NodePluginRecord, enabled: boolean) => {
  const commit = () =>
    scope.value === "panel"
      ? apply(plugin as PluginRecord, enabled)
      : applyNode(plugin as NodePluginRecord, enabled);
  if (enabled) return commit();
  Modal.confirm({
    title: t("TXT_CODE_PLUGIN_DISABLE_CONFIRM_TITLE", { name: plugin.id }),
    content: t("TXT_CODE_PLUGIN_DISABLE_CONFIRM"),
    okButtonProps: { danger: true },
    onOk: commit
  });
};

const nodeLabel = (node: NodeSummary) =>
  `${node.remarks || `${node.ip}:${node.port}`}${node.available ? "" : ` (${t("TXT_CODE_PLUGIN_NODE_OFFLINE")})`
  }`;
</script>

<template>
  <a-spin :spinning="loading">
    <div class="plugin-config-page">
      <div class="plugin-config-sidebar">
        <a-radio-group v-model:value="scope" class="plugin-config-scope" button-style="solid">
          <a-radio-button value="panel">{{ t("TXT_CODE_PLUGIN_SCOPE_PANEL") }}</a-radio-button>
          <a-radio-button value="node">{{ t("TXT_CODE_PLUGIN_SCOPE_NODE") }}</a-radio-button>
        </a-radio-group>

        <a-select v-if="scope === 'node'" v-model:value="selectedNodeId" class="plugin-config-node-select"
          :placeholder="t('TXT_CODE_PLUGIN_NODE_SELECT')">
          <a-select-option v-for="node in nodes" :key="node.uuid" :value="node.uuid">
            {{ nodeLabel(node) }}
          </a-select-option>
        </a-select>

        <div class="plugin-config-heading">{{ t("TXT_CODE_PLUGIN_LIST") }}</div>
        <div class="plugin-config-list">
          <button v-for="plugin in currentList" :key="plugin.id" type="button" class="plugin-config-item" :class="{
            'plugin-config-item-active': plugin.id === currentId,
            'plugin-config-item-off': !plugin.enabled
          }" @click="currentId = plugin.id">
            <span class="plugin-config-item-name">
              {{ plugin.id }}
            </span>
            <span class="plugin-config-item-dot"></span>
          </button>
          <div v-if="!currentList.length" class="plugin-config-empty">{{ t("TXT_CODE_NO_DATA") }}</div>
        </div>
      </div>

      <div class="plugin-config-content">
        <a-alert v-if="scope === 'node' && nodeError" class="plugin-config-alert" type="warning" show-icon
          :message="t('TXT_CODE_PLUGIN_NODE_LIST_FAILED')" :description="nodeError" />

        <template v-if="selectedPlugin">
          <div class="plugin-config-title-row">
            <div>
              <h2>{{ selectedPlugin.id }}</h2>
            </div>
            <div class="plugin-config-meta">
              <span v-if="scope === 'node' && selectedNode" class="plugin-config-version">
                {{ nodeLabel(selectedNode) }}
              </span>
              <span v-if="selectedPlugin.version" class="plugin-config-version">
                {{ t("TXT_CODE_VERSION") }} {{ selectedPlugin.version }}
              </span>
              <a-switch :checked="selectedPlugin.enabled" :loading="pending === selectedPlugin.id"
                :checked-children="t('TXT_CODE_PLUGIN_ENABLE')" :un-checked-children="t('TXT_CODE_PLUGIN_DISABLE')"
                @change="toggle(selectedPlugin, !selectedPlugin.enabled)" />
            </div>
          </div>

          <a-alert v-if="!selectedPlugin.enabled" class="plugin-config-alert" type="warning" show-icon
            :message="t('TXT_CODE_PLUGIN_IS_DISABLED')" />
          <a-alert v-else-if="selectedPlugin.error" class="plugin-config-alert" type="error" show-icon
            :message="t('TXT_CODE_PLUGIN_LOAD_FAILED')" :description="selectedPlugin.error" />

          <a-spin :spinning="schemaLoading">
            <div v-if="schema && schema.fields.length" class="plugin-config-form">
              <SchemaForm :fields="schema.fields" :values="schema.values" :saving="savingSettings"
                @save="saveSettings" />
            </div>
            <div v-else-if="!schemaLoading" class="plugin-config-no-config">
              {{ t("TXT_CODE_PLUGIN_NO_CONFIG") }}
            </div>
          </a-spin>
        </template>
        <div v-else-if="!nodeError" class="plugin-config-no-config">{{ t("TXT_CODE_NO_DATA") }}</div>
      </div>
    </div>
  </a-spin>
</template>

<style lang="scss" scoped>
.plugin-config-page {
  display: flex;
  width: 100%;
  height: min(720px, calc(100vh - 140px));
  min-height: 0;
  overflow: hidden;
  border-radius: 12px;
  background: var(--background-color-white);
  backdrop-filter: saturate(180%) blur(20px);
  color: var(--text-color);
}

:global(.desktop-container .plugin-config-page) {
  --plugin-config-surface-color: #FFFFFF;

  background: var(--plugin-config-surface-color);
}

:global(.app-dark-theme .desktop-container .plugin-config-page) {
  --plugin-config-surface-color: #1F1F27;
}

.plugin-config-sidebar {
  display: flex;
  flex-direction: column;
  flex: 0 0 240px;
  min-height: 0;
  padding: 16px 10px;
  overflow: hidden;
  background: var(--background-color-white);
}

:global(.desktop-container .plugin-config-sidebar),
:global(.desktop-container .plugin-config-content) {
  background: var(--plugin-config-surface-color);
}

.plugin-config-scope {
  display: flex;
  width: 100%;
  padding: 0 10px 12px;
}

.plugin-config-scope :deep(.ant-radio-button-wrapper) {
  flex: 1;
  text-align: center;
}

.plugin-config-node-select {
  width: calc(100% - 20px);
  margin: 0 10px 12px;
}

.plugin-config-heading {
  flex-shrink: 0;
  padding: 4px 10px 12px;
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
  opacity: 0.72;
}

.plugin-config-list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.plugin-config-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  border: 0;
  border-radius: 6px;
  color: var(--text-color);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.2s ease;
}

.plugin-config-item+.plugin-config-item {
  margin-top: 6px;
}

.plugin-config-item:hover,
.plugin-config-item-active {
  background: rgba(22, 119, 255, 0.12);
}

.plugin-config-item-off .plugin-config-item-name {
  opacity: 0.42;
}

.plugin-config-item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-config-item-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success);
}

.plugin-config-item-off .plugin-config-item-dot {
  background: var(--color-gray-6);
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
  padding: 24px;
  overflow: auto;
}

.plugin-config-title-row {
  display: flex;
  align-items: flex-start;
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
  align-items: center;
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

@media (max-width: 720px) {
  .plugin-config-page {
    flex-direction: column;
    height: auto;
    min-height: 0;
  }

  .plugin-config-sidebar {
    flex-basis: auto;
    max-height: 220px;
  }

  .plugin-config-list {
    flex: initial;
    max-height: 140px;
  }

  .plugin-config-content {
    padding: 16px;
  }

  .plugin-config-title-row {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
