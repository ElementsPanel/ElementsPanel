import { shallowRef } from "vue";

export interface InstanceLogRequest {
  mode: "normal" | "desktop";
  instanceId: string;
  daemonId: string;
  instanceName?: string;
  key: number;
}

const activeRequest = shallowRef<InstanceLogRequest | null>(null);
let requestKey = 0;

export function openInstanceLog(request: Omit<InstanceLogRequest, "key">) {
  activeRequest.value = { ...request, key: ++requestKey };
}

export function closeInstanceLog() {
  activeRequest.value = null;
}

export function useActiveInstanceLog() {
  return activeRequest;
}
