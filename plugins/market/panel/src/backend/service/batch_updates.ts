import type { NpmPackageUpdate, NpmUpdateBatchResult, NpmRuntimeRecord } from "mcsmanager-common";
import { isNewerVersion } from "../../version";
import type {
  PluginUpdateBatchResult,
  PluginUpdateRequest,
  PluginUpdateTarget
} from "../../updates";
import { fetchMarketPluginDetail, recordRemoteInstall, PluginMarketError } from "./plugin_market";
import { marketSettings } from "./market_settings";
import { PANEL_PROCESS_ID } from "./restart";
import { updateTarget } from "./update_target";
import type { MarketInventory, MarketCatalogue, PanelPluginContext } from "../types";

export function createMarketBatchUpdates(
  ctx: PanelPluginContext,
  inventory: MarketInventory,
  catalogue: MarketCatalogue
) {
  const { requestedNodes, nodeInventories, daemonRuntimeInfo } = inventory;
  const { reportPluginMarketError } = catalogue;
  /** Plan by host so a daemon receives all of its packages in one request. */
  async function updateBatch(
    updates: PluginUpdateRequest[],
    reloadAfter: Promise<void>
  ): Promise<PluginUpdateBatchResult> {
    const response: PluginUpdateBatchResult = {
      results: updates.map((update) => ({
        pluginId: update.pluginId,
        result: {
          pluginId: update.pluginId,
          updatedTargets: [],
          failedTargets: [],
          restartRequired: false
        }
      }))
    };
    type Plan = { index: number; target: PluginUpdateTarget; update: NpmPackageUpdate };
    const plans = new Map<string, Plan[]>();
    const add = (index: number, target: PluginUpdateTarget, update: NpmPackageUpdate) => {
      const host = target.daemonId ?? "";
      plans.set(host, [...(plans.get(host) ?? []), { index, target, update }]);
    };
    const daemonIds = requestedNodes(
      updates.reduce<string[]>((ids, update) => ids.concat(update.daemonIds), [])
    );
    const inventories = await nodeInventories(daemonIds, true);
    const panelInventory = updates.some((update) => update.panel && !update.runtime)
      ? ctx.plugins.inventory()
      : [];
    const runtimeInfo = new Map<string, ReturnType<typeof daemonRuntimeInfo>>();
    const nodeInfo = (daemonId: string) => {
      if (!runtimeInfo.has(daemonId)) runtimeInfo.set(daemonId, daemonRuntimeInfo(daemonId, true));
      return runtimeInfo.get(daemonId)!;
    };

    for (const [index, update] of updates.entries()) {
      const result = response.results[index].result!;
      try {
        if (update.runtime) {
          const hosts =
            update.runtime === "panel"
              ? update.panel
                ? [""]
                : []
              : requestedNodes(update.daemonIds);
          for (const daemonId of hosts) {
            const node = ctx.remote.services.getInstance(daemonId);
            const target: PluginUpdateTarget = {
              ...(daemonId ? { daemonId } : {}),
              label: node?.config.remarks || node?.config.ip || daemonId,
              currentVersion: ""
            };
            try {
              const runtime = daemonId
                ? ((await nodeInfo(daemonId)).capabilities?.runtime as NpmRuntimeRecord | null)
                : ctx.plugins.runtime?.installed;
              if (
                runtime?.name !== `@elementspanel/${update.runtime}` ||
                typeof runtime.version !== "string"
              )
                throw new PluginMarketError("BUNDLED");
              target.currentVersion = runtime.version;
              if (isNewerVersion(update.version, runtime.version))
                add(index, target, { name: runtime.name, version: update.version, runtime: true });
            } catch (error) {
              ctx.logger.warn(`Failed to plan runtime update on ${daemonId || "panel"}: ${error}`);
              result.failedTargets.push(target);
            }
          }
          continue;
        }

        const detail = await fetchMarketPluginDetail(
          marketSettings().pluginMarketAddr,
          update.pluginId,
          update.version
        );
        const pkg = {
          pluginId: detail.id,
          name: detail.name,
          version: detail.selectedVersion.version
        };
        if (update.panel && detail.selectedVersion.sides.includes("panel")) {
          const target = updateTarget(panelInventory, detail.id, detail.name, pkg.version, "");
          if (target) add(index, target, pkg);
        }
        if (detail.selectedVersion.sides.includes("daemon")) {
          for (const daemonId of requestedNodes(update.daemonIds)) {
            const node = inventories.find((node) => node.daemonId === daemonId)!;
            if (!node.plugins) {
              result.failedTargets.push({ daemonId, label: node.label, currentVersion: "" });
              continue;
            }
            const target = updateTarget(
              node.plugins,
              detail.id,
              detail.name,
              pkg.version,
              node.label,
              daemonId
            );
            if (target) add(index, target, pkg);
          }
        }
      } catch (error) {
        try {
          reportPluginMarketError(error);
        } catch (reported) {
          response.results[index] = {
            pluginId: update.pluginId,
            error: reported instanceof Error ? reported.message : String(reported)
          };
        }
      }
    }

    // The panel finishes last and keeps its response transport until every node has settled.
    const hosts = [...plans.keys()].sort((a, b) => Number(!a) - Number(!b));
    for (const daemonId of hosts) {
      const hostPlans = plans.get(daemonId)!;
      try {
        const packages = hostPlans.map((plan) => plan.update);
        let installed: NpmUpdateBatchResult;
        if (daemonId) {
          const { request, capabilities } = await daemonRuntimeInfo(daemonId, true);
          if (capabilities?.batchUpdates !== true) throw new PluginMarketError("INCOMPATIBLE");
          installed = await request.request(
            "plugin/npm/update-batch",
            { updates: packages },
            packages.length * 11 * 60 * 1000
          );
        } else {
          installed = await ctx.plugins.updateBatch({ updates: packages, reloadAfter });
        }
        for (const plan of hostPlans) {
          const result = response.results[plan.index].result!;
          const record = installed?.results?.find(
            (record) =>
              record.name === plan.update.name &&
              record.version === plan.update.version &&
              record.pluginId === plan.update.pluginId &&
              Boolean(record.runtime) === Boolean(plan.update.runtime)
          );
          if (!record || record.error) {
            result.failedTargets.push(plan.target);
            continue;
          }
          result.updatedTargets.push(plan.target);
          if (!daemonId && installed.restartRequired)
            response.panelRestart = { processId: PANEL_PROCESS_ID };
          result.installedVersion = record.version;
          result.restartRequired ||= installed.restartRequired;
          if (daemonId && !plan.update.runtime) {
            try {
              await recordRemoteInstall(
                {
                  pluginId: plan.update.pluginId!,
                  name: record.name,
                  version: record.version,
                  installedAt: Date.now()
                },
                daemonId
              );
            } catch (error) {
              ctx.logger.warn(`Failed to record daemon ${daemonId} plugin update: ${error}`);
            }
          }
        }
      } catch (error) {
        ctx.logger.warn(`Failed to update packages on ${daemonId || "panel"}: ${error}`);
        for (const plan of hostPlans) {
          const result = response.results[plan.index].result!;
          if (!result.updatedTargets.includes(plan.target)) result.failedTargets.push(plan.target);
        }
      }
    }
    return response;
  }

  return { updateBatch };
}
