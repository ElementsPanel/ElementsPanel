<script setup lang="ts">
import PageToolbar from "@elementspanel/epanel-plugin-console/components/PageToolbar";
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { VBtn, VContainer, VIcon, VList, VListItem, VMenu, VTab, VTabs } from "vuetify/components";
import ConfigPage from "../ConfigPage.vue";

const route = useRoute();
const configPage = ref<InstanceType<typeof ConfigPage>>();
const scope = computed<"panel" | "node">({
  get: () => configPage.value?.scope ?? (route.query.scope === "node" ? "node" : "panel"),
  set: (value) => {
    if (configPage.value) configPage.value.scope = value;
  }
});
const selectedNodeId = computed({
  get: () => configPage.value?.selectedNodeId ?? String(route.query.daemonId ?? ""),
  set: (value: string) => {
    if (configPage.value) configPage.value.selectedNodeId = value;
  }
});
const nodeItems = computed(() => configPage.value?.nodeItems ?? []);
const selectedNodeLabel = computed(
  () =>
    nodeItems.value.find((node) => node.value === selectedNodeId.value)?.title ||
    t("TXT_CODE_PLUGIN_NODE_SELECT")
);
</script>

<template>
  <VContainer fluid class="plugin-config-container">
    <PageToolbar
      class="plugin-config-toolbar"
      :title="t('TXT_CODE_PLUGIN_CONFIG')"
      icon="mdi-cog-outline"
    >
      <template #actions>
        <VMenu v-if="scope === 'node'" location="bottom end">
          <template #activator="{ props: menuProps }">
            <VBtn
              v-bind="menuProps"
              class="plugin-config-node-selector"
              variant="tonal"
              prepend-icon="mdi-server-outline"
              :loading="configPage?.loading ?? true"
              :aria-label="t('TXT_CODE_PLUGIN_NODE_SELECT')"
            >
              <span class="plugin-config-node-name">{{ selectedNodeLabel }}</span>
              <VIcon icon="mdi-chevron-down" end />
            </VBtn>
          </template>
          <VList density="comfortable">
            <VListItem
              v-for="node in nodeItems"
              :key="node.value"
              :active="node.value === selectedNodeId"
              :title="node.title"
              prepend-icon="mdi-database-outline"
              @click="selectedNodeId = node.value"
            />
            <Empty v-if="!nodeItems.length" :icon="false" compact />
          </VList>
        </VMenu>
        <VTabs
          v-model="scope"
          align-tabs="start"
          color="primary"
          density="compact"
          class="plugin-config-scope-tabs"
        >
          <VTab value="panel">{{ t("TXT_CODE_PLUGIN_SCOPE_PANEL") }}</VTab>
          <VTab value="node">{{ t("TXT_CODE_PLUGIN_SCOPE_NODE") }}</VTab>
        </VTabs>
      </template>
    </PageToolbar>
    <ConfigPage ref="configPage" hide-scope-switch hide-node-select />
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

.plugin-config-scope-tabs {
  flex: 0 0 auto;
}

.plugin-config-node-selector {
  flex-shrink: 0;
}

.plugin-config-node-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  padding: 0 16px 0 0;
  background: transparent;
}

.plugin-config-container :deep(.plugin-config-content) {
  padding: 0 0 0 24px;
}

@media (max-width: 992px) {
  :global(.global-app-container:has(.plugin-config-container)) {
    margin-bottom: 0;
  }

  .plugin-config-container {
    padding: 16px 12px 28px;
  }

  .plugin-config-node-name {
    max-width: 100px;
  }

  .plugin-config-container :deep(.plugin-config-content) {
    width: 100%;
    padding: 0;
  }

  .plugin-config-container :deep(.plugin-config-sidebar) {
    height: 100%;
    padding: 16px;
  }
}
</style>
