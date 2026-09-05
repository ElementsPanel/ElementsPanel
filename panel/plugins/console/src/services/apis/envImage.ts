import { usePluginService } from "@/plugin/context";
import type * as InstanceApi from "@instance/api";

type EnvironmentApi = Pick<
  typeof InstanceApi,
  | "imageList"
  | "getNetworkModeList"
  | "containerList"
  | "buildProgress"
  | "getImagePlatforms"
  | "getDockerHubImagePlatforms"
>;

function resolveEnvironmentApi(): EnvironmentApi {
  const instance = usePluginService<{ api: EnvironmentApi }>("instance");
  if (!instance) {
    throw new Error('Panel frontend plugin "instance" is not loaded.');
  }
  return instance.api;
}

const call = <K extends keyof EnvironmentApi>(name: K) =>
  ((...args: any[]) => (resolveEnvironmentApi()[name] as any)(...args)) as EnvironmentApi[K];

export const imageList = call("imageList");
export const getNetworkModeList = call("getNetworkModeList");
export const containerList = call("containerList");
export const buildProgress = call("buildProgress");
export const getImagePlatforms = call("getImagePlatforms");
export const getDockerHubImagePlatforms = call("getDockerHubImagePlatforms");
