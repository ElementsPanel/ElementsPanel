<script setup lang="ts">
import { ctx } from "@/plugin/context";
import { t } from "@/lang/i18n";
import { reportErrorMsg } from "@/tools/validator";
import { message, Modal } from "ant-design-vue";
import { computed, onMounted, ref, watch } from "vue";
import { pluginList, setPluginEnabled, type PluginRecord } from "./api";

// The panel reports what is installed, because `plugin.json` is where the enable
// switch lives; a disabled plugin has to stay listed for the switch to turn it
// back on. The settings form beside the list is whatever the selected plugin
// contributed through `ctx.settings.page()`.

const loading = ref(true);
const pending = ref<string>("");
const plugins = ref<PluginRecord[]>([]);
const selectedId = ref("");

const selectedPlugin = computed(() => plugins.value.find((item) => item.id === selectedId.value));

const selectedForm = computed(
  () => ctx.settings.pages.find((page) => page.id === selectedId.value)?.component
);

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

onMounted(load);

watch(
  plugins,
  (value) => {
    if (!value.some((item) => item.id === selectedId.value)) {
      selectedId.value = value[0]?.id || "";
    }
  },
  { immediate: true }
);

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
 * Enabling is immediate; disabling asks first, because it removes whatever the
 * plugin contributed — including, for some plugins, authentication itself.
 */
const toggle = (plugin: PluginRecord, enabled: boolean) => {
  if (enabled) return apply(plugin, true);
  Modal.confirm({
    title: t("TXT_CODE_PLUGIN_DISABLE_CONFIRM_TITLE", { name: plugin.id }),
    content: t("TXT_CODE_PLUGIN_DISABLE_CONFIRM"),
    okButtonProps: { danger: true },
    onOk: () => apply(plugin, false)
  });
};
</script>

<template>
  <a-spin :spinning="loading">
    <div class="plugin-config-page">
      <div class="plugin-config-sidebar">
        <div class="plugin-config-heading">{{ t("TXT_CODE_PLUGIN_LIST") }}</div>
        <button
          v-for="plugin in plugins"
          :key="plugin.id"
          type="button"
          class="plugin-config-item"
          :class="{
            'plugin-config-item-active': plugin.id === selectedId,
            'plugin-config-item-off': !plugin.enabled
          }"
          @click="selectedId = plugin.id"
        >
          <span class="plugin-config-item-name">
            {{ plugin.id }}
          </span>
          <span v-if="!plugin.enabled" class="plugin-config-item-tag">
            {{ t("TXT_CODE_PLUGIN_DISABLE") }}
          </span>
          <span class="plugin-config-item-dot"></span>
        </button>
        <div v-if="!plugins.length" class="plugin-config-empty">{{ t("TXT_CODE_NO_DATA") }}</div>
      </div>

      <div class="plugin-config-content">
        <template v-if="selectedPlugin">
          <div class="plugin-config-title-row">
            <div>
              <h2>{{ selectedPlugin.id }}</h2>
              <p v-if="selectedPlugin.description" class="plugin-config-description">
                {{ selectedPlugin.description }}
              </p>
            </div>
            <div class="plugin-config-meta">
              <span v-if="selectedPlugin.version" class="plugin-config-version">
                {{ t("TXT_CODE_VERSION") }} {{ selectedPlugin.version }}
              </span>
              <a-switch
                :checked="selectedPlugin.enabled"
                :loading="pending === selectedPlugin.id"
                :checked-children="t('TXT_CODE_PLUGIN_ENABLE')"
                :un-checked-children="t('TXT_CODE_PLUGIN_DISABLE')"
                @change="toggle(selectedPlugin, !selectedPlugin.enabled)"
              />
            </div>
          </div>

          <a-alert
            v-if="!selectedPlugin.enabled"
            class="plugin-config-alert"
            type="warning"
            show-icon
            :message="t('TXT_CODE_PLUGIN_IS_DISABLED')"
          />
          <a-alert
            v-else-if="selectedPlugin.error"
            class="plugin-config-alert"
            type="error"
            show-icon
            :message="t('TXT_CODE_PLUGIN_LOAD_FAILED')"
            :description="selectedPlugin.error"
          />

          <div v-if="selectedForm" class="plugin-config-form">
            <component :is="selectedForm" />
          </div>
          <div v-else class="plugin-config-no-config">
            {{ t("TXT_CODE_PLUGIN_NO_CONFIG") }}
          </div>
        </template>
        <div v-else class="plugin-config-no-config">{{ t("TXT_CODE_NO_DATA") }}</div>
      </div>
    </div>
  </a-spin>
</template>

<style lang="scss" scoped>
.plugin-config-page {
  display: flex;
  width: 100%;
  min-height: min(720px, calc(100vh - 140px));
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
  flex: 0 0 240px;
  padding: 16px 10px;
  overflow-y: auto;
  background: var(--background-color-white);
}

:global(.desktop-container .plugin-config-sidebar),
:global(.desktop-container .plugin-config-content) {
  background: var(--plugin-config-surface-color);
}

.plugin-config-heading {
  padding: 4px 10px 12px;
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
  opacity: 0.72;
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

.plugin-config-item + .plugin-config-item {
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

.plugin-config-item-tag {
  flex-shrink: 0;
  padding: 0 5px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.08);
  font-size: 10px;
  line-height: 15px;
}

:global(.app-dark-theme) .plugin-config-item-tag {
  background: rgba(255, 255, 255, 0.14);
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

.plugin-config-description {
  max-width: 720px;
  margin: 8px 0 0;
  color: var(--text-color);
  font-size: 13px;
  opacity: 0.7;
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
    min-height: 0;
  }

  .plugin-config-sidebar {
    flex-basis: auto;
    max-height: 220px;
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
