<script setup lang="ts">
import { GLOBAL_INSTANCE_UUID } from "@/config/const";
import { useAppRouters } from "@/hooks/useAppRouters";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useOverviewInfo, type ComputedNodeInfo } from "@/hooks/useOverviewInfo";
import { SocketStatus, useSocketIoClient } from "@/hooks/useSocketIo";
import { t } from "@/lang/i18n";
import { arrayFilter } from "@/tools/array";
import { reportErrorMsg } from "@/tools/validator";
import { hasVersionUpdate } from "@/tools/version";
import type { LayoutCard } from "@/types";
import { message } from "ant-design-vue";
import { computed, onMounted, ref } from "vue";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VCol, VIcon, VRow, VTooltip } from "vuetify/components";
import { connectNode } from "../../api";
import NodeSimpleChart from "../NodeSimpleChart.vue";
import NodeDetailDialog from "./NodeDetailDialog.vue";

const { testFrontendSocket, socketStatus } = useSocketIoClient();

const nodeDetailDialog = ref<InstanceType<typeof NodeDetailDialog>>();

const props = defineProps<{
  item?: ComputedNodeInfo;
  card?: LayoutCard;
}>();

const { state: AllDaemonData } = useOverviewInfo();

const itemDaemonId = ref<string>();
const specifiedDaemonVersion = computed(() => AllDaemonData.value?.specifiedDaemonVersion);

const remoteNode = computed(() => {
  const myDaemon = AllDaemonData.value?.remote.find((node) => {
    return node.uuid === itemDaemonId.value;
  });
  return myDaemon ?? props.item;
});

if (props.card) {
  const { getMetaOrRouteValue } = useLayoutCardTools(props.card);
  const daemonId = getMetaOrRouteValue("daemonId");
  if (daemonId) {
    itemDaemonId.value = daemonId;
  }
}

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
    value: `${node.ip}:${node.port}`
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
    title: t("TXT_CODE_81634069"),
    value: node.version,
    success:
      !hasVersionUpdate(specifiedDaemonVersion.value, node.version) &&
      node.brand === "ElementsPanel",
    warn:
      (hasVersionUpdate(specifiedDaemonVersion.value, node.version) ||
        node.brand !== "ElementsPanel") &&
      node.available,
    warnText: node.brand !== "ElementsPanel" ? t("TXT_CODE_NODE_BRAND_ERR") : t("TXT_CODE_e520908a")
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
        <div class="flex-center">
          <span :class="{ 'color-danger': !remoteNode?.available }">
            <VIcon icon="mdi-server-network-outline" class="mr-2" />
            {{ remoteNode?.remarks || remoteNode?.ip }}
          </span>
        </div>
        <VCardActions v-if="remoteNode" class="node-card-actions">
          <VTooltip v-for="operation in nodeOperations" :key="operation.title" location="top">
            <template #activator="{ props: tooltipProps }">
              <VBtn v-bind="tooltipProps" icon variant="text" size="small" :aria-label="operation.title"
                @click="remoteNode && operation.click(remoteNode)">
                <VIcon :icon="operation.icon" />
              </VBtn>
            </template>
            <span>{{ operation.title }}</span>
          </VTooltip>
        </VCardActions>
      </VCardTitle>
      <VCardText v-if="remoteNode" class="node-card-content">
        <VRow dense>
          <VCol v-for="detail in detailList(remoteNode)" :key="detail.title + detail.value" cols="6" sm="3">
            <div class="node-detail">
              <div :title="detail.onlyCopy ? detail.value : ''">
                {{ detail.title }}
              </div>

              <div v-if="detail.onlyCopy">
                <VBtn variant="text" size="small" class="node-copy-btn" @click="copyValue(detail.value)">
                  <span class="text-monospace">{{ String(detail.value ?? "").slice(0, 16) }}...</span>
                  <VIcon icon="mdi-content-copy" size="16" class="ml-1" />
                </VBtn>
              </div>
              <div v-else style="font-size: 13px">
                <VTooltip v-if="detail.warn && detail.value" location="top">
                  <template #activator="{ props: tooltipProps }">
                    <span v-bind="tooltipProps"
                      :class="detail.danger ? 'color-danger' : remoteNode?.brand !== 'ElementsPanel' ? 'color-warning' : 'color-danger'">
                      <VIcon icon="mdi-information-outline" size="16" /> {{ detail.value }}
                    </span>
                  </template>
                  <span>{{ detail.warnText }}</span>
                </VTooltip>
                <span v-else-if="detail.loading">
                  <VIcon icon="mdi-loading" class="mdi-spin" size="18" />
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
        <NodeSimpleChart class="mt-8" :cpu-usage="remoteNode.cpuInfo ?? ''" :mem-usage="remoteNode.memText ?? ''"
          :cpu-data="remoteNode.cpuChartData ?? []" :mem-data="remoteNode.memChartData ?? []" />
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
  padding: 14px 14px 14px 24px;
  color: var(--text-color);
}

.node-card-actions {
  min-height: auto;
  padding: 0;
  gap: 2px;
}

.node-card-content {
  padding: 24px;
  color: var(--text-color);
}

.node-detail {
  min-height: 44px;
  color: var(--text-color);
}

.node-copy-btn {
  max-width: 100%;
  padding: 0 4px;
  text-transform: none;
}

.node-copy-btn :deep(.v-btn__content) {
  max-width: 100%;
  overflow: hidden;
}

@media (max-width: 992px) {
  .search-input {
    transition: all 0.4s;
    text-align: center;
    width: 100% !important;
  }
}

.search-input:hover {
  width: 100%;
}
</style>
