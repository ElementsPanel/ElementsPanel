<script setup lang="ts">
import { t } from "@/lang/i18n";
import { ctx } from "@/plugin/context";
import { getValidatorErrorMsg } from "@/tools/validator";
import { computed, onMounted, reactive, ref, watch } from "vue";
import {
  VAlert,
  VBtn,
  VBtnToggle,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VDialog,
  VList,
  VListItem,
  VProgressCircular,
  VProgressLinear,
  VSelect,
  VSpacer,
  VSnackbar,
  VSwitch
} from "vuetify/lib/components/index.mjs";
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

const nodeLabel = (node: NodeSummary) =>
  `${node.remarks || `${node.ip}:${node.port}`}${node.available ? "" : ` (${t("TXT_CODE_PLUGIN_NODE_OFFLINE")})`
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

/** The selected plugin's declared form, or null when it declared none. */
const schema = ref<SettingsSchema | null>(null);
const schemaLoading = ref(false);
const savingSettings = ref(false);
const disableCandidate = ref<PluginRecord | NodePluginRecord | null>(null);
const disableConfirmOpen = ref(false);
const feedback = reactive({
  open: false,
  text: "",
  color: "success" as "success" | "error"
});

const notify = (text: string, color: "success" | "error") => {
  feedback.text = text;
  feedback.color = color;
  feedback.open = true;
};

const notifyError = (error: unknown) => {
  console.error("Plugin configuration error:", error);
  notify(getValidatorErrorMsg(error, t("TXT_CODE_6a365d01")), "error");
};

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
  const reloadPanel =
    scope.value === "panel" && ["i18n", "console"].includes(schema.value.id);
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
    notify(t("TXT_CODE_d3de39b4"), "success");
    if (reloadPanel) {
      window.setTimeout(() => window.location.reload(), 400);
      return;
    }
    await loadSchema();
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
 * plugin contributed — including, for some plugins, authentication itself.
 */
const toggle = (plugin: PluginRecord | NodePluginRecord, enabled: boolean) => {
  const commit = () =>
    scope.value === "panel"
      ? apply(plugin as PluginRecord, enabled)
      : applyNode(plugin as NodePluginRecord, enabled);
  if (enabled) return commit();
  disableCandidate.value = plugin;
  disableConfirmOpen.value = true;
};

const toggleSelected = (enabled: boolean) => {
  if (selectedPlugin.value) toggle(selectedPlugin.value, enabled);
};

const confirmDisable = () => {
  const plugin = disableCandidate.value;
  disableCandidate.value = null;
  disableConfirmOpen.value = false;
  if (plugin) {
    return scope.value === "panel"
      ? apply(plugin as PluginRecord, false)
      : applyNode(plugin as NodePluginRecord, false);
  }
};

</script>

<template>
  <div class="plugin-config-page">
    <VProgressLinear v-if="loading" class="plugin-config-loading" color="primary" indeterminate />

    <div class="plugin-config-sidebar">
      <VBtnToggle v-model="scope" class="plugin-config-scope" color="primary" mandatory divided>
        <VBtn value="panel" size="small">{{ t("TXT_CODE_PLUGIN_SCOPE_PANEL") }}</VBtn>
        <VBtn value="node" size="small">{{ t("TXT_CODE_PLUGIN_SCOPE_NODE") }}</VBtn>
      </VBtnToggle>

      <VSelect
        v-if="scope === 'node'"
        v-model="selectedNodeId"
        class="plugin-config-node-select"
        :items="nodeItems"
        :loading="loading"
        :placeholder="t('TXT_CODE_PLUGIN_NODE_SELECT')"
        variant="outlined"
        density="compact"
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
              :class="{ 'plugin-config-item-dot-off': !plugin.enabled }"
            ></span>
          </template>
        </VListItem>
        <div v-if="!currentList.length" class="plugin-config-empty">{{ t("TXT_CODE_NO_DATA") }}</div>
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
            <span v-if="scope === 'node' && selectedNode" class="plugin-config-version">
              {{ nodeLabel(selectedNode) }}
            </span>
            <span v-if="selectedPlugin.version" class="plugin-config-version">
              {{ t("TXT_CODE_VERSION") }} {{ selectedPlugin.version }}
            </span>
            <VSwitch
              :model-value="selectedPlugin.enabled"
              :loading="pending === selectedPlugin.id"
              :label="selectedPlugin.enabled ? t('TXT_CODE_PLUGIN_ENABLE') : t('TXT_CODE_PLUGIN_DISABLE')"
              color="primary"
              density="compact"
              hide-details
              @update:model-value="toggleSelected(Boolean($event))"
            />
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

        <div v-if="schemaLoading" class="plugin-config-schema-loading">
          <VProgressCircular color="primary" indeterminate size="28" />
        </div>
        <div v-else-if="schema && schema.fields.length" class="plugin-config-form">
          <SchemaForm
            :fields="schema.fields"
            :values="schema.values"
            :saving="savingSettings"
            @save="saveSettings"
          />
        </div>
        <div v-else class="plugin-config-no-config">
          {{ t("TXT_CODE_PLUGIN_NO_CONFIG") }}
        </div>
      </template>
      <div v-else-if="!nodeError" class="plugin-config-no-config">{{ t("TXT_CODE_NO_DATA") }}</div>
    </div>

    <VDialog v-model="disableConfirmOpen" max-width="460">
      <VCard>
        <VCardTitle>
          {{ disableCandidate ? t("TXT_CODE_PLUGIN_DISABLE_CONFIRM_TITLE", { name: disableCandidate.id }) : "" }}
        </VCardTitle>
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

    <VSnackbar v-model="feedback.open" :color="feedback.color" :timeout="3200" location="bottom end">
      {{ feedback.text }}
    </VSnackbar>
  </div>
</template>

<style lang="scss" scoped>
.plugin-config-page {
  position: relative;
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

  height: 100%;
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

.plugin-config-scope :deep(.v-btn) {
  flex: 1;
  text-align: center;
}

.plugin-config-node-select {
  flex: 0 0 calc(100% - 20px);
  width: calc(100% - 20px);
  max-width: calc(100% - 20px);
  height: 34px;
  max-height: 34px;
  margin: 0 10px 2px;
  box-sizing: border-box;
  --v-input-control-height: 34px;
  --v-input-padding-top: 0px;
}

.plugin-config-node-select :deep(.v-field) {
  height: 34px;
  min-height: 34px;
}

.plugin-config-node-select :deep(.v-field__input) {
  height: 34px;
  min-height: 34px;
  padding: 0 12px;
}

.plugin-config-heading {
  flex-shrink: 0;
  padding: 0 10px 2px;
  line-height: 20px;
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
  background: transparent;
  padding: 0 10px 4px;
}

.plugin-config-list :deep(.v-list-item) {
  min-height: 36px;
  margin: 0;
  padding-top: 2px;
  padding-bottom: 2px;
  border-radius: 6px;
  color: var(--text-color);
}

.plugin-config-list :deep(.v-list-item--active) {
  background: rgba(22, 119, 255, 0.12);
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
