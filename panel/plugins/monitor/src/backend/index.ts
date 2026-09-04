import { systemInfo } from "mcsmanager-common";
import os from "os";
import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";
import { OperationLogger } from "./service/operation_logger";
import { OverviewService } from "./service/overview";
import { VisualDataHistory } from "./service/visual_data";

// Panel side of the data monitoring page. It owns the two rolling histories the
// page charts, the overview endpoint and the panel-wide operation log listing.
// The endpoint's base payload and its plugin-provided `chart` field stay
// together, so unloading monitor removes the monitoring contract as a whole.

export const inject = ["i18n", "koa", "middleware", "roles", "identity", "globals"];

export function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);
  ctx.plugin(OverviewService);
  const operations = new OperationLogger();
  ctx.set("operations", operations);
  ctx.on("dispose", () => operations.dispose());

  const history = new VisualDataHistory(ctx);

  // Counted here rather than in the core response middleware: the request rate
  // only exists to be charted. Runs for every request regardless of where in
  // the middleware chain the plugin was mounted.
  ctx.koa.use(async (requestCtx, next) => {
    if (requestCtx.url.startsWith("/api/")) history.addRequestCount();
    await next();
  });

  ctx.inject(["overview"], (overviewCtx) => {
    overviewCtx.overview.provide(() => ({ chart: history.toChart() }));
  });

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

  overviewRouter.get("/instance_operation_logs", requireUser, async (requestCtx) => {
    const instanceId = String(requestCtx.query?.instanceId ?? "");
    const daemonId = String(requestCtx.query?.daemonId ?? "");
    const limit = Number(requestCtx.query?.limit ?? 50);
    if (!instanceId || !daemonId) return requestCtx.throw(400, "instanceId and daemonId are required.");
    if (!Number.isFinite(limit) || limit <= 0 || limit > 200) {
      return requestCtx.throw(400, "Invalid limit value. It must be a number between 1 and 200.");
    }
    requestCtx.body = await operations.getByInstance(instanceId, daemonId, limit);
  });

  overviewRouter.post("/instance_crash", requireUser, async (requestCtx) => {
    const body = requestCtx.request.body || {};
    const instanceId = String(body.instanceId ?? "");
    const daemonId = String(body.daemonId ?? "");
    if (!instanceId || !daemonId) return requestCtx.throw(400, "instanceId and daemonId are required.");
    operations.error("instance_crash", {
      daemon_id: daemonId,
      instance_id: instanceId,
      instance_name: String(body.instanceName || instanceId),
      exit_code: Number(body.exitCode ?? -1),
      operator_ip: requestCtx.ip,
      operator_name: ctx.identity.of(requestCtx).userName
    });
    requestCtx.body = { ok: true };
  });

  overviewRouter.post("/instance_auto_restart", requireUser, async (requestCtx) => {
    const body = requestCtx.request.body || {};
    const instanceId = String(body.instanceId ?? "");
    const daemonId = String(body.daemonId ?? "");
    if (!instanceId || !daemonId) return requestCtx.throw(400, "instanceId and daemonId are required.");
    operations.log("instance_auto_restart", {
      daemon_id: daemonId,
      instance_id: instanceId,
      instance_name: String(body.instanceName || instanceId),
      operator_ip: requestCtx.ip,
      operator_name: ""
    });
    requestCtx.body = { ok: true };
  });

  // The panel-wide operation log the monitoring page lists.
  const router = ctx.koa.router("/api/monitor");
  router.get(
    "/operation_logs",
    ctx.middleware.permission({ level: ctx.roles.ADMIN }),
    async (requestCtx) => {
      const limit = Number(requestCtx.query?.limit ?? 20);
      if (!Number.isFinite(limit) || limit <= 0 || limit > 200) {
        return requestCtx.throw(400, "Invalid limit value. It must be a number between 1 and 200.");
      }
      requestCtx.body = await operations.get(limit);
    }
  );
}
