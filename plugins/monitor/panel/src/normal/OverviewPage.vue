<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { useOverviewInfo } from "@elementspanel/epanel-plugin-console/hooks/useOverviewInfo";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { computed, onMounted, ref, watch } from "vue";
import {
  VCard,
  VCardText,
  VCardTitle,
  VChip,
  VCol,
  VContainer,
  VDivider,
  VIcon,
  VList,
  VListItem,
  VListItemSubtitle,
  VListItemTitle,
  VProgressCircular,
  VProgressLinear,
  VRow,
  VTimeline,
  VTimelineItem
} from "vuetify/components";
import dayjs from "dayjs";
import { useOperationLog } from "../hooks/useOperationLog";
import { useOverviewChart } from "../hooks/useOverviewChart";

const { state } = useOverviewInfo();
const { fetchData, formattedLogs } = useOperationLog();

const requestChartCanvas = ref<HTMLCanvasElement>();
const instanceChartCanvas = ref<HTMLCanvasElement>();

const panelCpu = computed(() => Math.min(100, Math.max(0, state.value?.cpu ?? 0)));
const panelMemory = computed(() => state.value?.mem ?? 0);
const totalInstances = computed(() => state.value?.totalInstance ?? 0);
const runningInstances = computed(() => state.value?.runningInstance ?? 0);
const stoppedInstances = computed(() => Math.max(0, totalInstances.value - runningInstances.value));
const remoteCount = computed(() => state.value?.remoteCount ?? { available: 0, total: 0 });
const remoteNodes = computed(() => state.value?.remote ?? []);

const chartHistory = computed(() => state.value?.chart?.request ?? []);
const chartLabels = computed(() => chartHistory.value.map((_, index) => `${chartHistory.value.length - index - 1}s`));
const requestChartData = computed(() => {
  const values = chartHistory.value.map((item) => Number(item.value) || 0);
  return { labels: chartLabels.value, values, max: Math.max(1, ...values) };
});
const instanceChartData = computed(() => {
  const values = chartHistory.value.map((item) => Number(item.runningInstance) || 0);
  return { labels: chartLabels.value, values, max: Math.max(1, totalInstances.value, ...values) };
});
const requestChart = useOverviewChart(requestChartCanvas, () => requestChartData.value);
const instanceChart = useOverviewChart(instanceChartCanvas, () => instanceChartData.value);

watch(() => Boolean(state.value), (ready) => {
  if (!ready) return;
  requestChart.instance.value?.resize();
  instanceChart.instance.value?.resize();
}, { flush: "post" });

