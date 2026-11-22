<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import type { ComputedNodeInfo } from "@elementspanel/epanel-plugin-console/hooks/useOverviewInfo";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { computed, ref } from "vue";
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VCol,
  VIcon,
  VMenu,
  VProgressCircular,
  VRow,
  VTooltip
} from "vuetify/components";
import NodeSimpleChart from "../NodeSimpleChart.vue";
import NodeDetailDialog from "./NodeDetailDialog.vue";
import { useNodeCard } from "../../hooks/useNodeCard";
import { compatStatusText, compatStatusClass } from "../../compatibility";

const props = defineProps<{ item?: ComputedNodeInfo }>();
const remoteNode = computed(() => props.item);
const nodeDetailDialog = ref<InstanceType<typeof NodeDetailDialog>>();
const { compatMenuOpen, compatPanelVersionText, detailList, nodeOperations, copyValue } =
  useNodeCard({
    remoteNode,
    openDetails: (node, uuid) => nodeDetailDialog.value?.openDialog(node, uuid)
  });
</script>

<template>
  <div style="height: 100%" class="container">
    <VCard style="height: 100%" rounded="xl" flat class="node-card">
      <VCardTitle class="node-card-title">
        <div class="node-card-heading" :class="{ 'node-status-error': !remoteNode?.available }">
          <VIcon icon="mdi-server" size="20" class="node-card-icon" />
          <span class="node-card-name" :title="remoteNode?.remarks || remoteNode?.ip">
            {{ remoteNode?.remarks || remoteNode?.ip }}
          </span>
        </div>
        <VCardActions v-if="remoteNode" class="node-card-actions">
          <VTooltip v-for="operation in nodeOperations" :key="operation.title" location="top">
            <template #activator="{ props: tooltipProps }">
              <VBtn
                v-bind="tooltipProps"
                icon
                variant="text"
                size="small"
                :aria-label="operation.title"
                @click="remoteNode && operation.click(remoteNode)"
              >
                <VIcon :icon="operation.icon" size="18" />
              </VBtn>
            </template>
            <span>{{ operation.title }}</span>
          </VTooltip>
        </VCardActions>
      </VCardTitle>
      <VCardText v-if="remoteNode" class="node-card-content">
        <VRow density="compact">
          <VCol
            v-for="detail in detailList(remoteNode)"
            :key="detail.title + detail.value"
            :cols="detail.fullWidth ? 12 : 6"
            sm="3"
          >
            <div class="node-detail">
              <div class="node-detail-label" :title="detail.onlyCopy ? detail.value : ''">
                {{ detail.title }}
              </div>

              <div v-if="detail.onlyCopy">
                <VBtn
                  icon="mdi-content-copy"
                  variant="text"
                  size="x-small"
                  density="compact"
                  class="node-copy-btn"
                  :aria-label="`Copy ${detail.title}`"
                  @click="copyValue(detail.value)"
                />
              </div>
              <div v-else class="node-detail-value">
                <VMenu
                  v-if="detail.compatibility && !detail.danger"
                  v-model="compatMenuOpen"
                  :close-on-content-click="false"
                  location="bottom"
                  origin="top"
                  offset="6"
                  scroll-strategy="reposition"
                  content-class="node-compat-menu"
                >
                  <template #activator="{ props: menuProps }">
                    <span v-bind="menuProps" class="node-compat-toggle" role="button">
                      <VTooltip v-if="detail.warn" location="top">
                        <template #activator="{ props: tooltipProps }">
                          <span v-bind="tooltipProps" class="node-status-warning">
                            <VIcon icon="mdi-information-outline" size="16" /> {{ detail.value }}
                          </span>
                        </template>
                        <span>{{ detail.warnText }}</span>
                      </VTooltip>
                      <span v-else :class="detail.success ? 'node-status-success' : ''">
                        <VIcon v-if="detail.success" icon="mdi-check-circle-outline" size="16" />
                        {{ detail.value }}
                      </span>
                      <VIcon size="16" class="node-compat-chevron">
                        {{ compatMenuOpen ? "mdi-chevron-up" : "mdi-chevron-down" }}
                      </VIcon>
                    </span>
                  </template>
                  <div v-if="remoteNode" class="node-compat-panel" data-app-surface="card">
                    <div class="node-compat-section">
                      <div class="node-compat-title">
                        {{ t("TXT_CODE_NODE_COMPAT_VERSION_TITLE") }}
                      </div>
                      <div class="node-compat-row node-compat-version-row">
                        <span>{{ t("TXT_CODE_NODE_COMPAT_PANEL_VERSION") }}</span>
                        <span :title="compatPanelVersionText">
                          {{ compatPanelVersionText }}
                        </span>
                      </div>
                      <div class="node-compat-row node-compat-version-row">
                        <span>{{ t("TXT_CODE_NODE_COMPAT_NODE_VERSION") }}</span>
                        <span
                          :class="
                            remoteNode.available && remoteNode.compatibility?.version.ok === false
                              ? 'node-status-error'
                              : ''
                          "
                        >
                          {{ remoteNode.compatibility?.version.daemonVersion ?? "--" }}
                        </span>
                      </div>
                      <div
                        v-if="remoteNode.compatibility?.version.brandMismatch"
                        class="node-compat-note"
                      >
                        {{ t("TXT_CODE_NODE_BRAND_ERR") }}
                      </div>
                    </div>
                    <div class="node-compat-section">
                      <div class="node-compat-title">
                        {{ t("TXT_CODE_NODE_COMPAT_PLUGINS_TITLE") }}
                      </div>
                      <template v-if="remoteNode.compatibility?.plugins.items.length">
                        <div class="node-compat-row node-compat-header">
                          <span>{{ t("TXT_CODE_NODE_COMPAT_PLUGIN_NAME") }}</span>
                          <span>{{ t("TXT_CODE_NODE_COMPAT_PANEL_VERSION") }}</span>
                          <span>{{ t("TXT_CODE_NODE_COMPAT_NODE_VERSION") }}</span>
                          <span>{{ t("TXT_CODE_NODE_COMPAT_STATUS") }}</span>
                        </div>
                        <div
                          v-for="compatibilityItem in remoteNode.compatibility.plugins.items"
                          :key="compatibilityItem.id"
                          class="node-compat-row"
                        >
                          <span :title="compatibilityItem.id" class="node-compat-plugin-id">{{
                            compatibilityItem.id
                          }}</span>
                          <span>{{ compatibilityItem.panelVersion ?? "--" }}</span>
                          <span>{{ compatibilityItem.daemonVersion ?? "--" }}</span>
                          <span :class="compatStatusClass(compatibilityItem.status)">
                            <VIcon
                              :icon="
                                compatibilityItem.status === 'ok'
                                  ? 'mdi-check-circle-outline'
                                  : 'mdi-alert-circle-outline'
                              "
                              size="14"
                            />
                            {{ compatStatusText(compatibilityItem.status) }}
                          </span>
                        </div>
                      </template>
                      <Empty
                        v-else
                        :icon="false"
                        :title="t('TXT_CODE_NODE_COMPAT_NO_DATA')"
                        compact
                      />
                    </div>
                  </div>
                </VMenu>
                <!-- An MCSM node keeps no dropdown: the plugin comparison is meaningless. -->
                <VTooltip v-else-if="detail.compatibility && detail.danger" location="top">
                  <template #activator="{ props: tooltipProps }">
                    <span v-bind="tooltipProps" class="node-status-error">
                      <VIcon icon="mdi-alert-circle-outline" size="16" /> {{ detail.value }}
                    </span>
                  </template>
                  <span>{{ t("TXT_CODE_NODE_BRAND_ERR") }}</span>
                </VTooltip>
                <VTooltip v-else-if="detail.warn && detail.value" location="top">
                  <template #activator="{ props: tooltipProps }">
                    <span
                      v-bind="tooltipProps"
                      :class="
                        detail.danger
                          ? 'node-status-error'
                          : remoteNode?.brand !== 'ElementsPanel'
                          ? 'node-status-warning'
                          : 'node-status-error'
                      "
                    >
                      <VIcon icon="mdi-information-outline" size="16" /> {{ detail.value }}
                    </span>
                  </template>
                  <span>{{ detail.warnText }}</span>
                </VTooltip>
                <span v-else-if="detail.loading">
                  <VProgressCircular indeterminate size="16" width="2" />
                </span>
                <span v-else-if="detail.success">
                  <span class="node-status-success">
                    <VIcon icon="mdi-check-circle-outline" size="16" /> {{ detail.value }}
                  </span>
                </span>
                <span v-else style="white-space: pre-wrap">{{
                  String(detail.value ?? "").trim() ? detail.value : "--"
                }}</span>
              </div>
            </div>
          </VCol>
        </VRow>
        <NodeSimpleChart
          class="node-card-chart"
          :cpu-usage="remoteNode.cpuInfo ?? ''"
          :mem-usage="remoteNode.memText ?? ''"
          :cpu-data="remoteNode.cpuChartData ?? []"
          :mem-data="remoteNode.memChartData ?? []"
        />
      </VCardText>
    </VCard>
  </div>
  <NodeDetailDialog ref="nodeDetailDialog"></NodeDetailDialog>
