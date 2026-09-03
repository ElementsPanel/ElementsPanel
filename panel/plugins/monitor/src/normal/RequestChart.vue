<script setup lang="ts">
import { useOverviewInfo } from "@/hooks/useOverviewInfo";
import { getRandomId } from "@/tools/randId";
import type { JsonData, LayoutCard } from "@/types";
import { watch } from "vue";
import { useOverviewChart } from "../hooks/useOverviewChart";

defineProps<{
  card: LayoutCard;
}>();

const domId = getRandomId();
const { state } = useOverviewInfo();

const chart = useOverviewChart(domId);

watch(state, () => {
  const source = state.value?.chart?.request;
  if (!source || !chart) return;
  const MAX_TIME = source.length - 1;
  for (const key in source) {
    const v = source[key] as JsonData;
    v.time = `${MAX_TIME - Number(key) * 1}s`;
  }
  const max = Math.max(...source.map((v) => v.value));
  chart.setOption({
    yAxis: {
      max
    },
    dataset: {
      dimensions: ["time", "value"],
      source
    }
  });
});
</script>

<template>
  <CardPanel class="CardWrapper" style="height: 100%">
    <template #title>{{ card.title }}</template>
    <template #body>
      <div :id="domId" :style="{ width: '100%', height: '100%' }"></div>
    </template>
  </CardPanel>
</template>

<style lang="scss" scoped></style>
