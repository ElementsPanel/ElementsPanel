import { overviewInfo } from "@/services/apis";
import { computed, type Ref } from "vue";
import { usePolling } from "./usePolling";

export interface ComputedOverviewResponse extends IPanelOverviewResponse {
  totalInstance: number;
  runningInstance: number;
  cpu: number;
  mem: number;
  remote: ComputedNodeInfo[];
}

export interface ComputedNodeInfo extends IPanelOverviewRemoteResponse {
  platformText?: string;
  cpuInfo?: string;
  instanceStatus?: string;
  memText?: string;
  cpuChartData?: number[];
  memChartData?: number[];
  brand?: string;
}

function computeResponseData(v: Ref<IPanelOverviewResponse | undefined>) {
  if (!v.value) return undefined;
  const currentState = { ...v.value } as ComputedOverviewResponse;

  let totalInstance = 0;
  let runningInstance = 0;
  for (const iterator of currentState.remote || []) {
    if (iterator.instance) {
      totalInstance += iterator.instance.total;
      runningInstance += iterator.instance.running;
    }
  }

  currentState.totalInstance = totalInstance;
  currentState.runningInstance = runningInstance;

  let cpu = Number(currentState.system.cpu * 100).toFixed(0);
  const totalMemory = currentState.system.totalmem;
  const usedMemory = totalMemory ? (1 - currentState.system.freemem / totalMemory) * 100 : 0;
  const mem = Math.min(100, Math.max(0, usedMemory)).toFixed(0);

  currentState.cpu = Number(cpu);
  currentState.mem = Number(mem);

  const newNodes = v.value.remote?.map((node) => ({ ...node })) as ComputedNodeInfo[] | undefined;
  currentState.remote = newNodes ?? [];
  if (newNodes) {
    for (let node of newNodes) {
      if (!node.system) continue;
      const free = Number(node.system.freemem / 1024 / 1024 / 1024).toFixed(1);
      const total = Number(node.system.totalmem / 1024 / 1024 / 1024).toFixed(1);
      const used = Number(Number(total) - Number(free)).toFixed(1);
      node.platformText =
        node?.system?.platform == "win32" ? "windows" : node?.system?.platform || "--";
      node.instanceStatus = node.instance ? `${node.instance.running} / ${node.instance.total}` : "--";
      node.cpuInfo = `${Number(node.system.cpuUsage * 100).toFixed(1)}%`;
      node.memText = `${used}G / ${total}G`;
      node.cpuChartData = node.cpuMemChart?.map((v) => v.cpu) ?? [];
      node.memChartData = node.cpuMemChart?.map((v) => v.mem) ?? [];
    }
  }
  return currentState;
}

export function useOverviewInfo({ poll = true }: { poll?: boolean } = {}) {
  const result = overviewInfo();
  const newState = computed(() => computeResponseData(result.state));

  const refresh = async (forceRequest = false) => {
    await result.execute({ forceRequest });
    return newState.value;
  };

  if (poll) usePolling(refresh, 3000);

  return {
    ...result,
    state: newState,
    refresh,
    execute: null
  };
}
