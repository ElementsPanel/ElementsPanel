import { usePluginService } from "@/plugin/context";
import type * as InstanceApi from "@instance/api";

type ModManagerApi = Pick<
  typeof InstanceApi,
  | "getMcVersionsApi"
  | "modListApi"
  | "toggleModApi"
  | "deleteModApi"
  | "getModInfoApi"
  | "getModBatchInfoApi"
  | "searchModsApi"
  | "getModVersionsApi"
  | "downloadModApi"
  | "stopTransferApi"
  | "getModConfigFilesApi"
>;

function resolveModManagerApi(): ModManagerApi {
  const instance = usePluginService<{ api: ModManagerApi }>("instance");
  if (!instance) {
    throw new Error('Panel frontend plugin "instance" is not loaded.');
  }
  return instance.api;
}

const call = <K extends keyof ModManagerApi>(name: K) =>
  ((...args: any[]) => (resolveModManagerApi()[name] as any)(...args)) as ModManagerApi[K];

export const getMcVersionsApi = call("getMcVersionsApi");
export const modListApi = call("modListApi");
export const toggleModApi = call("toggleModApi");
export const deleteModApi = call("deleteModApi");
export const getModInfoApi = call("getModInfoApi");
export const getModBatchInfoApi = call("getModBatchInfoApi");
export const searchModsApi = call("searchModsApi");
export const getModVersionsApi = call("getModVersionsApi");
export const downloadModApi = call("downloadModApi");
export const stopTransferApi = call("stopTransferApi");
export const getModConfigFilesApi = call("getModConfigFilesApi");
