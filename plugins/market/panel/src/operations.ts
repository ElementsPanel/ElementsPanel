import { ref, shallowRef } from "vue";
import { ctx } from "@elements-panel/sdk";
import {
  installMarketPlugin,
  uninstallMarketPlugin,
  updateMarketBatch,
  type MarketPlugin
} from "./api";
import type { PluginUpdate, PluginUpdateResult } from "./updates";

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
// Unlike target selection, dependency writes must block the whole panel until they settle.
export const changingDependencies = ref(0);
export const installedChange = shallowRef<{
  pluginId: string;
  version?: string;
  daemonId?: string;
}>();
export const updatingPlugins = ref(false);
export const updateProgress = ref({ completed: 0, total: 0, name: "" });
export const updateResults = shallowRef<
  Array<{
    update: PluginUpdate;
    result?: PluginUpdateResult;
    error?: unknown;
  }>
>([]);

/** The backend owns the entire batch, including its final process restarts. */
export async function updateMarketPlugins(updates: readonly PluginUpdate[]) {
  if (
    applyingChanges.value ||
    activeOperations.value ||
    queuedChanges.value.length ||
    !updates.length
  )
    return [];
  applyingChanges.value = true;
  updatingPlugins.value = true;
  updateResults.value = [];
  const pending = updates
    .map((update) => ({
      ...update,
      targets: update.targets.map((target) => ({ ...target }))
    }))
    .sort(
      (a, b) =>
        (a.runtime === "panel" ? 2 : a.runtime ? 1 : 0) -
        (b.runtime === "panel" ? 2 : b.runtime ? 1 : 0)
    );
  updateProgress.value = {
    completed: 0,
    total: pending.length,
    name: pending.map((update) => update.displayName).join("、")
  };
  try {
    const response = await updateMarketBatch().execute({
      timeout:
        pending.reduce((total, update) => total + update.targets.length + 1, 0) * 16 * 60 * 1000,
      data: {
        updates: pending.map((update) => ({
          pluginId: update.pluginId,
          version: update.version,
          ...(update.runtime ? { runtime: update.runtime } : {}),
          panel: update.targets.some((target) => !target.daemonId),
          daemonIds: update.targets.flatMap((target) => (target.daemonId ? [target.daemonId] : []))
        }))
      }
    });
    const batch = response.value;
    if (!batch || batch.results.length !== pending.length)
      throw new Error("Incomplete plugin update batch response");
    updateResults.value = pending.map((update, index) => {
      const item = batch.results[index];
      if (item.error || !item.result)
        return { update, error: new Error(item.error || "Empty plugin update response") };
      notifyInstalled(update.pluginId, item.result.installedVersion);
      return { update, result: item.result };
    });
    updateProgress.value.completed = pending.length;
    await ctx.plugins
      .refresh()
      .catch((error) => console.error("Failed to refresh plugins:", error));
    return updateResults.value;
  } catch (error) {
    updateResults.value = pending.map((update) => ({ update, error }));
    return updateResults.value;
  } finally {
    applyingChanges.value = false;
    updatingPlugins.value = false;
  }
}

export function notifyInstalled(pluginId: string, version?: string, daemonId?: string) {
  installedChange.value = { pluginId, version, ...(daemonId !== undefined ? { daemonId } : {}) };
}

export function marketChangeKey(plugin: MarketPlugin) {
  return JSON.stringify([plugin.id, plugin.targetDaemonId ?? null]);
}

export function queueMarketChange(change: MarketChange) {
  queuedChanges.value = [
    ...queuedChanges.value.filter(
      (item) => marketChangeKey(item.plugin) !== marketChangeKey(change.plugin)
    ),
    { ...change, plugin: { ...change.plugin }, daemonIds: [...change.daemonIds] }
  ];
}

export function discardMarketChange(pluginId: string, daemonId?: string) {
  if (applyingChanges.value) return;
  queuedChanges.value = queuedChanges.value.filter(
    (item) => item.plugin.id !== pluginId || item.plugin.targetDaemonId !== daemonId
  );
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
                  daemonIds: change.daemonIds,
                  ...(change.plugin.targetDaemonId !== undefined
                    ? { panel: !change.plugin.targetDaemonId }
                    : {})
                }
              })
            : await uninstallMarketPlugin().execute({
                timeout: (change.daemonIds.length + 1) * 11 * 60 * 1000,
                params: {
                  pluginId: change.plugin.id,
                  daemonIds: change.daemonIds.join(","),
                  ...(change.plugin.targetDaemonId !== undefined
                    ? { panel: !change.plugin.targetDaemonId }
                    : {}),
                  ...(change.removeConfig ? { removeConfig: true } : {})
                }
              });
        if (!response.value) throw new Error("Empty plugin operation response");
        const { failedNodes, installedVersion, restartRequired } = response.value;
        notifyInstalled(change.plugin.id, installedVersion, change.plugin.targetDaemonId);
        queuedChanges.value = queuedChanges.value.flatMap((item) =>
          marketChangeKey(item.plugin) !== marketChangeKey(change.plugin)
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
