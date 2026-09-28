export {
  TYPE_UNIVERSAL,
  TYPE_WEB_SHELL,
  TYPE_MINECRAFT_MCDR,
  TYPE_MINECRAFT_JAVA,
  TYPE_MINECRAFT_BUKKIT,
  TYPE_MINECRAFT_SPIGOT,
  TYPE_MINECRAFT_PAPER,
  TYPE_MINECRAFT_FOLIA,
  TYPE_MINECRAFT_LEAVES,
  TYPE_MINECRAFT_PUFFERFISH,
  TYPE_MINECRAFT_FORGE,
  TYPE_MINECRAFT_NEOFORGE,
  TYPE_MINECRAFT_FABRIC,
  TYPE_MINECRAFT_BUNGEECORD,
  TYPE_MINECRAFT_VELOCITY,
  TYPE_MINECRAFT_GEYSER,
  TYPE_MINECRAFT_SPONGE,
  TYPE_MINECRAFT_MOHIST,
  TYPE_MINECRAFT_PURPUR,
  TYPE_MINECRAFT_BEDROCK,
  TYPE_MINECRAFT_BDS,
  TYPE_MINECRAFT_NUKKIT,
  TYPE_HYTALE,
  TYPE_STEAM_SERVER_UNIVERSAL,
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
