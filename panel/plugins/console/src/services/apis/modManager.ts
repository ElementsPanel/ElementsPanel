import { usePluginService, type FrontendModManagerService } from "@/plugin/context";

type ModManagerApi = FrontendModManagerService["api"];

function resolveModManagerApi(): ModManagerApi {
  const mod = usePluginService<FrontendModManagerService>("mod");
  if (!mod) {
    throw new Error('Panel frontend plugin "mod" is not loaded.');
  }
  return mod.api;
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
