import { ref, shallowRef } from "vue";
import { ctx } from "@/plugin/context";
import { installMarketPlugin, uninstallMarketPlugin, type MarketPlugin } from "./api";

export interface MarketChange {
  plugin: MarketPlugin;
  kind: "install" | "uninstall";
  version?: string;
  daemonIds: string[];
  removeConfig?: boolean;
}

// Shared by normal pages and desktop windows; navigating to a detail keeps the queue.
export const bulkMode = ref(false);
export const queuedChanges = ref<MarketChange[]>([]);
export const applyingChanges = ref(false);
export const activeOperations = ref(0);
export const installedChange = shallowRef<{ pluginId: string; version?: string }>();

export function notifyInstalled(pluginId: string, version?: string) {
  installedChange.value = { pluginId, version };
}

export function queueMarketChange(change: MarketChange) {
  queuedChanges.value = [
    ...queuedChanges.value.filter((item) => item.plugin.id !== change.plugin.id),
    { ...change, plugin: { ...change.plugin }, daemonIds: [...change.daemonIds] }
  ];
}

export function discardMarketChange(pluginId: string) {
  if (applyingChanges.value) return;
  queuedChanges.value = queuedChanges.value.filter((item) => item.plugin.id !== pluginId);
}

/** Commit independently. Failed operations and failed nodes remain available to retry. */
export async function applyMarketChanges() {
  if (applyingChanges.value || activeOperations.value) return [];
  applyingChanges.value = true;
  const results: Array<{
    change: MarketChange;
    error?: unknown;
    failedNodes: string[];
    restartRequired: boolean;
  }> = [];
  try {
    for (const change of [...queuedChanges.value]) {
      try {
        const response =
          change.kind === "install"
            ? await installMarketPlugin().execute({
                timeout: (change.daemonIds.length + 1) * 11 * 60 * 1000,
                data: {
                  pluginId: change.plugin.id,
                  name: change.plugin.name,
                  version: change.version,
                  daemonIds: change.daemonIds
                }
              })
            : await uninstallMarketPlugin().execute({
                timeout: (change.daemonIds.length + 1) * 11 * 60 * 1000,
                params: {
                  pluginId: change.plugin.id,
                  daemonIds: change.daemonIds.join(","),
                  ...(change.removeConfig ? { removeConfig: true } : {})
                }
              });
        if (!response.value) throw new Error("Empty plugin operation response");
        const { failedNodes, installedVersion, restartRequired } = response.value;
        notifyInstalled(change.plugin.id, installedVersion);
        queuedChanges.value = queuedChanges.value.flatMap((item) =>
          item.plugin.id !== change.plugin.id
            ? [item]
            : failedNodes.length
            ? [{ ...change, daemonIds: failedNodes }]
            : []
        );
        results.push({ change, failedNodes, restartRequired });
      } catch (error) {
        results.push({ change, error, failedNodes: [], restartRequired: false });
      }
    }
    await ctx.plugins
      .refresh()
      .catch((error) => console.error("Failed to refresh plugins:", error));
    return results;
  } finally {
    applyingChanges.value = false;
  }
}
