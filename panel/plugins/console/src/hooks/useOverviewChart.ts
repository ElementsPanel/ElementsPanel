import {
  CategoryScale,
  Chart,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartConfiguration
} from "chart.js";
import { onBeforeUnmount, onMounted, shallowRef, watch, type Ref } from "vue";

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Filler, Tooltip);

export interface LineChartData {
  labels: string[];
  values: readonly (number | null)[];
  max: number;
}

interface LineChartOptions {
  compact?: boolean;
  percentage?: boolean;
}

type HistoryChart = Chart<"line", (number | null)[], string>;

export function useLineChart(
  canvas: Ref<HTMLCanvasElement | undefined>,
  readData: () => LineChartData,
  { compact = false, percentage = false }: LineChartOptions = {}
) {
  // Chart instances must stay outside Vue's deep reactive proxies.
  const instance = shallowRef<HistoryChart>();
  const snapshot = (data: LineChartData) => ({
    labels: [...data.labels],
    values: data.values.map((value) => Number.isFinite(value) ? value : null),
    max: Number.isFinite(data.max) && data.max > 0 ? data.max : 1
  });

  onMounted(() => {
    if (!canvas.value) return;
    const data = snapshot(readData());
    let gradient: CanvasGradient | undefined;
    let gradientTop: number | undefined;
    let gradientBottom: number | undefined;
    const config: ChartConfiguration<"line", (number | null)[], string> = {
      type: "line",
      data: {
        labels: data.labels,
        datasets: [{
          data: data.values,
          borderColor: "rgba(67, 145, 250, 0.95)",
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointHitRadius: 8,
          cubicInterpolationMode: "monotone",
          fill: true,
          backgroundColor: ({ chart }) => {
            const { ctx, chartArea } = chart;
            if (!chartArea) return "rgba(67, 145, 250, 0.15)";
            if (!gradient || gradientTop !== chartArea.top || gradientBottom !== chartArea.bottom) {
              gradientTop = chartArea.top;
              gradientBottom = chartArea.bottom;
              gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              gradient.addColorStop(0, "rgba(67, 145, 250, 0.55)");
              gradient.addColorStop(0.6, "rgba(40, 100, 210, 0.15)");
              gradient.addColorStop(1, "rgba(17, 60, 150, 0)");
            }
            return gradient;
          }
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: compact ? 6 : 8, bottom: compact ? 4 : 0, right: compact ? 6 : 8 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            // Restore the pre-Chart.js hover card: a compact translucent panel
            // with no border, showing only the plotted value — the percentage on
            // usage charts. The axis label is redundant with the axis itself,
            // so the title row is dropped.
            displayColors: false,
            backgroundColor: "rgba(20, 24, 35, 0.85)",
            cornerRadius: 6,
            padding: { top: 6, bottom: 6, left: 10, right: 10 },
            bodyColor: "#e0e6f0",
            bodyFont: { size: 12, weight: 600 },
            callbacks: {
              title: () => "",
              label: ({ parsed }) => {
                const value = parsed.y ?? 0;
                if (percentage) return `${value.toFixed(1)}%`;
                return Number.isInteger(value) ? String(value) : value.toFixed(1);
              }
            }
          }
        },
        scales: {
          x: {
            type: "category",
            display: !compact,
            grid: { display: false },
            border: { color: "rgba(100, 130, 180, 0.2)" },
            ticks: {
              autoSkip: true,
              maxTicksLimit: 6,
              maxRotation: 0,
              color: "rgba(160, 180, 210, 0.7)",
              font: { size: 10 },
              padding: 4
            }
          },
          y: {
            type: "linear",
            min: 0,
            max: data.max,
            border: { display: false, dash: [4, 4] },
            grid: { color: "rgba(100, 130, 180, 0.12)", tickLength: 0 },
            ticks: {
              stepSize: percentage ? 50 : undefined,
              precision: 0,
              maxTicksLimit: compact ? 3 : 6,
              color: "rgba(160, 180, 210, 0.7)",
              font: { size: 10 },
              padding: 4,
              callback: (value) => percentage ? `${value}%` : value
            }
          }
        }
      }
    };
    instance.value = new Chart(canvas.value, config);
  });

  watch(readData, (value) => {
    const chart = instance.value;
    if (!chart) return;
    const data = snapshot(value);
    chart.data.labels = data.labels;
    chart.data.datasets[0].data = data.values;
    const axis = chart.options.scales?.y;
    if (axis) axis.max = data.max;
    chart.update("none");
  }, { deep: true, flush: "post" });

  onBeforeUnmount(() => {
    instance.value?.destroy();
    instance.value = undefined;
  });

  return { instance };
}

export function useSimpleChart(
  canvas: Ref<HTMLCanvasElement | undefined>,
  readValues: () => readonly number[]
) {
  return useLineChart(canvas, () => {
    const values = readValues();
    return { labels: values.map((_, index) => String(index)), values, max: 100 };
  }, { compact: true, percentage: true });
}
