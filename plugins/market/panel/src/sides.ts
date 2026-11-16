import type { PluginSide } from "./api";

/** Label only declared plugin sides; missing metadata must not imply a side. */
export function sideBadgeKey(sides: readonly PluginSide[] | undefined): string | undefined {
  const hasPanel = sides?.includes("panel") ?? false;
  const hasDaemon = sides?.includes("daemon") ?? false;
  if (hasPanel && hasDaemon) return "TXT_CODE_PLUGIN_MARKET_SIDE_BOTH";
  if (hasPanel) return "TXT_CODE_PLUGIN_MARKET_SIDE_PANEL";
  if (hasDaemon) return "TXT_CODE_PLUGIN_MARKET_SIDE_DAEMON";
  return undefined;
}
