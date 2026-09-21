import type { PluginSide } from "./api";

/**
 * What a plugin's sides are called in the market. Both halves make a dual-sided
 * plugin; one half is named after itself. Nothing is said when the market did
 * not report any side — showing a badge would then be a guess.
 */
export function sideBadgeKey(sides: readonly PluginSide[] | undefined): string | undefined {
  const hasPanel = sides?.includes("panel") ?? false;
  const hasDaemon = sides?.includes("daemon") ?? false;
  if (hasPanel && hasDaemon) return "TXT_CODE_PLUGIN_MARKET_SIDE_BOTH";
  if (hasPanel) return "TXT_CODE_PLUGIN_MARKET_SIDE_PANEL";
  if (hasDaemon) return "TXT_CODE_PLUGIN_MARKET_SIDE_DAEMON";
  return undefined;
}
