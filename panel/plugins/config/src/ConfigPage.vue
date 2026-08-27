<script setup lang="ts">
import {
  getLoadedPanelFrontendPlugins,
  type LoadedPanelFrontendPlugin
} from "@/plugins";
import { t } from "@/lang/i18n";
import { computed, ref, watch } from "vue";

const loadedPlugins = getLoadedPanelFrontendPlugins();
const selectedId = ref("");

const plugins = computed(() =>
  [...loadedPlugins].sort(
    (a, b) =>
      (Number(a.metadata.priority) || 0) - (Number(b.metadata.priority) || 0) ||
      a.metadata.id.localeCompare(b.metadata.id)
  )
);

const selectedPlugin = computed<LoadedPanelFrontendPlugin | undefined>(() =>
  plugins.value.find((plugin) => plugin.metadata.id === selectedId.value)
);

watch(
  plugins,
  (value) => {
    if (!value.some((plugin) => plugin.metadata.id === selectedId.value)) {
      selectedId.value = value[0]?.metadata.id || "";
    }
  },
  { immediate: true }
);

const selectPlugin = (plugin: LoadedPanelFrontendPlugin) => {
  selectedId.value = plugin.metadata.id;
};
</script>

<template>
  <div class="plugin-config-page">
    <div class="plugin-config-sidebar">
      <div class="plugin-config-heading">{{ t("TXT_CODE_PLUGIN_LIST") }}</div>
      <button
        v-for="plugin in plugins"
        :key="plugin.metadata.id"
        type="button"
        class="plugin-config-item"
        :class="{ 'plugin-config-item-active': plugin.metadata.id === selectedId }"
        @click="selectPlugin(plugin)"
      >
        <span class="plugin-config-item-name">
          {{ plugin.metadata.name || plugin.metadata.id }}
        </span>
        <span class="plugin-config-item-id">{{ plugin.metadata.id }}</span>
      </button>
      <div v-if="!plugins.length" class="plugin-config-empty">{{ t("TXT_CODE_NO_DATA") }}</div>
    </div>

    <div class="plugin-config-content">
      <template v-if="selectedPlugin">
        <div class="plugin-config-title-row">
          <div>
            <h2>{{ selectedPlugin.metadata.name || selectedPlugin.metadata.id }}</h2>
            <p v-if="selectedPlugin.metadata.description" class="plugin-config-description">
              {{ selectedPlugin.metadata.description }}
            </p>
          </div>
          <span v-if="selectedPlugin.metadata.version" class="plugin-config-version">
            {{ t("TXT_CODE_VERSION") }} {{ selectedPlugin.metadata.version }}
          </span>
        </div>

        <div v-if="selectedPlugin.configuration?.component" class="plugin-config-form">
          <component :is="selectedPlugin.configuration.component" />
        </div>
        <div v-else class="plugin-config-no-config">
          {{ t("TXT_CODE_PLUGIN_NO_CONFIG") }}
        </div>
      </template>
      <div v-else class="plugin-config-no-config">{{ t("TXT_CODE_NO_DATA") }}</div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.plugin-config-page {
  --plugin-config-divider-color: rgba(0, 0, 0, 0.12);

  display: flex;
  width: 100%;
  min-height: min(720px, calc(100vh - 140px));
  overflow: hidden;
  border-radius: 8px;
  background: var(--background-color-white);
  color: var(--text-color);
}

:global(.app-dark-theme) .plugin-config-page {
  --plugin-config-divider-color: rgba(255, 255, 255, 0.1);
}

:global(.desktop-container) .plugin-config-page {
  background: var(--desktop-window-bg);
}

.plugin-config-sidebar {
  flex: 0 0 240px;
  padding: 16px 10px;
  overflow-y: auto;
  border-right: 1px solid var(--plugin-config-divider-color);
  background: var(--background-color);
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
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: 10px;
  border: 0;
  border-radius: 6px;
  color: var(--text-color);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.2s ease;
}

.plugin-config-item:hover,
.plugin-config-item-active {
  background: rgba(22, 119, 255, 0.12);
}

.plugin-config-item-name {
  max-width: 100%;
  overflow: hidden;
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-config-item-id {
  color: var(--text-color);
  font-size: 11px;
  opacity: 0.58;
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

.plugin-config-version {
  flex-shrink: 0;
  color: var(--text-color);
  font-size: 12px;
  opacity: 0.62;
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
    border-right: 0;
    border-bottom: 1px solid var(--plugin-config-divider-color);
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
