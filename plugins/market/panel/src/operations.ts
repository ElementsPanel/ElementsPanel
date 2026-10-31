import { ref, shallowRef } from "vue";
import { ctx } from "@/plugin/context";
import {
  installMarketPlugin,
  uninstallMarketPlugin,
  updateMarketPlugin,
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
export const installedChange = shallowRef<{ pluginId: string; version?: string }>();
export const updatingPlugins = ref(false);
export const updateProgress = ref({ completed: 0, total: 0, name: "" });
export const updateResults = shallowRef<
  Array<{
    update: PluginUpdate;
    result?: PluginUpdateResult;
    error?: unknown;
  }>
>([]);

/** Updates keep running when the market window is closed. Each plugin settles independently. */
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
  const pending = updates.map((update) => ({
    ...update,
    targets: update.targets.map((target) => ({ ...target }))
  }));
  updateProgress.value = { completed: 0, total: pending.length, name: "" };
  try {
    for (const update of pending) {
      updateProgress.value.name = update.displayName;
      try {
        const response = await updateMarketPlugin().execute({
          timeout: (update.targets.length + 1) * 11 * 60 * 1000,
          data: {
            pluginId: update.pluginId,
            version: update.version,
            panel: update.targets.some((target) => !target.daemonId),
            daemonIds: update.targets.flatMap((target) =>
              target.daemonId ? [target.daemonId] : []
            )
          }
        });
        if (!response.value) throw new Error("Empty plugin update response");
        updateResults.value = [...updateResults.value, { update, result: response.value }];
        notifyInstalled(update.pluginId, response.value.installedVersion);
      } catch (error) {
        updateResults.value = [...updateResults.value, { update, error }];
      }
      updateProgress.value.completed++;
    }
    await ctx.plugins
      .refresh()
      .catch((error) => console.error("Failed to refresh plugins:", error));
    return updateResults.value;
  } finally {
    applyingChanges.value = false;
    updatingPlugins.value = false;
  }
}

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
