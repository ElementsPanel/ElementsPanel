import { useLineChart, type LineChartData } from "@/hooks/useOverviewChart";
import type { Ref } from "vue";

export function useOverviewChart(
  canvas: Ref<HTMLCanvasElement | undefined>,
  readData: () => LineChartData
) {
  return useLineChart(canvas, readData);
}
