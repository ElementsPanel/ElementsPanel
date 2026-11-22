import { listInstalled, PluginMarketError, type InstalledMarketPlugin } from "./plugin_market";
import { NODE_RESTART_TIMEOUT_MS } from "./restart";
import type { PanelPluginContext } from "../types";

export function createMarketInventory(ctx: PanelPluginContext) {
  // Count source and disabled plugins as installed; defer update eligibility to the loader.
  function installedPlugins() {
    const records = listInstalled();
    for (const plugin of ctx.plugins?.inventory() ?? []) {
      const installed = records.find((item) => item.pluginId === plugin.id);
      if (installed) {
        installed.removable = installed.removable && plugin.removable;
        installed.updatable = Boolean(plugin.packageName);
        installed.state = plugin.state;
      } else {
        records.push({
          pluginId: plugin.id,
          name: plugin.packageName ?? plugin.id,
          version: plugin.version ?? "",
          panelVersion: plugin.version,
          state: plugin.state,
          daemonVersions: {},
          installedAt: 0,
          sides: ["panel"],
          directories: [],
          daemonIds: [],
          source: "bundled",
          updatable: Boolean(plugin.packageName),
          removable: plugin.removable
        });
      }
    }
    return records;
  }

  function listNodes() {
    return Array.from(ctx.remote.services.services.entries()).map(([daemonId, node]) => ({
      daemonId,
      remarks: node.config.remarks,
      ip: node.config.ip,
      port: node.config.port,
      available: node.available
    }));
  }

  /** Install targets come from the body; uninstall targets come from query parameters. */
  function requestedNodes(value: unknown): string[] {
    const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
    return [
      ...new Set(
        values
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      )
    ];
  }

  async function nodeInventories(
    daemonIds = listNodes().map((node) => node.daemonId),
    waitForReconnect = false
  ) {
    return Promise.all(
      daemonIds.map(async (daemonId) => {
        const deadline = Date.now() + (waitForReconnect ? NODE_RESTART_TIMEOUT_MS : 0);
        while (true) {
          const node = ctx.remote.services.getInstance(daemonId);
          const label = node?.config.remarks || node?.config.ip || daemonId;
          try {
            if (!node?.available) throw new Error("Node unavailable");
            const inventory: unknown = await new ctx.remote.Request(node).request(
              "plugin/list",
              undefined,
              10000
            );
            if (!Array.isArray(inventory)) throw new Error("Plugin inventory unavailable");
            return {
              daemonId,
              label,
              plugins: inventory as Array<{
                id: string;
                packageName?: string;
                version?: string;
                state?: string;
                removable?: boolean;
              }>
            };
          } catch {
            // An earlier foundation update may be replacing the daemon's socket.
            if (!node || Date.now() >= deadline) return { daemonId, label, plugins: null };
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      })
    );
  }

  async function targetInstallations(daemonId?: string): Promise<InstalledMarketPlugin[]> {
    if (daemonId === undefined) return installedPlugins();
    if (!daemonId)
      return installedPlugins()
        .filter((plugin) => plugin.panelVersion !== undefined || plugin.sides.includes("panel"))
        .map((plugin) => ({
          ...plugin,
          version: plugin.panelVersion ?? plugin.version,
          sides: ["panel"],
          daemonIds: [],
          daemonVersions: {}
        }));
    const [node] = await nodeInventories([daemonId]);
    if (!node.plugins) throw new PluginMarketError("NODE_UNAVAILABLE");
    return node.plugins
      .filter((plugin) => typeof plugin?.id === "string")
      .map((plugin) => ({
        pluginId: plugin.id,
        name: plugin.packageName ?? plugin.id,
        version: plugin.version ?? "",
        state: plugin.state,
        installedAt: 0,
        daemonVersions: { [daemonId]: plugin.version ?? "" },
        sides: ["daemon"],
        daemonIds: [daemonId],
        directories: [],
        source: plugin.packageName ? "project" : "bundled",
        removable: plugin.removable === true,
        updatable: Boolean(plugin.packageName)
      }));
  }

  async function daemonRuntimeInfo(daemonId: string, waitForReconnect = false) {
    const deadline = Date.now() + (waitForReconnect ? NODE_RESTART_TIMEOUT_MS : 0);
    while (true) {
      const node = ctx.remote.services.getInstance(daemonId);
      try {
        if (!node?.available) throw new PluginMarketError("NODE_UNAVAILABLE");
        const request = new ctx.remote.Request(node);
        const capabilities = await request.request("plugin/capabilities", undefined, 10000);
        if (capabilities?.restarting) throw new PluginMarketError("NODE_UNAVAILABLE");
        return { request, capabilities };
      } catch (error) {
        if (!node || Date.now() >= deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  return {
    installedPlugins,
    listNodes,
    requestedNodes,
    nodeInventories,
    targetInstallations,
    daemonRuntimeInfo
  };
}
