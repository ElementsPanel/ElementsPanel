import {
  validatePluginCompatibility,
  type NpmRuntimeRecord,
  type NpmRuntimeUpdate
} from "mcsmanager-common";
import { isNewerVersion } from "../../version";
import type {
  PluginUpdate,
  PluginUpdateResult,
  PluginUpdates,
  PluginUpdateTarget
} from "../../updates";
import { fetchMarketPluginDetail, PluginMarketError, type PluginSide } from "./plugin_market";
import { marketSettings } from "./market_settings";
import { createMarketBatchUpdates } from "./batch_updates";
import { updateTarget } from "./update_target";
import type {
  MarketInventory,
  MarketCatalogue,
  MarketOperations,
  PanelPluginContext
} from "../types";

export function createMarketUpdates(
  ctx: PanelPluginContext,
  inventory: MarketInventory,
  catalogue: MarketCatalogue,
  operations: MarketOperations
) {
  const { installedPlugins, requestedNodes, nodeInventories, listNodes, daemonRuntimeInfo } =
    inventory;
  const { fetchMarketPlugins, reportPluginMarketError } = catalogue;
  const { installOnNodes, hotReload } = operations;
  const { updateBatch } = createMarketBatchUpdates(ctx, inventory, catalogue);
  async function runtimeUpdates(daemonId?: string) {
    const plugins: PluginUpdate[] = [];
    let checkFailed = false;
    const add = (runtime: NpmRuntimeUpdate | null, label: string, daemonId?: string) => {
      if (
        !runtime ||
        runtime.side !== (daemonId ? "daemon" : "panel") ||
        runtime.name !== `@elementspanel/${runtime.side}` ||
        typeof runtime.version !== "string" ||
        typeof runtime.latestVersion !== "string" ||
        !isNewerVersion(runtime.latestVersion, runtime.version)
      )
        return;
      // Nodes may use different registries, so keep differing release versions separate.
      let update = plugins.find(
        (plugin) => plugin.name === runtime.name && plugin.version === runtime.latestVersion
      );
      if (!update) {
        update = {
          pluginId: `${runtime.name}@${runtime.latestVersion}`,
          name: runtime.name,
          displayName: runtime.side === "panel" ? "ElementsPanel Panel" : "ElementsPanel Daemon",
          runtime: runtime.side,
          version: runtime.latestVersion,
          targets: []
        };
        plugins.push(update);
      }
      update.targets.push({
        ...(daemonId ? { daemonId } : {}),
        label,
        currentVersion: runtime.version
      });
    };
    const nodes =
      daemonId === undefined
        ? listNodes()
        : daemonId
        ? listNodes().filter((node) => node.daemonId === daemonId)
        : [];
    await Promise.all([
      (async () => {
        if (daemonId) return;
        try {
          add((await ctx.plugins.runtime?.check()) ?? null, "");
        } catch (error) {
          checkFailed = true;
          ctx.logger.warn(`Failed to check panel runtime updates: ${error}`);
        }
      })(),
      ...nodes.map(async ({ daemonId, available }) => {
        if (!available) return;
        const node = ctx.remote.services.getInstance(daemonId);
        if (!node) return;
        const label = node.config.remarks || node.config.ip || daemonId;
        try {
          const { request, capabilities } = await daemonRuntimeInfo(daemonId);
          if (capabilities?.runtimeUpdates !== true) return;
          add(await request.request("runtime/check", undefined, 25000), label, daemonId);
        } catch (error) {
          checkFailed = true;
          ctx.logger.warn(`Failed to check daemon ${daemonId} runtime updates: ${error}`);
        }
      })
    ]);
    return { plugins, checkFailed };
  }

  async function checkUpdates(daemonId?: string) {
    try {
      let marketCheckFailed = false;
      const [market, inventories, runtimes] = await Promise.all([
        fetchMarketPlugins(marketSettings().pluginMarketAddr).catch((error) => {
          marketCheckFailed = true;
          ctx.logger.warn(`Failed to check plugin updates: ${error}`);
          return [];
        }),
        nodeInventories(daemonId === undefined ? undefined : daemonId ? [daemonId] : []),
        runtimeUpdates(daemonId)
      ]);
      const panel = ctx.plugins.inventory();
      const plugins: PluginUpdate[] = [];
      for (const item of market) {
        const release = item.latestVersion as
          | {
              version?: string;
              status?: string;
              sides?: PluginSide[];
              compatibility?: Record<string, { api: number; sdk?: number }>;
            }
          | undefined;
        if (
          typeof release?.version !== "string" ||
          (release.status && release.status !== "approved")
        )
          continue;
        try {
          for (const contract of Object.values(release.compatibility ?? {}))
            validatePluginCompatibility(contract);
        } catch {
          continue;
        }
        const pluginId = String(item.id);
        const name = String(item.name ?? "");
        const declaredSides = release.sides?.length ? release.sides : item.sides;
        const sides = Array.isArray(declaredSides) ? declaredSides : [];
        const targets: PluginUpdateTarget[] = [];
        if (sides?.includes("panel") && !daemonId) {
          const target = updateTarget(panel, pluginId, name, release.version, "");
          if (target) targets.push(target);
        }
        if (sides?.includes("daemon")) {
          for (const node of inventories) {
            const target =
              node.plugins &&
              updateTarget(
                node.plugins,
                pluginId,
                name,
                release.version,
                node.label,
                node.daemonId
              );
            if (target) targets.push(target);
          }
        }
        if (targets.length)
          plugins.push({
            pluginId,
            name,
            displayName: String(item.displayName || item.name || item.id),
            version: release.version,
            targets
          });
      }
      const result: PluginUpdates = {
        plugins: [...runtimes.plugins, ...plugins],
        ...(marketCheckFailed || runtimes.checkFailed ? { checkFailed: true } : {}),
        uncheckedNodes: inventories
          .filter((node) => !node.plugins)
          .map(({ daemonId, label }) => ({ daemonId, label }))
      };
      return result;
    } catch (error) {
      reportPluginMarketError(error);
    }
  }
  async function updateRuntime(
    body: { side: PluginSide; version: string; daemonIds: string[] },
    reloadAfter: Promise<void>
  ) {
    const result: PluginUpdateResult = {
      pluginId: `@elementspanel/${body.side}@${body.version}`,
      updatedTargets: [],
      failedTargets: [],
      restartRequired: false
    };
    if (body.side === "panel") {
      const runtime = ctx.plugins.runtime?.installed;
      if (!runtime) throw new PluginMarketError("BUNDLED");
      if (!isNewerVersion(body.version, runtime.version)) return result;
      const target = { label: "", currentVersion: runtime.version };
      try {
        const installed = await ctx.plugins.runtime!.update({
          version: body.version,
          reloadAfter
        });
        result.installedVersion = installed.version;
        result.restartRequired = installed.restartRequired;
        result.updatedTargets.push(target);
      } catch (error) {
        ctx.logger.warn(`Failed to update panel runtime: ${error}`);
        result.failedTargets.push(target);
      }
    } else {
      for (const daemonId of requestedNodes(body.daemonIds)) {
        const node = ctx.remote.services.getInstance(daemonId);
        const target: PluginUpdateTarget = {
          daemonId,
          label: node?.config.remarks || node?.config.ip || daemonId,
          currentVersion: ""
        };
        try {
          const { request, capabilities } = await daemonRuntimeInfo(daemonId, true);
          const runtime = capabilities?.runtime as NpmRuntimeRecord | null;
          if (
            capabilities?.runtimeUpdates !== true ||
            runtime?.name !== "@elementspanel/daemon" ||
            typeof runtime.version !== "string"
          )
            throw new PluginMarketError("BUNDLED");
          target.currentVersion = runtime.version;
          if (!isNewerVersion(body.version, runtime.version)) continue;
          const installed = await request.request(
            "runtime/update",
            { version: body.version },
            11 * 60 * 1000
          );
          if (installed?.name !== runtime.name || installed.version !== body.version)
            throw new Error("Unexpected daemon runtime update response.");
          result.restartRequired ||= installed.restartRequired === true;
          result.updatedTargets.push(target);
        } catch (error) {
          ctx.logger.warn(`Failed to update daemon ${daemonId} runtime: ${error}`);
          result.failedTargets.push(target);
        }
      }
    }
    return result;
  }

  async function updatePlugin(
    body: { pluginId: string; version: string; panel: boolean; daemonIds: string[] },
    reloadAfter: Promise<void>
  ): Promise<PluginUpdateResult> {
    const detail = await fetchMarketPluginDetail(
      marketSettings().pluginMarketAddr,
      body.pluginId,
      body.version
    );
    const info = {
      pluginId: detail.id,
      name: detail.name,
      version: detail.selectedVersion.version,
      installedAt: Date.now()
    };
    const sides = detail.selectedVersion.sides;
    const updatedTargets: PluginUpdateTarget[] = [];
    const failedTargets: PluginUpdateTarget[] = [];
    const inventories = sides.includes("daemon")
      ? await nodeInventories(requestedNodes(body.daemonIds), true)
      : [];
    const targets: PluginUpdateTarget[] = [];
    for (const node of inventories) {
      if (!node.plugins) {
        failedTargets.push({
          daemonId: node.daemonId,
          label: node.label,
          currentVersion: ""
        });
        continue;
      }
      const target = updateTarget(
        node.plugins,
        detail.id,
        detail.name,
        info.version,
        node.label,
        node.daemonId
      );
      if (target) targets.push(target);
    }
    const { failedNodes, changedNodes, pendingNodes } = await installOnNodes(
      targets.map((target) => target.daemonId!),
      info
    );
    for (const target of targets)
      (failedNodes.includes(target.daemonId!) ? failedTargets : updatedTargets).push(target);

    // Check each host independently to avoid downgrades or installing an unselected panel half.
    if (body.panel && sides.includes("panel")) {
      const target = updateTarget(
        ctx.plugins.inventory(),
        detail.id,
        detail.name,
        info.version,
        ""
      );
      if (target) {
        try {
          await ctx.plugins.install({
            name: info.name,
            pluginId: info.pluginId,
            version: info.version,
            reloadAfter
          });
          updatedTargets.push(target);
        } catch (error) {
          ctx.logger.warn(`Failed to update panel plugin ${detail.id}: ${error}`);
          failedTargets.push(target);
        }
      }
    }
    const changedSides: PluginSide[] = [];
    if (changedNodes.length) changedSides.push("daemon");
    if (updatedTargets.some((target) => !target.daemonId)) changedSides.push("panel");
    const ready = await hotReload(
      changedSides,
      changedNodes.filter((id) => !pendingNodes.includes(id)),
      detail.id
    );
    return {
      pluginId: detail.id,
      installedVersion: installedPlugins().find((plugin) => plugin.pluginId === detail.id)?.version,
      updatedTargets,
      failedTargets,
      restartRequired: !ready
    };
  }

  return { checkUpdates, updateBatch, updateRuntime, updatePlugin };
}
