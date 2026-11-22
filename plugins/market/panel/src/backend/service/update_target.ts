import { isNewerVersion } from "../../version";
import type { PluginUpdateTarget } from "../../updates";

export function updateTarget(
  inventory: readonly { id: string; packageName?: string; version?: string }[],
  pluginId: string,
  name: string,
  version: string,
  label: string,
  daemonId?: string
): PluginUpdateTarget | undefined {
  const installed = inventory.find((plugin) => plugin?.id === pluginId);
  if (
    installed?.packageName !== name ||
    typeof installed.version !== "string" ||
    !isNewerVersion(version, installed.version)
  )
    return;
  return { ...(daemonId ? { daemonId } : {}), label, currentVersion: installed.version };
}
