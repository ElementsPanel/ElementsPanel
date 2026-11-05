<script setup lang="ts">
import Empty from "@/components/Empty.vue";
import { GLOBAL_INSTANCE_UUID } from "@/config/const";
import { useAppRouters } from "@/hooks/useAppRouters";
import type { ComputedNodeInfo } from "@/hooks/useOverviewInfo";
import { SocketStatus, useSocketIoClient } from "@/hooks/useSocketIo";
import { t } from "@/lang/i18n";
import { arrayFilter } from "@/tools/array";
import { reportErrorMsg } from "@/tools/validator";
import { message } from "@/tools/vuetifyToast";
import { computed, onMounted, ref } from "vue";
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
import { connectNode } from "../../api";
import NodeSimpleChart from "../NodeSimpleChart.vue";
import NodeDetailDialog from "./NodeDetailDialog.vue";

const { testFrontendSocket, socketStatus } = useSocketIoClient();

const nodeDetailDialog = ref<InstanceType<typeof NodeDetailDialog>>();

const props = defineProps<{
  item?: ComputedNodeInfo;
}>();

const remoteNode = computed(() => props.item);

const compatMenuOpen = ref(false);

const compatPanelVersionText = computed(() => {
  const version = remoteNode.value?.compatibility?.version;
  if (!version?.panelVersion) return "--";
  return `${version.panelVersion}（${t("TXT_CODE_NODE_COMPAT_REQUIRED_NODE")} ${version.requiredDaemonVersion}）`;
});

const compatStatusText = (status: IPanelNodeCompatibilityPluginItem["status"]) =>
  ({
    ok: t("TXT_CODE_NODE_COMPAT_PLUGIN_MATCH"),
    mismatch: t("TXT_CODE_NODE_COMPAT_PLUGIN_DIFF"),
    panel_only: t("TXT_CODE_NODE_COMPAT_ONLY_PANEL"),
    daemon_only: t("TXT_CODE_NODE_COMPAT_ONLY_NODE"),
    missing_panel: t("TXT_CODE_NODE_COMPAT_MISSING_PANEL"),
    missing_daemon: t("TXT_CODE_NODE_COMPAT_MISSING_DAEMON")
  })[status];

const compatStatusClass = (status: IPanelNodeCompatibilityPluginItem["status"]) =>
  status === "ok" ? "color-success" : status === "mismatch" || status.startsWith("missing_") ? "color-danger" : "";

const tryConnectNode = async (uuid: string, showMsg = true) => {
  const { execute } = connectNode();
  try {
    await execute({
      params: {
        uuid: uuid
      }
    });
    if (showMsg) message.success(t("TXT_CODE_7f0c746d"));
  } catch (error: any) {
    reportErrorMsg(t("TXT_CODE_6a365d01"));
  }
};

const { toPage } = useAppRouters();

const detailList = (node: ComputedNodeInfo) => [
  {
    title: t("TXT_CODE_f52079a0"),
    value: `${node.ip}:${node.port}`,
    fullWidth: true
  },
  {
    title: t("TXT_CODE_7c0b7608"),
    value: node.available ? t("TXT_CODE_823bfe63") : t("TXT_CODE_66ce073e"),
    warn: node.available === false,
    success: node.available === true,
    danger: node.available === false,
    warnText: t("TXT_CODE_1c2efd38")
  },
  {
    title: t("TXT_CODE_930d2524"),
    value:
      socketStatus.value === SocketStatus.Connected
        ? t("TXT_CODE_e039b9b5")
        : t("TXT_CODE_23a3bd72"),
    warn: socketStatus.value === SocketStatus.Error,
    success: socketStatus.value === SocketStatus.Connected,
    loading: socketStatus.value === SocketStatus.Connecting,
    danger: socketStatus.value === SocketStatus.Error,
    warnText: t("TXT_CODE_6b4a27dd")
  },
  {
    title: t("TXT_CODE_3d602459"),
    value: node.instanceStatus
  },

  {
    title: t("TXT_CODE_3d0885c0"),
    value: node.platformText
  },
  {
    title: t("TXT_CODE_NODE_COMPAT"),
    value:
      node.brand !== "ElementsPanel"
        ? t("TXT_CODE_NODE_COMPAT_MCSM")
        : !node.available || !node.compatibility
          ? "--"
          : node.compatibility.ok
            ? t("TXT_CODE_NODE_COMPAT_OK")
            : t("TXT_CODE_NODE_COMPAT_BAD"),
    success: node.available === true && node.compatibility?.ok === true,
    warn:
      node.brand === "ElementsPanel" &&
      node.available === true &&
      node.compatibility != null &&
      node.compatibility.ok === false,
    warnText: t("TXT_CODE_e520908a"),
    danger: node.brand !== "ElementsPanel",
    compatibility: true
  },
  {
    title: "Daemon ID",
    value: node.uuid,
    onlyCopy: true
  }
];

