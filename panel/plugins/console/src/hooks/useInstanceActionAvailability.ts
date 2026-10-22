import type { PanelFrontendInstanceActionContext } from "@/plugin";
import { TYPE_MINECRAFT_BEDROCK, TYPE_MINECRAFT_JAVA } from "@/hooks/useInstance";

/**
 * Instance actions are always scoped to a real instance; the global terminal is
 * not an instance, so it must never offer an action that opens instance UI.
 */
export const isScopedInstance = ({
  instanceId,
  daemonId,
  isGlobalTerminal
}: PanelFrontendInstanceActionContext) =>
  !isGlobalTerminal && Boolean(instanceId && daemonId);

/** True when the node reports the daemon plugin that serves this action. */
export const hasNodeFeature = (
  { daemon }: PanelFrontendInstanceActionContext,
  feature: string
) => Boolean((daemon as any)?.features?.[feature]);

export const instanceConfig = ({ instanceInfo }: PanelFrontendInstanceActionContext) =>
  (instanceInfo as any)?.config;

/** Minecraft Java and Bedrock share the same plugin surface. */
export const isMinecraftInstance = (context: PanelFrontendInstanceActionContext) => {
  const type = String(instanceConfig(context)?.type ?? "");
  return type.startsWith(TYPE_MINECRAFT_JAVA) || type.startsWith(TYPE_MINECRAFT_BEDROCK);
};
