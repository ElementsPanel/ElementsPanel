import { usePluginService } from "@/plugin/context";
import type * as InstanceApi from "@instance/api";

export type InstancePluginApi = typeof InstanceApi;

function resolveInstanceApi(): InstancePluginApi {
  const instance = usePluginService<{ api: InstancePluginApi }>("instance");
  if (!instance) {
    throw new Error('Panel frontend plugin "instance" is not loaded.');
  }
  return instance.api;
}

const call = <K extends keyof InstancePluginApi>(name: K) =>
  ((...args: any[]) => (resolveInstanceApi()[name] as any)(...args)) as InstancePluginApi[K];

export const remoteInstances = call("remoteInstances");
export const getInstanceInfo = call("getInstanceInfo");
export const openInstance = call("openInstance");
export const stopInstance = call("stopInstance");
export const restartInstance = call("restartInstance");
export const killInstance = call("killInstance");
export const updateInstance = call("updateInstance");
export const updateInstanceConfig = call("updateInstanceConfig");
export const updateAnyInstanceConfig = call("updateAnyInstanceConfig");
export const uploadAddress = call("uploadAddress");
export const uploadInstanceFile = call("uploadInstanceFile");
export const createInstance = call("createInstance");
export const createAsyncTask = call("createAsyncTask");
export const queryAsyncTask = call("queryAsyncTask");
export const getConfigFileList = call("getConfigFileList");
export const getConfigFile = call("getConfigFile");
export const updateConfigFile = call("updateConfigFile");
export const batchStart = call("batchStart");
export const batchStop = call("batchStop");
export const batchKill = call("batchKill");
export const batchRestart = call("batchRestart");
export const batchDelete = call("batchDelete");
export const scheduleList = call("scheduleList");
export const scheduleDelete = call("scheduleDelete");
export const scheduleCreate = call("scheduleCreate");
