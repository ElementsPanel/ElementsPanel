import type { PanelFrontendInstanceActionContext } from "@elements-panel/sdk";
import { TYPE_MINECRAFT_BEDROCK, TYPE_MINECRAFT_JAVA } from "@/hooks/useInstance";

/** Exclude global terminals from actions that require an instance. */
export const isScopedInstance = ({
  instanceId,
  daemonId,
  isGlobalTerminal
}: PanelFrontendInstanceActionContext) =>
  !isGlobalTerminal && Boolean(instanceId && daemonId);

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