const formatBytes = (bytes: number): string => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(1)} ${units[index]}`;
};

const formatLoadAvg = (load: number[] | undefined): string =>
  load?.map((value) => Number(value).toFixed(2)).join(", ") || "--";

const progressColor = (value: number): string => {
  if (value < 50) return "success";
  if (value < 80) return "warning";
  return "error";
};

const overviewItems = computed(() => {
  const current = state.value;
  if (!current) return [];

  const totalMemory = Number((current.system.totalmem / 1024 ** 3).toFixed(1));
  const freeMemory = Number((current.system.freemem / 1024 ** 3).toFixed(1));
  const usedMemory = Number(Math.max(0, totalMemory - freeMemory).toFixed(1));
  const items = [
    {
      title: t(current.system.bun ? "TXT_CODE_COMMON_BUN_VERSION" : "TXT_CODE_COMMON_NODE_JS_VERSION"),
      value: current.system.bun ?? current.system.node,
      icon: "mdi-code-tags"
    },
    { title: t("TXT_CODE_COMMON_PANEL_VERSION"), value: current.version, icon: "mdi-view-grid-outline" },
    { title: t("TXT_CODE_COMMON_MATCHED_DAEMON_VERSION"), value: current.specifiedDaemonVersion, icon: "mdi-api" },
    { title: t("TXT_CODE_COMMON_USER_TO_RUN_THE_PROCESS_WITH"), value: current.system.user.username, icon: "mdi-account-outline" },
    {
      title: t("TXT_CODE_COMMON_PANEL_TIME"),
      value: new Date(current.system.time).toLocaleString(),
      icon: "mdi-clock-outline"
    },
    { title: t("TXT_CODE_COMMON_BROWSER_TIME"), value: new Date().toLocaleString(), icon: "mdi-earth" },
    { title: t("TXT_CODE_COMMON_TEMPORARY_BANNED_I_PS"), value: String(current.record.banips), icon: "mdi-shield-check-outline" },
    { title: t("TXT_CODE_COMMON_BLOCKED_ACCESSES"), value: String(current.record.illegalAccess), icon: "mdi-lock-outline" },
    {
      title: t("TXT_CODE_COMMON_PANEL_MEMORY_USAGE"),
      value: formatBytes(current.process.memory),
      icon: "mdi-memory"
    },
    { title: t("TXT_CODE_COMMON_HOSTNAME"), value: current.system.hostname, icon: "mdi-server-outline" },
    {
      title: t("TXT_CODE_COMMON_OS_VERSION"),
      value: `${current.system.version.slice(0, 16)}${current.system.version.length > 16 ? "..." : ""} ${current.system.release}`,
      icon: "mdi-console-line"
    },
    {
      title: t("TXT_CODE_COMMON_OS_TYPE"),
      value: `${current.system.type} ${current.system.platform}`,
      icon: "mdi-laptop"
    },
    {
      title: t("TXT_CODE_COMMON_MEMORY"),
      value: `${usedMemory.toFixed(1)} GB / ${totalMemory.toFixed(1)} GB`,
      icon: "mdi-memory",
      progress: totalMemory ? Math.round((usedMemory / totalMemory) * 100) : 0
    },
    { title: "CPU", value: `${panelCpu.value}%`, icon: "mdi-chip", progress: panelCpu.value },
    {
      title: t("TXT_CODE_COMMON_UNIX_LOAD_AVERAGE"),
      value: formatLoadAvg(current.system.loadavg),
      icon: "mdi-pulse",
      hidden: current.system.type.toLowerCase().includes("windows")
    }
  ];
  return items.filter((item) => !item.hidden);
});

const logColor = (color: string) =>
  ({ blue: "info", orange: "warning", red: "error", gray: "grey" })[color] || "info";

onMounted(fetchData);
</script>

<template>
  <main class="monitor-overview-page">
    <div v-if="!state" class="monitor-loading">
      <VProgressCircular indeterminate :aria-label="t('TXT_CODE_COMMON_LOADING_DATA')" />
    </div>

    <VContainer v-show="state" fluid class="monitor-overview-container">
      <VRow class="monitor-stat-row" density="comfortable">
        <VCol cols="12" sm="6" lg="3">
          <VCard class="monitor-card monitor-stat-card" flat>
            <VCardText>
              <VIcon icon="mdi-server-outline" color="primary" size="28" />
              <div class="monitor-stat-value">{{ totalInstances }}</div>
              <div class="monitor-stat-label">{{ t("TXT_CODE_COMMON_RUNNING_TOTAL") }}</div>
              <div class="monitor-stat-meta">
                <VChip size="small" color="success" variant="tonal" prepend-icon="mdi-play-circle-outline">
                  {{ runningInstances }}
                </VChip>
                <VChip size="small" color="secondary" variant="tonal" prepend-icon="mdi-stop-circle-outline">
                  {{ stoppedInstances }}
                </VChip>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="12" sm="6" lg="3">
          <VCard class="monitor-card monitor-stat-card" flat>
            <VCardText>
              <VIcon icon="mdi-lan-connect" color="primary" size="28" />
              <div class="monitor-stat-value">{{ remoteCount.available }} / {{ remoteCount.total }}</div>
              <div class="monitor-stat-label">{{ t("TXT_CODE_COMMON_ONLINE_TOTAL") }}</div>
              <div class="monitor-stat-meta">
                <VChip size="small" color="success" variant="tonal" prepend-icon="mdi-check-circle-outline">
                  {{ remoteCount.available }}
                </VChip>
                <VChip size="small" color="secondary" variant="tonal" prepend-icon="mdi-close-circle-outline">
                  {{ remoteCount.total - remoteCount.available }}
                </VChip>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="12" sm="6" lg="3">
          <VCard class="monitor-card monitor-stat-card" flat>
            <VCardText>
              <VIcon icon="mdi-chip" color="primary" size="28" />
              <div class="monitor-stat-value">{{ panelCpu }}%</div>
              <div class="monitor-stat-label">CPU</div>
              <VProgressLinear :model-value="panelCpu" :color="progressColor(panelCpu)" height="6" rounded="xl" />
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="12" sm="6" lg="3">
          <VCard class="monitor-card monitor-stat-card" flat>
            <VCardText>
              <VIcon icon="mdi-memory" color="primary" size="28" />
              <div class="monitor-stat-value">{{ panelMemory }}%</div>
              <div class="monitor-stat-label">{{ t("TXT_CODE_COMMON_MEMORY") }}</div>
              <VProgressLinear :model-value="panelMemory" :color="progressColor(panelMemory)" height="6" rounded="xl" />
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <VRow density="comfortable">
        <VCol cols="12">
          <VCard class="monitor-card monitor-overview-card" flat>
            <VCardTitle class="monitor-card-title">
              <VIcon icon="mdi-information-outline" class="mr-2" />
              {{ t("TXT_CODE_COMMON_DATA_OVERVIEW") }}
            </VCardTitle>
            <VCardText>
              <VRow class="overview-grid" density="comfortable">
                <VCol v-for="item in overviewItems" :key="item.title" cols="12" sm="6" md="4" lg="3">
                  <div class="overview-item">
                    <div class="overview-item-title">
                      <VIcon :icon="item.icon" size="18" color="primary" />
                      <span>{{ item.title }}</span>
                    </div>
                    <div class="overview-item-value">{{ item.value }}</div>
                    <VProgressLinear
                      v-if="item.progress !== undefined"
                      :model-value="item.progress"
                      :color="progressColor(item.progress)"
                      height="5"
                      rounded="xl"
                      class="mt-2"
                    />
                  </div>
                </VCol>
              </VRow>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <VRow density="comfortable">
        <VCol cols="12" lg="6">
          <VCard class="monitor-card chart-card" flat>
            <VCardTitle class="monitor-card-title">
              <VIcon icon="mdi-chart-line" class="mr-2" />
              {{ t("TXT_CODE_COMMON_INTERFACE_REQUESTS") }}
            </VCardTitle>
            <VCardText>
              <div class="monitor-chart">
                <canvas ref="requestChartCanvas" role="img" :aria-label="t('TXT_CODE_COMMON_INTERFACE_REQUESTS')" />
              </div>
            </VCardText>
          </VCard>
        </VCol>
        <VCol cols="12" lg="6">
          <VCard class="monitor-card chart-card" flat>
            <VCardTitle class="monitor-card-title">
              <VIcon icon="mdi-chart-areaspline" class="mr-2" />
              {{ t("TXT_CODE_COMMON_RUNNING_INSTANCES") }}
            </VCardTitle>
            <VCardText>
              <div class="monitor-chart">
                <canvas ref="instanceChartCanvas" role="img" :aria-label="t('TXT_CODE_COMMON_RUNNING_INSTANCES')" />
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <VRow density="comfortable">
        <VCol cols="12" lg="7">
          <VCard class="monitor-card" flat>
            <VCardTitle class="monitor-card-title">
              <VIcon icon="mdi-format-list-bulleted" class="mr-2" />
              {{ t("TXT_CODE_COMMON_OPERATION_LOG") }}
            </VCardTitle>
            <VCardText class="log-card-body">
              <Empty
                v-if="formattedLogs.length === 0"
                icon="mdi-file-document-outline"
                :title="t('TXT_CODE_COMMON_NO_OPERATION_LOGS_AVAILABLE_YET')"
                compact
              />
              <VTimeline v-else density="compact" side="end" truncate-line="both" class="monitor-timeline">
                <VTimelineItem
                  v-for="item in formattedLogs"
                  :key="item.operation_id"
                  :dot-color="logColor(item.color)"
                  size="small"
                >
                  <div class="log-content">{{ item.text }}</div>
                  <div class="log-time">{{ dayjs(Number(item.operation_time)).format("YYYY-MM-DD HH:mm:ss") }}</div>
                </VTimelineItem>
              </VTimeline>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="12" lg="5">
          <VCard class="monitor-card node-card" flat>
            <VCardTitle class="monitor-card-title">
              <VIcon icon="mdi-lan" class="mr-2" />
              {{ t("TXT_CODE_OVERVIEW_ONLINE_NODE_COUNT") }} ({{ remoteNodes.length }})
            </VCardTitle>
            <VCardText class="pa-0">
              <Empty
                v-if="remoteNodes.length === 0"
                icon="mdi-server-network-outline"
                :title="t('TXT_CODE_OVERVIEW_NO_AVAILABLE_NODES_HINT')"
                compact
              />
              <VList v-else lines="two" density="comfortable" class="app-responsive-list">
                <template v-for="(node, index) in remoteNodes" :key="node.uuid">
                  <VListItem>
                    <template #prepend>
                      <VIcon :icon="node.available ? 'mdi-check-circle' : 'mdi-close-circle'" :color="node.available ? 'success' : 'secondary'" />
                    </template>
                    <VListItemTitle>{{ node.remarks || node.ip }}</VListItemTitle>
                    <VListItemSubtitle>{{ node.ip }}:{{ node.port }}</VListItemSubtitle>
                    <template #append>
                      <div v-if="node.instance || node.system" class="node-metrics">
                        <VChip v-if="node.instance" size="small" variant="tonal">{{ node.instance.running }}/{{ node.instance.total }}</VChip>
                        <VChip v-if="node.system" size="small" color="info" variant="tonal">{{ (node.system.cpuUsage * 100).toFixed(0) }}%</VChip>
                      </div>
                    </template>
                  </VListItem>
                  <VDivider v-if="index < remoteNodes.length - 1" />
                </template>
              </VList>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>
    </VContainer>
  </main>
</template>

<style lang="scss" scoped>
.monitor-overview-page {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
  box-sizing: border-box;
  min-height: 100%;
}

.monitor-overview-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  min-width: 0;
  max-width: var(--app-max-width);
  margin: 0 auto;
  box-sizing: border-box;
  padding: 20px 24px 32px;
}

.monitor-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
}

.monitor-overview-container > .v-row {
  margin: 0;
}

.monitor-card {
  width: 100%;
  max-width: 100%;
  height: 100%;
  border: none !important;
  outline: none;
  border-radius: 24px;
  background: var(--background-color-white);
  box-shadow: none;
}

.monitor-overview-card {
  width: calc(100% - 2px);
  margin-right: auto;
  margin-left: auto;
  box-sizing: border-box;
}

.overview-grid {
  width: 100%;
  margin: 0;
}

.overview-grid > .v-col {
  min-width: 0;
}

.monitor-stat-card {
  min-height: 160px;
}

.monitor-stat-card .v-card-text {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
}

.monitor-stat-value {
  color: var(--text-color);
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
}

.monitor-stat-label {
  color: var(--color-gray-7);
  font-size: 13px;
}

.monitor-stat-meta,
.node-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.monitor-card-title {
  display: flex;
  align-items: center;
  padding: 20px 20px 8px;
  color: var(--text-color);
  font-size: 17px;
  font-weight: 600;
}

.overview-item {
  min-height: 76px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(var(--v-theme-on-surface), 0.035);
}

.overview-item-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-gray-7);
  font-size: 13px;
}

.overview-item-value {
  margin-top: 6px;
  overflow: hidden;
  color: var(--text-color);
  font-size: 15px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart-card {
  min-height: 300px;
}

.monitor-chart {
  position: relative;
  width: 100%;
  height: 250px;
}

.log-card-body {
  max-height: 440px;
  overflow-y: auto;
}

.monitor-timeline {
  padding: 8px 4px;
}

.log-content {
  color: var(--text-color);
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}

.log-time {
  margin-top: 4px;
  color: var(--color-gray-7);
  font-family: "Consolas", "Monaco", monospace;
  font-size: 11px;
}

.node-card .v-list {
  background: transparent;
}

@media (max-width: 992px) {
  .monitor-overview-container {
    padding: 16px 12px 28px;
  }

  .monitor-chart {
    height: 220px;
  }
}
</style>
