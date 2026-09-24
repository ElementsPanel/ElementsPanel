import { systemInfo } from "mcsmanager-common";
import os from "os";
import type { PanelPluginContext } from "../../../../src/app/plugin";

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
        return remoteInfo;
      }
    );
    const selfInfo = systemInfo();
    const overviewData = {
      version: ctx.globals.get("version", "Unknown"),
      specifiedDaemonVersion: ctx.globals.get("specifiedDaemonVersion", "1.0.0"),
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