const nodeOperations = computed(() =>
  arrayFilter([
    {
      title: t("TXT_CODE_ae533703"),
      icon: "mdi-folder-open-outline",
      click: (item: ComputedNodeInfo) => {
        const daemonId = item.uuid;
        const instanceId = GLOBAL_INSTANCE_UUID;
        toPage({
          path: "/instances/terminal/files",
          query: {
            daemonId,
            instanceId
          }
        });
      },
      condition: () => remoteNode.value!.available
    },
    {
      title: t("TXT_CODE_524e3036"),
      icon: "mdi-console-line",
      click: (item: ComputedNodeInfo) => {
        const daemonId = item.uuid;
        const instanceId = GLOBAL_INSTANCE_UUID;
        toPage({
          path: "/instances/terminal",
          query: {
            daemonId,
            instanceId
          }
        });
      },
      condition: () => remoteNode.value!.available
    },
    {
      title: t("TXT_CODE_e6c30866"),
      icon: "mdi-image-outline",
      click: (item: ComputedNodeInfo) => {
        const daemonId = item.uuid;
        toPage({
          path: "/node/image",
          query: {
            daemonId
          }
        });
      },
      condition: () => remoteNode.value!.available
    },
    {
      title: t("TXT_CODE_f8b28901"),
      icon: "mdi-refresh",
      click: async (node: ComputedNodeInfo) => {
        await tryConnectNode(node.uuid);
      },
      condition: () => !remoteNode.value!.available
    },
    {
      title: t("TXT_CODE_b5c7b82d"),
      icon: "mdi-cog-outline",
      click: (node: ComputedNodeInfo) => {
        nodeDetailDialog.value?.openDialog(node, node.uuid);
      }
    }
  ])
);

const copyValue = async (value: unknown) => {
  if (value == null) return;
  await navigator.clipboard?.writeText(String(value));
  message.success(t("TXT_CODE_7f0c746d"));
};

onMounted(() => {
  testFrontendSocket(remoteNode.value);
});
</script>

<template>
  <div style="height: 100%" class="container">
    <VCard style="height: 100%" rounded="xl" flat class="node-card">
      <VCardTitle class="node-card-title">
        <div class="node-card-heading" :class="{ 'color-danger': !remoteNode?.available }">
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
                >
                  <template #activator="{ props: menuProps }">
                    <span v-bind="menuProps" class="node-compat-toggle" role="button">
                      <VTooltip v-if="detail.warn" location="top">
                        <template #activator="{ props: tooltipProps }">
                          <span v-bind="tooltipProps" class="color-warning">
                            <VIcon icon="mdi-information-outline" size="16" /> {{ detail.value }}
                          </span>
                        </template>
                        <span>{{ detail.warnText }}</span>
                      </VTooltip>
                      <span v-else :class="detail.success ? 'color-success' : ''">
                        <VIcon
                          v-if="detail.success"
                          icon="mdi-check-circle-outline"
                          size="16"
                        />
                        {{ detail.value }}
                      </span>
                      <VIcon size="16" class="node-compat-chevron">
                        {{ compatMenuOpen ? "mdi-chevron-up" : "mdi-chevron-down" }}
                      </VIcon>
                    </span>
                  </template>
                  <div v-if="remoteNode" class="node-compat-panel">
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
                              ? 'color-danger'
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
                          v-for="item in remoteNode.compatibility.plugins.items"
                          :key="item.id"
                          class="node-compat-row"
                        >
                          <span :title="item.id" class="node-compat-plugin-id">{{ item.id }}</span>
                          <span>{{ item.panelVersion ?? "--" }}</span>
                          <span>{{ item.daemonVersion ?? "--" }}</span>
                          <span :class="compatStatusClass(item.status)">
                            <VIcon
                              :icon="
                                item.status === 'ok'
                                  ? 'mdi-check-circle-outline'
                                  : 'mdi-alert-circle-outline'
                              "
                              size="14"
                            />
                            {{ compatStatusText(item.status) }}
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
                    <span v-bind="tooltipProps" class="color-danger">
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
                          ? 'color-danger'
                          : remoteNode?.brand !== 'ElementsPanel'
                          ? 'color-warning'
                          : 'color-danger'
                      "
                    >
                      <VIcon icon="mdi-information-outline" size="16" /> {{ detail.value }}
                    </span>
                  </template>
                  <span>{{ detail.warnText }}</span>
                </VTooltip>
                <span v-else-if="detail.loading">
                  <VProgressCircular indeterminate />
                </span>
                <span v-else-if="detail.success">
                  <span class="color-success">
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
.search-input {
  transition: all 0.4s;
  text-align: center;
  width: 50%;
}

.node-card {
  background: var(--background-color-white);
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

.node-compat-panel {
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--background-color-white);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
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
  .search-input {
    transition: all 0.4s;
    text-align: center;
    width: 100% !important;
  }

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

.search-input:hover {
  width: 100%;
}
</style>
