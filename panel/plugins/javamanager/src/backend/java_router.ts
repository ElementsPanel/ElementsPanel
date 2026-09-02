import type { PanelPluginContext } from "../../../../src/app/plugin";

/** Registers the panel HTTP API that forwards Java Manager requests. */
export function registerJavaManagerRoutes(ctx: PanelPluginContext) {
  const router = ctx.koa.router("/api/java_manager");
  const validator = ctx.middleware.validator;
  const permission = ctx.middleware.permission;
  const speedLimit = ctx.middleware.speedLimit;
  const requireUser = permission({ level: ctx.roles.USER });
  const requireAdmin = permission({ level: ctx.roles.ADMIN });

  router.use(async (requestCtx, next) => {
    const daemonId = String(requestCtx.query.daemonId ?? "");
    const instanceId = String(requestCtx.query.instanceId ?? "");
    if (!ctx.identity.canAccessInstance(requestCtx, daemonId, instanceId)) {
      throw new Error(ctx.i18n.$t("TXT_CODE_eb401a37"));
    }
    await next();
  });

  router.get(
    "/list",
    requireUser,
    validator({ query: { daemonId: String, instanceId: String } }),
    async (requestCtx) => {
      const daemon = ctx.remote.services.getInstance(String(requestCtx.query.daemonId));
      requestCtx.body = await new ctx.remote.Request(daemon).request("java_manager/list");
    }
  );

  router.post(
    "/add",
    speedLimit(3),
    requireAdmin,
    validator({ query: { daemonId: String }, body: { name: String, path: String } }),
    async (requestCtx) => {
      const daemon = ctx.remote.services.getInstance(String(requestCtx.query.daemonId));
      requestCtx.body = await new ctx.remote.Request(daemon).request("java_manager/add", {
        name: requestCtx.request.body.name,
        path: requestCtx.request.body.path
      });
    }
  );

  router.post(
    "/download",
    speedLimit(3),
    requireAdmin,
    validator({
      query: { daemonId: String, instanceId: String },
      body: { name: String, version: String }
    }),
    async (requestCtx) => {
      const daemon = ctx.remote.services.getInstance(String(requestCtx.query.daemonId));
      requestCtx.body = await new ctx.remote.Request(daemon).request("java_manager/download", {
        name: requestCtx.request.body.name,
        version: requestCtx.request.body.version
      });
    }
  );

  router.post(
    "/using",
    requireUser,
    validator({
      query: { daemonId: String, instanceId: String },
      body: { id: String }
    }),
    async (requestCtx) => {
      const daemon = ctx.remote.services.getInstance(String(requestCtx.query.daemonId));
      requestCtx.body = await new ctx.remote.Request(daemon).request("java_manager/using", {
        instanceId: requestCtx.query.instanceId,
        id: requestCtx.request.body.id
      });
    }
  );

  router.delete(
    "/delete",
    requireAdmin,
    validator({ query: { daemonId: String }, body: { id: String } }),
    async (requestCtx) => {
      const daemon = ctx.remote.services.getInstance(String(requestCtx.query.daemonId));
      requestCtx.body = await new ctx.remote.Request(daemon).request("java_manager/delete", {
        id: requestCtx.request.body.id
      });
    }
  );
}
