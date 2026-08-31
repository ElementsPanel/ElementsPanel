import type { PanelPluginContext } from "../../../../src/app/plugin";

// Panel side of instance backup: the browser talks to the panel, the panel
// forwards to the node that owns the instance. See `daemon/plugins/backup`.

export const inject = ["koa", "middleware", "roles", "remote"];

export function apply(ctx: PanelPluginContext) {
  const router = ctx.koa.router("/api/protected_instance");
  const validator = ctx.middleware.validator;
  const requireUser = ctx.middleware.permission({ level: ctx.roles.USER });
  const RemoteRequest = ctx.remote.Request;
  const remoteServices = ctx.remote.services;

  router.use(ctx.middleware.instanceAccess);

  router.get(
    "/backup",
    requireUser,
    validator({ query: { daemonId: String, uuid: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const remoteService = remoteServices.getInstance(daemonId);
        ctx.body = await new RemoteRequest(remoteService).request("instance/backup/list", {
          instanceUuid
        });
      } catch (error) {
        ctx.body = error;
      }
    }
  );

  router.delete(
    "/backup",
    requireUser,
    validator({ query: { daemonId: String, uuid: String, backupName: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const backupName = String(ctx.query.backupName);
        const remoteService = remoteServices.getInstance(daemonId);
        ctx.body = await new RemoteRequest(remoteService).request("instance/backup/delete", {
          instanceUuid,
          backupName
        });
      } catch (error) {
        ctx.body = error;
      }
    }
  );

  router.post(
    "/backup/restore",
    requireUser,
    validator({ query: { daemonId: String, uuid: String, backupName: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const backupName = String(ctx.query.backupName);
        const remoteService = remoteServices.getInstance(daemonId);
        ctx.body = await new RemoteRequest(remoteService).request("instance/backup/restore", {
          instanceUuid,
          backupName
        });
      } catch (error) {
        ctx.body = error;
      }
    }
  );
}
