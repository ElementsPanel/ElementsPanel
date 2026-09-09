<script setup lang="ts">
import { useOverviewInfo } from "@/hooks/useOverviewInfo";
import { t } from "@/lang/i18n";
import { getRandomId } from "@/tools/randId";
import { computed, onMounted, watch } from "vue";
import {
  VAlert,
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

const requestChartId = `monitor-request-${getRandomId()}`;
const instanceChartId = `monitor-instance-${getRandomId()}`;
const requestChart = useOverviewChart(requestChartId);
const instanceChart = useOverviewChart(instanceChartId);

const panelCpu = computed(() => Math.min(100, Math.max(0, state.value?.cpu ?? 0)));
const panelMemory = computed(() => Math.min(100, Math.max(0, 100 - (state.value?.mem ?? 0))));
const totalInstances = computed(() => state.value?.totalInstance ?? 0);
const runningInstances = computed(() => state.value?.runningInstance ?? 0);
const stoppedInstances = computed(() => Math.max(0, totalInstances.value - runningInstances.value));
const remoteCount = computed(() => state.value?.remoteCount ?? { available: 0, total: 0 });
const remoteNodes = computed(() => state.value?.remote ?? []);

const panelVersion = computed(() => state.value?.version ?? "--");
const daemonVersion = computed(() => state.value?.specifiedDaemonVersion ?? "--");
const systemInfo = computed(() => state.value?.system);
const panelProcess = computed(() => state.value?.process);
const record = computed(() => state.value?.record);

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
    { title: t("TXT_CODE_413b9c01"), value: current.system.node, icon: "mdi-code-tags" },
    { title: t("TXT_CODE_af21e6b"), value: current.version, icon: "mdi-view-grid-outline" },
    { title: t("TXT_CODE_a0e70887"), value: current.specifiedDaemonVersion, icon: "mdi-api" },
    { title: t("TXT_CODE_fdb6c369"), value: current.system.user.username, icon: "mdi-account-outline" },
    {
      title: t("TXT_CODE_f54e6d1f"),
      value: new Date(current.system.time).toLocaleString(),
      icon: "mdi-clock-outline"
    },
    { title: t("TXT_CODE_4ab6a0b5"), value: new Date().toLocaleString(), icon: "mdi-earth" },
    { title: t("TXT_CODE_856bd2f3"), value: String(current.record.banips), icon: "mdi-shield-check-outline" },
    { title: t("TXT_CODE_da8f97a7"), value: String(current.record.illegalAccess), icon: "mdi-lock-outline" },
    {
      title: t("TXT_CODE_77d038f7"),
      value: formatBytes(current.process.memory),
      icon: "mdi-memory"
    },
    { title: t("TXT_CODE_4df7e9bd"), value: current.system.hostname, icon: "mdi-server-outline" },
    {
      title: t("TXT_CODE_b4d8588"),
      value: `${current.system.version.slice(0, 16)}${current.system.version.length > 16 ? "..." : ""} ${current.system.release}`,
      icon: "mdi-console-line"
    },
    {
      title: t("TXT_CODE_edf84830"),
      value: `${current.system.type} ${current.system.platform}`,
      icon: "mdi-laptop"
    },
    {
      title: t("TXT_CODE_593ee330"),
      value: `${usedMemory.toFixed(1)} GB / ${totalMemory.toFixed(1)} GB`,
      icon: "mdi-memory",
      progress: totalMemory ? Math.round((usedMemory / totalMemory) * 100) : 0
    },
    { title: "CPU", value: `${panelCpu.value}%`, icon: "mdi-chip", progress: panelCpu.value },
    {
      title: t("TXT_CODE_190ecd56"),
      value: formatLoadAvg(current.system.loadavg),
      icon: "mdi-pulse",
      hidden: current.system.type.toLowerCase().includes("windows")
    }
  ];
  return items.filter((item) => !item.hidden);
});

const updateCharts = () => {
  const source = state.value?.chart?.request || [];
  const request = source.map((item: Record<string, unknown>, index: number) => ({
    ...item,
    time: `${source.length - index - 1}s`
  }));
  const requestMax = Math.max(1, ...request.map((item: any) => Number(item.value) || 0));
  const instanceMax = Math.max(1, state.value?.totalInstance ?? 0);

  requestChart.setOption({
    yAxis: { max: requestMax },
    dataset: { dimensions: ["time", "value"], source: request }
  });
  instanceChart.setOption({
    yAxis: { max: instanceMax },
    dataset: { dimensions: ["time", "runningInstance"], source: request }
  });
};

const logColor = (color: string) =>
  ({ blue: "info", orange: "warning", red: "error", gray: "grey" })[color] || "info";

