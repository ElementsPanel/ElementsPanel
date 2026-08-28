import { getPanelFrontendService } from "@/plugins";
import type { ComputedNodeInfo, ComputedOverviewResponse } from "./useOverviewInfo";
import type { ComputedRef, Ref } from "vue";

export type { ComputedNodeInfo } from "./useOverviewInfo";

export interface RemoteNodeDetail {
  ip: string;
  port: number;
  prefix: string;
  remarks: string;
  apiKey?: string;
  language: string;
  uploadSpeedRate: number;
  downloadSpeedRate: number;
  portRangeStart: number;
  portRangeEnd: number;
  portAssignInterval: number;
  enableSoftShutdown: boolean;
  softShutdownSkipDocker: boolean;
  softShutdownWaitSeconds: number;
}

export interface RemoteNodeHook {
  response: Ref<ComputedOverviewResponse | undefined>;
  remoteNodes: ComputedRef<ComputedNodeInfo[]>;
  operationForm: Ref<{ name: string; current: number; pageSize: number; total: number }>;
  currentStatus: Ref<any>;
  refreshLoading: Ref<boolean>;
  refresh: (forceRequest?: boolean) => Promise<ComputedOverviewResponse | undefined>;
  addNode: (data: any) => Promise<void>;
  deleteNode: (uuid: string) => Promise<void>;
  updateNode: (uuid: string, data: any) => Promise<void>;
}

export function useRemoteNode() {
  const hook = getPanelFrontendService<() => RemoteNodeHook>("node.useRemoteNode");
  if (!hook) {
    throw new Error('Panel frontend plugin "node" is not loaded.');
  }
  return hook();
}
