import { writePluginOverride } from "mcsmanager-common";
import {
  fetchMarketPluginDetail,
  recordRemoteInstall,
  forgetRemoteInstall,
  readRemoteInstalls,
  PluginMarketError,
  type MarketInstallInfo,
  type RemoteMarketInstall,
  type PluginSide
} from "./plugin_market";
import { marketSettings } from "./market_settings";
import type { MarketInventory, PanelPluginContext } from "../types";

export function createMarketOperations(ctx: PanelPluginContext, inventory: MarketInventory) {
  const { installedPlugins, requestedNodes, targetInstallations } = inventory;
  async function installOnNodes(
    daemonIds: readonly string[],
    info: MarketInstallInfo
  ): Promise<{ failedNodes: string[]; changedNodes: string[]; pendingNodes: string[] }> {
    const failedNodes: string[] = [];
    const changedNodes: string[] = [];
    const pendingNodes: string[] = [];
    for (const daemonId of daemonIds) {
      const node = ctx.remote.services.getInstance(daemonId);
      if (!node || !node.available) {
        failedNodes.push(daemonId);
        continue;
      }
      try {
        const result = await new ctx.remote.Request(node).request(
          "plugin/npm/install",
          { name: info.name, pluginId: info.pluginId, version: info.version },
          10 * 60 * 1000
        );
        if (result?.result?.application === "pending") pendingNodes.push(daemonId);
      } catch (error) {
        ctx.logger.warn(`Failed to install a plugin on daemon ${daemonId}: ${error}`);
        failedNodes.push(daemonId);
        continue;
      }
      await recordRemoteInstall(info, daemonId);
      changedNodes.push(daemonId);
    }
    return { failedNodes, changedNodes, pendingNodes };
  }

  /** Failed or unselected uninstalls stay recorded until a later successful retry. */
  async function removeFromNodes(
    installations: readonly RemoteMarketInstall[],
    removeConfig = false
  ) {
    const failedNodes = new Set<string>();
    const changedNodes = new Set<string>();
    for (const installation of installations) {
      const { daemonId, name, pluginId } = installation;
      const node = ctx.remote.services.getInstance(daemonId);
      if (!node || !node.available) {
        failedNodes.add(daemonId);
        continue;
      }
      try {
        await new ctx.remote.Request(node).request(
          "plugin/npm/uninstall",
          { name, pluginId, ...(removeConfig ? { removeConfig: true } : {}) },
          10 * 60 * 1000
        );
      } catch (error) {
        ctx.logger.warn(`Failed to uninstall a plugin on daemon ${daemonId}: ${error}`);
        failedNodes.add(daemonId);
        continue;
      }
      await forgetRemoteInstall(installation);
      changedNodes.add(daemonId);
    }
    return { failedNodes: [...failedNodes], changedNodes: [...changedNodes] };
  }

  /** Re-scan selected daemons and reconnect older socket-bound routers. */
  async function reloadNodes(daemonIds: readonly string[], pluginId?: string): Promise<boolean> {
    let reloaded = true;
    for (const daemonId of daemonIds) {
      const node = ctx.remote.services.getInstance(daemonId);
      if (!node || !node.available) {
        reloaded = false;
        continue;
      }
      try {
        const inventory = await new ctx.remote.Request(node).request("plugin/reload");
        if (
          Array.isArray(inventory) &&
          inventory.some((plugin) => plugin.id === pluginId && plugin.state === "restart-required")
        )
          reloaded = false;
        node.refreshReconnect();
      } catch (error) {
        // Daemons without reload support apply changes after restart.
        ctx.logger.warn(`Failed to reload a daemon's plugins: ${error}`);
        reloaded = false;
      }
    }
    return reloaded;
  }

  /** Reconcile plugins in place; schedule core process replacement after this response. */
  async function hotReload(
    sides: PluginSide[],
    daemonIds: readonly string[] = [],
    pluginId?: string
  ): Promise<boolean> {
    if (!sides.length) return true;
    try {
      if (sides.includes("panel")) await ctx.plugins.reload();
      const panelReady =
        !sides.includes("panel") ||
        ctx.plugins.restartPending ||
        !ctx.plugins
          .inventory()
          .some((plugin) => plugin.id === pluginId && plugin.state === "restart-required");
      if (sides.includes("daemon")) return (await reloadNodes(daemonIds, pluginId)) && panelReady;
      return panelReady;
    } catch (error) {
      ctx.logger.warn(`Failed to reload plugins after a market install: ${error}`);
      return false;
    }
  }

  async function install(body: Record<string, unknown>, reloadAfter: Promise<void>) {
    const detail = await fetchMarketPluginDetail(
      marketSettings().pluginMarketAddr,
      String(body.pluginId),
      body.version ? String(body.version) : undefined
    );
    const daemonIds = requestedNodes(body.daemonIds);
    const sides = detail.selectedVersion.sides;
    const installPanel = body.panel !== false && sides.includes("panel");
    if (!installPanel && (!sides.includes("daemon") || !daemonIds.length))
      throw new PluginMarketError("NO_NODES");
    const info: MarketInstallInfo = {
      pluginId: detail.id,
      name: detail.name,
      version: detail.selectedVersion.version,
      installedAt: Date.now()
    };
    // Update foundation npm packages while rejecting source-only plugins.
    if (
      installPanel &&
      ctx.plugins.inventory().some((item) => item.id === info.pluginId && !item.packageName)
    )
      throw new PluginMarketError("BUNDLED");

    const changedSides: PluginSide[] = [];
    // Finish node requests before a panel foundation reload replaces their connections.
    const { failedNodes, changedNodes, pendingNodes } =
      sides.includes("daemon") && daemonIds.length
        ? await installOnNodes(daemonIds, info)
        : { failedNodes: [], changedNodes: [], pendingNodes: [] };
    if (changedNodes.length) changedSides.push("daemon");
    if (installPanel) {
      await ctx.plugins.install({
        name: detail.name,
        pluginId: detail.id,
        version: detail.selectedVersion.version,
        reloadAfter
      });
      changedSides.push("panel");
    }
    // Current daemons queue reload after replying; a second RPC would race connection replacement.
    const reloaded = await hotReload(
      changedSides,
      changedNodes.filter((id) => !pendingNodes.includes(id)),
      info.pluginId
    );

    return {
      restartRequired: !reloaded,
      installedVersion:
        body.panel === false
          ? readRemoteInstalls(info.pluginId).find((item) => daemonIds.includes(item.daemonId))
              ?.version
          : body.panel === true
          ? installedPlugins().find((item) => item.pluginId === info.pluginId)?.panelVersion
          : installedPlugins().find((item) => item.pluginId === info.pluginId)?.version,
      failedNodes
    };
  }

  async function uninstall(query: Record<string, unknown>) {
    const pluginId = String(query.pluginId);
    const daemonIds = requestedNodes(query.daemonIds);
    const removeConfig = query.removeConfig === "true";
    const removePanel = query.panel !== "false";
    const selectedNodes = new Set(daemonIds);
    const installations = readRemoteInstalls(pluginId).filter((item) =>
      selectedNodes.has(item.daemonId)
    );
    const unavailableNodes: string[] = [];
    // Include packages installed directly on a selected daemon, outside the market.
    if (query.panel !== undefined) {
      for (const daemonId of daemonIds) {
        if (installations.some((item) => item.daemonId === daemonId)) continue;
        try {
          const installed = (await targetInstallations(daemonId)).find(
            (item) => item.pluginId === pluginId
          );
          if (installed) installations.push({ ...installed, daemonId });
        } catch (error) {
          if (!(error instanceof PluginMarketError) || error.reason !== "NODE_UNAVAILABLE")
            throw error;
          unavailableNodes.push(daemonId);
        }
      }
    }
    const local = removePanel && ctx.plugins.inventory().find((plugin) => plugin.id === pluginId);
    if (local) await ctx.plugins.remove(pluginId);
    if (local && removeConfig) {
      await ctx.plugins.runExclusive(async () => writePluginOverride(pluginId, { config: {} }));
    }
    const removed = Boolean(local);
    const { failedNodes, changedNodes } = await removeFromNodes(installations, removeConfig);
    failedNodes.push(...unavailableNodes);
    const sides: PluginSide[] = removed ? ["panel"] : [];
    if (changedNodes.length) sides.push("daemon");
    const remaining = installedPlugins().find((item) => item.pluginId === pluginId);
    const targetedVersion = !removePanel
      ? installations.find((item) => failedNodes.includes(item.daemonId))?.version
      : query.panel === "true"
      ? remaining?.panelVersion
      : remaining?.version;
    return {
      removed: query.panel !== undefined ? !targetedVersion : !remaining,
      installedVersion: targetedVersion,
      failedNodes,
      restartRequired: !(await hotReload(sides, changedNodes, pluginId))
    };
  }

  return { installOnNodes, hotReload, install, uninstall };
}