watch(state, updateCharts, { deep: true });
onMounted(fetchData);
</script>

<template>
  <main class="monitor-overview-page">
    <VContainer fluid class="monitor-overview-container">
      <VAlert v-if="!state" type="info" variant="tonal" class="monitor-loading" density="comfortable">
        {{ t("TXT_CODE_b197be11") }}
      </VAlert>

      <VRow class="monitor-stat-row">
        <VCol cols="12" sm="6" lg="3">
          <VCard class="monitor-card monitor-stat-card" flat>
            <VCardText>
              <VIcon icon="mdi-server-outline" color="primary" size="28" />
              <div class="monitor-stat-value">{{ totalInstances }}</div>
              <div class="monitor-stat-label">{{ t("TXT_CODE_8201d2c6") }}</div>
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
              <div class="monitor-stat-label">{{ t("TXT_CODE_4b7eba50") }}</div>
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
              <div class="monitor-stat-label">{{ t("TXT_CODE_593ee330") }}</div>
              <VProgressLinear :model-value="panelMemory" :color="progressColor(panelMemory)" height="6" rounded="xl" />
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <VRow>
        <VCol cols="12">
          <VCard class="monitor-card monitor-overview-card" flat>
            <VCardTitle class="monitor-card-title">
              <VIcon icon="mdi-information-outline" class="mr-2" />
              {{ t("TXT_CODE_721157a3") }}
            </VCardTitle>
            <VCardText>
              <VRow class="overview-grid">
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

      <VRow>
        <VCol cols="12" lg="6">
          <VCard class="monitor-card chart-card" flat>
            <VCardTitle class="monitor-card-title">
              <VIcon icon="mdi-chart-line" class="mr-2" />
              {{ t("TXT_CODE_a4037a98") }}
            </VCardTitle>
            <VCardText><div :id="requestChartId" class="monitor-chart" /></VCardText>
          </VCard>
        </VCol>
        <VCol cols="12" lg="6">
          <VCard class="monitor-card chart-card" flat>
            <VCardTitle class="monitor-card-title">
              <VIcon icon="mdi-chart-areaspline" class="mr-2" />
              {{ t("TXT_CODE_d6d9c42c") }}
            </VCardTitle>
            <VCardText><div :id="instanceChartId" class="monitor-chart" /></VCardText>
          </VCard>
        </VCol>
      </VRow>

      <VRow>
        <VCol cols="12" lg="7">
          <VCard class="monitor-card" flat>
            <VCardTitle class="monitor-card-title">
              <VIcon icon="mdi-format-list-bulleted" class="mr-2" />
              {{ t("TXT_CODE_f6a33629") }}
            </VCardTitle>
            <VCardText class="log-card-body">
              <div v-if="formattedLogs.length === 0" class="monitor-empty">{{ t("TXT_CODE_54469e02") }}</div>
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
              {{ t("TXT_CODE_b4a9d04a") }} ({{ remoteNodes.length }})
            </VCardTitle>
            <VCardText class="pa-0">
              <div v-if="remoteNodes.length === 0" class="monitor-empty">{{ t("TXT_CODE_9337bed1") }}</div>
              <VList v-else lines="two" density="comfortable">
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

      <div class="monitor-meta">
        <span>{{ t("TXT_CODE_413b9c01") }}: {{ systemInfo?.node || "--" }}</span>
        <span>{{ t("TXT_CODE_af21e6b") }}: {{ panelVersion }}</span>
        <span>{{ t("TXT_CODE_a0e70887") }}: {{ daemonVersion }}</span>
        <span>{{ t("TXT_CODE_77d038f7") }}: {{ panelProcess ? formatBytes(panelProcess.memory) : "--" }}</span>
        <span>{{ t("TXT_CODE_4df7e9bd") }}: {{ systemInfo?.hostname || "--" }}</span>
        <span>{{ t("TXT_CODE_190ecd56") }}: {{ formatLoadAvg(systemInfo?.loadavg) }}</span>
        <span>{{ t("TXT_CODE_871fb0d6") }}: {{ record?.loginFailed ?? 0 }} / {{ record?.logined ?? 0 }}</span>
      </div>
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
  margin-bottom: 0;
}

.monitor-overview-container > .v-row {
  margin-top: 0;
  margin-bottom: 0;
  margin-right: 0;
  margin-left: 0;
}

.monitor-overview-container > .v-row > .v-col {
  padding: 8px;
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
  padding: 8px;
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

.monitor-empty {
  padding: 44px 20px;
  color: var(--color-gray-7);
  text-align: center;
}

.node-card .v-list {
  background: transparent;
}

.monitor-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  padding: 4px 8px;
  color: var(--color-gray-7);
  font-size: 12px;
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
