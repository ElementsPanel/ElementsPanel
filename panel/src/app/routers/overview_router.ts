import Router from "@koa/router";
import { GlobalVariable, systemInfo } from "mcsmanager-common";
import os from "os";
import { ROLE } from "../entity/user";
import permission from "../middleware/permission";
import { getRequestGuard as guard } from "../service/request_guard";
import { operationLogger } from "../service/operation_logger";
import RemoteRequest from "../service/remote_command";
import RemoteServiceSubsystem from "../service/remote_service";
import VisualDataSubsystem from "../service/visual_data";
import { getVersion, specifiedDaemonVersion } from "../version";

const router = new Router({ prefix: "/overview" });

// [Top-level Permission]
// Control panel home page information overview routing
router.get("/", permission({ level: ROLE.USER, token: false }), async (ctx) => {
  // Get the information of the remote service concurrently
  const requestTasks = Array.from(RemoteServiceSubsystem.services.entries()).map(
    async ([_, remoteService]) => {
      let remoteInfo: any = {};
      try {
        remoteInfo = await new RemoteRequest(remoteService).request("info/overview");
      } catch (err) {
        // ignore request errors and continue looping
      }
      // assign some identifier value
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

  const remoteInfoList = await Promise.all(requestTasks);
  const selfInfo = systemInfo();
  // Get the information of the system where the panel is located
  const overviewData: IPanelOverviewResponse = {
    version: getVersion(),
    specifiedDaemonVersion: specifiedDaemonVersion(),
    process: {
      cpu: selfInfo.processCpu,
      memory: process.memoryUsage().rss,
      cwd: selfInfo.cwd
    },
    record: guard().stats(),
    system: {
      user: os.userInfo(),
      time: new Date().getTime(),
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
    chart: {
      system: VisualDataSubsystem.getSystemChartArray(),
      request: VisualDataSubsystem.getStatusChartArray()
    },
    remoteCount: RemoteServiceSubsystem.count(),
    remote: remoteInfoList
  };

  ctx.body = overviewData;
});

// [Top-level Permission]
// Get user operation logs
router.get("/operation_logs", permission({ level: ROLE.ADMIN }), async (ctx) => {
  const limit = +(ctx?.query?.limit || 20);

  if (isNaN(limit)) return ctx.throw(400, "Invalid limit value. It must be a number.");

  if (limit <= 0 || limit > 200)
    return ctx.throw(400, "Invalid limit value. It must be between 1 and 200.");

  ctx.body = await operationLogger.get(limit);
});

// [Top-level Permission]
// Get operation logs for a specific instance
router.get("/instance_operation_logs", permission({ level: ROLE.USER, token: false }), async (ctx) => {
  const instanceId = ctx?.query?.instanceId as string;
  const daemonId = ctx?.query?.daemonId as string;
  const limit = +(ctx?.query?.limit || 50);

  if (!instanceId || !daemonId)
    return ctx.throw(400, "instanceId and daemonId are required.");

  if (isNaN(limit) || limit <= 0 || limit > 200)
    return ctx.throw(400, "Invalid limit value. It must be a number between 1 and 200.");

  ctx.body = await operationLogger.getByInstance(instanceId, daemonId, limit);
});

// [Top-level Permission]
// Log an instance crash / unexpected exit
router.post("/instance_crash", permission({ level: ROLE.USER, token: false }), async (ctx) => {
  const body = ctx.request.body || {};
  const instanceId = body?.instanceId as string;
  const daemonId = body?.daemonId as string;
  const instanceName = body?.instanceName as string;
  const exitCode = +(body?.exitCode ?? -1);

  if (!instanceId || !daemonId)
    return ctx.throw(400, "instanceId and daemonId are required.");

  operationLogger.error("instance_crash", {
    daemon_id: daemonId,
    instance_id: instanceId,
    instance_name: instanceName || instanceId,
    exit_code: exitCode,
    operator_ip: ctx.ip,
    operator_name: guard().identify(ctx).userName
  });

  ctx.body = { ok: true };
});

// [Top-level Permission]
// Log an instance auto-restart (triggered by daemon after crash)
router.post("/instance_auto_restart", permission({ level: ROLE.USER, token: false }), async (ctx) => {
  const body = ctx.request.body || {};
  const instanceId = body?.instanceId as string;
  const daemonId = body?.daemonId as string;
  const instanceName = body?.instanceName as string;

  if (!instanceId || !daemonId)
    return ctx.throw(400, "instanceId and daemonId are required.");

  operationLogger.log("instance_auto_restart", {
    daemon_id: daemonId,
    instance_id: instanceId,
    instance_name: instanceName || instanceId,
    operator_ip: ctx.ip,
    operator_name: ""
  });

  ctx.body = { ok: true };
});

export default router;
