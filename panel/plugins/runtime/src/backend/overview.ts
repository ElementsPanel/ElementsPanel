import { systemInfo } from "mcsmanager-common";
import os from "os";
import type { PanelPluginContext } from "../../../../src/app/plugin";

/** Same major.minor rule the node page uses: patch differences stay compatible. */
function hasDaemonVersionUpdate(panelVersion: string, daemonVersion?: string) {
  if (!daemonVersion) return true;
  const [panelMajor, panelMinor] = panelVersion.split(".");
  const [daemonMajor, daemonMinor] = daemonVersion.split(".");
  return panelMajor !== daemonMajor || panelMinor !== daemonMinor;
}

/**
 * Compares one daemon's plugin inventory against the panel's. Plugins present on
 * both sides must carry the same version; plugins on a single side only are
 * informational unless the present half declares `dual` — then the absent other
 * half is a fault ("missing panel/daemon side").
 */
function buildCompatibility(
  panelVersion: string,
  requiredDaemonVersion: string,
  panelPlugins: Map<string, { version: string; dual: boolean }>,
  node: {
    version?: string;
    brand?: string;
    available?: boolean;
    plugins?: { id?: unknown; version?: unknown; dual?: unknown }[];
  }
) {
  const brandMismatch = node.brand !== "ElementsPanel";
  const version = {
    ok:
      node.available === true &&
      !brandMismatch &&
      !hasDaemonVersionUpdate(requiredDaemonVersion, node.version),
    panelVersion,
    requiredDaemonVersion,
    daemonVersion: node.version,
    brandMismatch
  };
  const items: {
    id: string;
    panelVersion?: string;
    daemonVersion?: string;
    status: "ok" | "mismatch" | "panel_only" | "daemon_only" | "missing_panel" | "missing_daemon";
  }[] = [];
  let pluginsOk = true;
  const daemonIds = new Set<string>();
  for (const plugin of Array.isArray(node.plugins) ? node.plugins : []) {
    const id = typeof plugin?.id === "string" ? plugin.id : "";
    if (!id || daemonIds.has(id)) continue;
    daemonIds.add(id);
    const daemonVersion = typeof plugin.version === "string" ? plugin.version : undefined;
    const own = panelPlugins.get(id);
    if (own === undefined) {
      if (plugin.dual === true) {
        pluginsOk = false;
        items.push({ id, daemonVersion, status: "missing_panel" });
      } else {
        items.push({ id, daemonVersion, status: "daemon_only" });
      }
    } else if (own.version !== (daemonVersion ?? "")) {
      pluginsOk = false;
      items.push({ id, panelVersion: own.version, daemonVersion, status: "mismatch" });
    } else {
      items.push({ id, panelVersion: own.version, daemonVersion, status: "ok" });
    }
  }
  for (const [id, own] of panelPlugins) {
    if (daemonIds.has(id)) continue;
    if (own.dual) {
      pluginsOk = false;
      items.push({ id, panelVersion: own.version, status: "missing_daemon" });
    } else {
      items.push({ id, panelVersion: own.version, status: "panel_only" });
    }
  }
  return {
    ok: version.ok && pluginsOk,
    version,
    plugins: { ok: pluginsOk, items }
  };
}

/** Base node and host information remains available without monitoring. */
export function registerOverview(ctx: PanelPluginContext) {
  const getOverview = () => {
    const overview = ctx.get("overview");
    if (!overview) throw new Error("Panel overview service is unavailable.");
    return overview;
  };

  const overviewRouter = ctx.koa.router("/api/overview");
  const requireUser = ctx.middleware.permission({ level: ctx.roles.USER, token: false });

  overviewRouter.get("/", requireUser, async (requestCtx) => {
    const remote = ctx.get("remote");
    const panelVersion = ctx.globals.get("version", "Unknown");
    const requiredDaemonVersion = ctx.globals.get("specifiedDaemonVersion", "1.0.0");
    const panelPlugins = new Map(
      (ctx.get("plugins")?.inventory() ?? []).map((plugin) => [
        plugin.id,
        { version: String(plugin.version ?? ""), dual: Boolean(plugin.dual) }
      ])
    );
    const requestTasks = Array.from(remote?.services.services.entries() ?? []).map(
      async ([, remoteService]) => {
        let remoteInfo: any = {};
        try {
          remoteInfo = await new remote!.Request(remoteService).request("info/overview");
        } catch {
          // An unavailable node remains visible with its local connection data.
        }
        remoteInfo.uuid = remoteService.uuid;
        remoteInfo.ip = remoteService.config.ip;
        remoteInfo.port = remoteService.config.port;
        remoteInfo.prefix = remoteService.config.prefix;
        remoteInfo.available = remoteService.available;
        remoteInfo.remarks = remoteService.config.remarks;
        remoteInfo.brand = remoteService.config.brand;
        remoteInfo.remoteMappings = remoteService.config.remoteMappings;
        remoteInfo.compatibility = buildCompatibility(
          panelVersion,
          requiredDaemonVersion,
          panelPlugins,
          remoteInfo
        );
        return remoteInfo;
      }
    );
    const selfInfo = systemInfo();
    const overviewData = {
      version: ctx.globals.get("version", "Unknown"),
      specifiedDaemonVersion: requiredDaemonVersion,
      process: { cpu: selfInfo.processCpu, memory: process.memoryUsage().rss, cwd: selfInfo.cwd },
      record: ctx.identity.stats,
      system: {
        user: os.userInfo(),
        time: Date.now(),
        totalmem: selfInfo.totalmem,
        freemem: selfInfo.freemem,
        type: selfInfo.type,
        version: os.version(),
        node: process.version,
        hostname: selfInfo.hostname,
        loadavg: selfInfo.loadavg,
        platform: selfInfo.platform,
        release: selfInfo.release,
        uptime: os.uptime(),
        cpu: selfInfo.cpuUsage
      },
      remoteCount: remote?.services.count() ?? { available: 0, total: 0 },
      remote: await Promise.all(requestTasks)
    };
    requestCtx.body = { ...overviewData, ...(await getOverview().collect()) };
  });
}
