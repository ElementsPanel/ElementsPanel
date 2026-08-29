// The full monitoring chart: axes, gradient area fill and tooltip. Moved out of
// the panel core with the monitoring page; the core keeps `useSimpleChart`,
// which the node plugin uses for its per-node sparklines.

import { init, graphic, type ECharts } from "echarts";
import { onMounted, onUnmounted, ref } from "vue";

export function useOverviewChart(dom: string) {
  let chart = ref<ECharts>();

  onMounted(() => {
    chart.value = init(document.getElementById(dom));
    chart.value.setOption(getChartDefaultOption());
  });

  onUnmounted(() => {
    chart.value?.dispose();
    chart.value = undefined;
  });

  return {
    instance: chart,
    setOption: (v: any) => chart.value?.setOption(v)
  };
}

function getChartDefaultOption() {
  return {
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(20, 24, 35, 0.85)",
      borderColor: "rgba(67, 145, 250, 0.3)",
      borderWidth: 1,
      padding: [6, 10],
      textStyle: {
        color: "#e0e6f0",
        fontSize: 12
      },
      axisPointer: {
        type: "line",
        lineStyle: {
          color: "rgba(67, 145, 250, 0.5)",
          width: 1,
          type: "dashed"
        }
      },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const data = p.data;
        const val =
          typeof data === "object" && data !== null && !Array.isArray(data)
            ? (data as Record<string, unknown>).value ?? (data as Record<string, unknown>).runningInstance
            : Array.isArray(p.value)
              ? p.value[1]
              : p.value;
        const xVal =
          typeof data === "object" && data !== null && !Array.isArray(data)
            ? (data as Record<string, unknown>).time
            : p.axisValue;
        const num = Number(val);
        const displayVal = Number.isInteger(num) ? num : num.toFixed(1);
        return `<span style="color:#94b8e0;font-size:11px">${xVal}</span><br/><span style="font-weight:600;font-size:13px">${displayVal}</span>`;
      }
    },
    grid: {
      show: false,
      borderWidth: 0,
      top: 8,
      bottom: 30,
      left: 34,
      right: 8
    },
    xAxis: {
      type: "category",
      show: true,
      axisLabel: {
        fontSize: 10,
        color: "rgba(160, 180, 210, 0.7)",
        margin: 4
      },
      axisLine: { show: true, lineStyle: { color: "rgba(100, 130, 180, 0.2)" } },
      axisTick: { show: false }
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      show: true,
      minInterval: 1,
      axisLabel: {
        formatter: "{value}",
        fontSize: 10,
        color: "rgba(160, 180, 210, 0.7)",
        margin: 4
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: "rgba(100, 130, 180, 0.12)",
          type: "dashed",
          width: 1
        }
      },
      axisLine: { show: false },
      axisTick: { show: false }
    },
    series: [
      {
        type: "line",
        smooth: 0.6,
        smoothMonotone: "x",
        showSymbol: false,
        lineStyle: {
          color: "rgba(67, 145, 250, 0.95)",
          width: 1.5,
          shadowColor: "rgba(67, 145, 250, 0.3)",
          shadowBlur: 4
        },
        areaStyle: {
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(67, 145, 250, 0.55)" },
            { offset: 0.6, color: "rgba(40, 100, 210, 0.15)" },
            { offset: 1, color: "rgba(17, 60, 150, 0)" }
          ])
        }
      }
    ]
  };
}
