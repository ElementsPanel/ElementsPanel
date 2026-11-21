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
import { useDesktopWindowActivity } from "./useDesktopWindowActivity";

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
  const activity = useDesktopWindowActivity();
  const canRender = () => activity.visible.value && !activity.interacting.value;
  let themeObserver: MutationObserver | undefined;
  const getTickColor = () => {
    if (!canvas.value || typeof getComputedStyle !== "function") return "#666";
    const style = getComputedStyle(canvas.value);
    return style.getPropertyValue("--text-color").trim() || style.color || "#666";
  };
  const snapshot = (data: LineChartData) => ({
    labels: [...data.labels],
    values: data.values.map((value) => Number.isFinite(value) ? value : null),
    max: Number.isFinite(data.max) && data.max > 0 ? data.max : 1
  });

  onMounted(() => {
    if (!canvas.value) return;
    const data = snapshot(readData());
    const tickColor = getTickColor();
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
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: compact ? 6 : 8, bottom: compact ? 4 : 0, right: compact ? 6 : 8 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            yAlign: "bottom",
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
              color: tickColor,
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
              color: tickColor,
              font: { size: 10 },
              padding: 4,
              callback: (value) => percentage ? `${value}%` : value
            }
          }
        }
      }
    };
    instance.value = new Chart(canvas.value, config);
    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && document.body) {
      themeObserver = new MutationObserver(() => {
        const chart = instance.value;
        if (!chart || !canRender()) return;
        const color = getTickColor();
        const x = chart.options.scales?.x;
        const y = chart.options.scales?.y;
        if (x?.ticks?.color === color && y?.ticks?.color === color) return;
        if (x?.ticks) x.ticks.color = color;
        if (y?.ticks) y.ticks.color = color;
        chart.update("none");
      });
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
    }
  });

  const updateChart = (value: LineChartData, animate = true) => {
    const chart = instance.value;
    if (!chart || !canRender()) return;
    const data = snapshot(value);
    chart.data.labels = data.labels;
    chart.data.datasets[0].data = data.values;
    const axis = chart.options.scales?.y;
    if (axis) axis.max = data.max;
    chart.update(animate ? undefined : "none");
  };
  watch(readData, (value) => updateChart(value), { deep: true, flush: "post" });
  watch(canRender, (available) => {
    if (!available) return instance.value?.stop?.();
    const chart = instance.value;
    if (chart) {
      const color = getTickColor();
      const x = chart.options.scales?.x;
      const y = chart.options.scales?.y;
      if (x?.ticks) x.ticks.color = color;
      if (y?.ticks) y.ticks.color = color;
    }
    updateChart(readData(), false);
  }, { flush: "post" });

  onBeforeUnmount(() => {
    themeObserver?.disconnect();
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
