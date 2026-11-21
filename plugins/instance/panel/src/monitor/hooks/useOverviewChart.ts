import { useLineChart, type LineChartData } from "@elementspanel/epanel-plugin-console/hooks/useOverviewChart";
import type { Ref } from "vue";

export function useOverviewChart(
  canvas: Ref<HTMLCanvasElement | undefined>,
  readData: () => LineChartData
) {
  return useLineChart(canvas, readData);
}
