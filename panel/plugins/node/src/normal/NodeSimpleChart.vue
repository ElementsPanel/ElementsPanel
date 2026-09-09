<script setup lang="ts">
import { t } from "@/lang/i18n";
import { getRandomId } from "@/tools/randId";
import { onMounted, watch } from "vue";
import { useSimpleChart } from "@/hooks/useOverviewChart";
import { VCol, VRow } from "vuetify/components";

const props = defineProps<{
  cpuData: number[];
  memData: number[];
  cpuUsage: string;
  memUsage: string;
}>();

const chartCpuDomId = `${getRandomId()}-cpu-chart`;
const chartMemDomId = `${getRandomId()}-mem-chart`;

const chartCpu = useSimpleChart(chartCpuDomId);
const chartMem = useSimpleChart(chartMemDomId);

onMounted(() => {
  refreshChart();
});

const refreshChart = () => {
  chartCpu.setOption({
    dataset: {
      dimensions: ["time", "value"],
      source: props.cpuData.map((v, index) => {
        return {
          value: v,
          time: index
        };
      })
    }
  });

  chartMem.setOption({
    dataset: {
      dimensions: ["time", "value"],
      source: props.memData.map((v, index) => {
        return {
          value: v,
          time: index
        };
      })
    }
  });
};

watch(props, () => {
  refreshChart();
});
</script>

<template>
  <div class="node-simple-chart" style="width: 100%">
    <VRow dense>
      <VCol cols="12" sm="6">
        <div class="usage-header">
          <span class="usage-title">{{ t("TXT_CODE_eca8f1b3") }}</span>
          <span class="usage-info">{{ cpuUsage }}</span>
        </div>
        <div :id="chartCpuDomId" class="node-chart-container"></div>
      </VCol>
      <VCol cols="12" sm="6">
        <div class="usage-header">
          <span class="usage-title">{{ t("TXT_CODE_6ca6667f") }}</span>
          <span class="usage-info">{{ memUsage }}</span>
        </div>
        <div :id="chartMemDomId" class="node-chart-container"></div>
      </VCol>
    </VRow>
  </div>
</template>

<style lang="scss" scoped>
.node-simple-chart {
  .node-chart-container {
    height: 78px;
    width: 100%;
    margin-top: 16px;
  }
  .usage-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .usage-title {
    opacity: 1;
    font-size: 13px;
  }
  .usage-info {
    opacity: 0.9;
    font-size: 12px;
    color: var(--color-gray-7);
  }
}
</style>
