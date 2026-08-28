import { getPanelFrontendService } from "@/plugins";
import type { Ref } from "vue";
import type { NodeStatus } from "@/types";

export interface NodeApiResult<T> {
  isLoading: Ref<boolean>;
  state: Ref<T | undefined>;
  isReady: Ref<boolean>;
  execute: (config?: any) => Promise<Ref<T | undefined>>;
}

export interface NodePluginApi {
  remoteNodeList: () => NodeApiResult<NodeStatus[]>;
  editNode: () => NodeApiResult<any>;
  addNode: () => NodeApiResult<any>;
  deleteNode: () => NodeApiResult<any>;
  connectNode: () => NodeApiResult<any>;
}

function resolveNodeApi(): NodePluginApi {
  const api = getPanelFrontendService<NodePluginApi>("node.api");
  if (!api) {
    throw new Error('Panel frontend plugin "node" is not loaded.');
  }
  return api;
}

export const remoteNodeList = () => resolveNodeApi().remoteNodeList();
export const editNode = () => resolveNodeApi().editNode();
export const addNode = () => resolveNodeApi().addNode();
export const deleteNode = () => resolveNodeApi().deleteNode();
export const connectNode = () => resolveNodeApi().connectNode();
