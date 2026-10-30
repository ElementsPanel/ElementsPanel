export {
  TYPE_UNIVERSAL,
  TYPE_MINECRAFT_JAVA,
  TYPE_MINECRAFT_BEDROCK,
  TYPE_MINECRAFT_BUNGEECORD,
  TYPE_STEAM_SERVER_UNIVERSAL,
  TYPE_HYTALE,
  TYPE_TERRARIA
} from "@elements-panel/sdk";
export type { InstanceMoreDetail, InstanceConfigs } from "@instance/hooks/useInstance";
import { instanceData, instanceHook } from "./instanceService";

export const useInstanceMoreDetail = instanceHook("useInstanceMoreDetail");
export const useInstanceInfo = instanceHook("useInstanceInfo");
export const getInstanceConfigByType = instanceHook("getInstanceConfigByType");
export const verifyEULA = instanceHook("verifyEULA");
export const INSTANCE_TYPE_TRANSLATION = instanceData("INSTANCE_TYPE_TRANSLATION", {});
export const INSTANCE_CONFIGS = instanceData("INSTANCE_CONFIGS", []);
