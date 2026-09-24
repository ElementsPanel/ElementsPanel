import type { PanelPluginContext } from "../../../../../src/app/plugin";

/** Instance audit endpoints consume the runtime logger without requiring a viewer. */
export function registerOperationLogRoutes(ctx: PanelPluginContext) {
  const overviewRouter = ctx.koa.router("/api/overview");
  const requireUser = ctx.middleware.permission({ level: ctx.roles.USER, token: false });

  overviewRouter.get("/instance_operation_logs", requireUser, async (requestCtx) => {
    const instanceId = String(requestCtx.query?.instanceId ?? "");
    const daemonId = String(requestCtx.query?.daemonId ?? "");
    const limit = Number(requestCtx.query?.limit ?? 50);
    if (!instanceId || !daemonId)
      return requestCtx.throw(400, "instanceId and daemonId are required.");
    if (!Number.isInteger(limit) || limit <= 0 || limit > 200) {
      return requestCtx.throw(400, "Invalid limit value. It must be a number between 1 and 200.");
    }
    if (!ctx.identity.canAccessInstance(requestCtx, daemonId, instanceId)) requestCtx.throw(403);
    requestCtx.body = await ctx.operations.getByInstance(instanceId, daemonId, limit);
  });

  overviewRouter.post("/instance_crash", requireUser, async (requestCtx) => {
    const body = requestCtx.request.body || {};
    const instanceId = String(body.instanceId ?? "");
    const daemonId = String(body.daemonId ?? "");
    if (!instanceId || !daemonId)
      return requestCtx.throw(400, "instanceId and daemonId are required.");
    if (!ctx.identity.canAccessInstance(requestCtx, daemonId, instanceId)) requestCtx.throw(403);
    ctx.operations.error("instance_crash", {
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
    if (!instanceId || !daemonId)
      return requestCtx.throw(400, "instanceId and daemonId are required.");
    if (!ctx.identity.canAccessInstance(requestCtx, daemonId, instanceId)) requestCtx.throw(403);
    ctx.operations.log("instance_auto_restart", {
      daemon_id: daemonId,
      instance_id: instanceId,
      instance_name: String(body.instanceName || instanceId),
      operator_ip: requestCtx.ip,
      operator_name: ""
    });
    requestCtx.body = { ok: true };
  });
}
