<script setup lang="ts">
import PageToolbar from "@elementspanel/epanel-plugin-console/components/PageToolbar";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { VCard, VContainer } from "vuetify/components";
import ConfigPage from "../components/ConfigPage.vue";
import PluginConfigTargetSelector from "../components/PluginConfigTargetSelector.vue";

const route = useRoute();
const configPage = ref<InstanceType<typeof ConfigPage>>();
const selectedTargetId = computed({
  get: () => {
    if (configPage.value) return configPage.value.selectedTargetId;
    return route.query.scope === "node" ? String(route.query.daemonId ?? "") || undefined : "";
  },
  set: (value: string | undefined) => {
    if (configPage.value) configPage.value.selectedTargetId = value;
  }
});
const nodes = computed(() => configPage.value?.nodes ?? []);
</script>

<template>
  <VContainer fluid class="plugin-config-container">
    <PageToolbar
      class="plugin-config-toolbar"
      :title="t('TXT_CODE_PLUGIN_CONFIG')"
      icon="mdi-cog-outline"
    >
      <template #actions>
        <PluginConfigTargetSelector
          v-model="selectedTargetId"
          :nodes="nodes"
          :loading="configPage?.nodesLoading ?? false"
          @open="configPage?.loadNodes()"
        />
      </template>
    </PageToolbar>
    <VCard class="plugin-config-card" flat rounded="xl">
      <ConfigPage ref="configPage" data-app-surface="transparent" hide-target-select />
    </VCard>
  </VContainer>
</template>

<style lang="scss" scoped>
:global(.app-shell-content:has(.plugin-config-container)),
:global(.main-content:has(.plugin-config-container)) {
  display: flex;
  min-width: 0;
  overflow: hidden;
}

:global(.main-content:has(.plugin-config-container)),
:global(.app-main-body:has(> .plugin-config-container)) {
  flex: 1 1 0;
  min-height: 0;
}

:global(.app-main-body:has(> .plugin-config-container)) {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

:global(.app-main-body:has(> .plugin-config-container) > .breadcrumbs) {
  flex: 0 0 auto;
}

.plugin-config-container {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  width: 100%;
  min-width: 0;
  min-height: 0;
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 20px 24px 32px;
  box-sizing: border-box;
  overflow: hidden;
}

.plugin-config-toolbar {
  flex: 0 0 auto;
}

.plugin-config-toolbar :deep(.page-toolbar-actions) {
  justify-content: flex-end;
}

.plugin-config-card {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
}

.plugin-config-container :deep(.plugin-config-page) {
  flex: 1 1 0;
  height: 100%;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.plugin-config-container :deep(.plugin-config-sidebar) {
  padding: 20px 12px;
  background: transparent;
}

.plugin-config-container :deep(.plugin-config-content) {
  padding: 20px;
}

@media (max-width: 992px) {
  :global(.app-shell-content:has(.plugin-config-container)),
  :global(.main-content:has(.plugin-config-container)),
  :global(.app-main-body:has(> .plugin-config-container)) {
    display: block;
    overflow: visible;
  }

  .plugin-config-container {
    flex: none;
    padding: 16px 12px 28px;
    overflow: visible;
  }

  .plugin-config-container > .plugin-config-card {
    background: transparent !important;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .plugin-config-card,
  .plugin-config-container :deep(.plugin-config-page),
  .plugin-config-container :deep(.plugin-config-content),
  .plugin-config-container :deep(.plugin-config-body) {
    flex: none;
    height: auto;
  }

  .plugin-config-container :deep(.plugin-config-body) {
    overflow: visible;
  }

  .plugin-config-container :deep(.plugin-config-content) {
    width: 100%;
    padding: 16px 12px;
  }

  .plugin-config-container :deep(.plugin-config-sidebar) {
    height: 100%;
    padding: 16px;
  }
}
</style>