</template>

<style lang="scss" scoped>
.node-status-error {
  color: var(--color-danger);
}

.node-status-warning {
  color: var(--color-warning);
}

.node-status-success {
  color: var(--color-success);
}

.node-card {
  color: var(--text-color);
}

.node-card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 14px 24px;
  color: var(--text-color);
}

.node-card-heading {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.node-card-icon {
  flex-shrink: 0;
}

.node-card-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-card-actions {
  flex-shrink: 0;
  min-height: auto;
  padding: 0;
  gap: 2px;
}

.node-card-content {
  padding: 24px;
  color: var(--text-color);
}

.node-detail {
  min-width: 0;
  min-height: 44px;
  color: var(--text-color);
}

.node-detail-label,
.node-detail-value {
  overflow-wrap: anywhere;
}

.node-detail-value {
  font-size: 13px;
}

.node-card-chart {
  margin-top: 32px;
}

.node-copy-btn {
  width: 24px;
  min-width: 24px;
  height: 24px;
  min-height: 24px;
  padding: 0;
}

.node-copy-btn :deep(.v-icon) {
  font-size: 16px;
}

.node-compat-toggle {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  gap: 4px;
  cursor: pointer;
  user-select: none;
}

.node-compat-toggle > span {
  min-width: 0;
}

.node-compat-chevron {
  flex-shrink: 0;
  opacity: 0.7;
}

:global(.node-compat-menu) {
  border-radius: 12px;
}

.node-compat-panel {
  padding: 12px 16px;
  border-radius: inherit;
  box-sizing: border-box;
  width: 420px;
  max-width: calc(100vw - 24px);
  max-height: min(340px, calc(100dvh - 24px));
  overflow-y: auto;
  font-size: 12px;
  color: var(--text-color);
}

.node-compat-section + .node-compat-section {
  margin-top: 12px;
}

.node-compat-title {
  font-weight: 600;
  margin-bottom: 6px;
  font-size: 13px;
}

.node-compat-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) 1fr 1fr 1.4fr;
  gap: 8px;
  align-items: center;
  padding: 2px 0;
}

.node-compat-row > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-compat-version-row {
  grid-template-columns: 1fr 1fr;
}

.node-compat-header {
  font-weight: 600;
  opacity: 0.8;
}

.node-compat-plugin-id {
  font-family: monospace;
}

.node-compat-note {
  margin-top: 6px;
  opacity: 0.85;
}

@media (max-width: 992px) {
  .node-card-title {
    padding: 16px 16px 8px;
  }

  .node-card-content {
    padding: 16px;
  }

  .node-card-chart {
    margin-top: 24px;
  }
}

@media (max-width: 599px) {
  .node-card-title {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .node-card-heading {
    align-items: flex-start;
  }

  .node-card-icon {
    margin-top: 4px;
  }

  .node-card-name {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .node-card-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px;

    :deep(.v-btn) {
      min-width: 44px;
      min-height: 44px;
    }
  }

  .node-compat-panel {
    padding: 12px;
  }

  .node-compat-row {
    gap: 6px;
    align-items: start;
  }

  .node-compat-row > span {
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
</style>
