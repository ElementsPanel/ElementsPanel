import Router from "@koa/router";
import type { PanelPluginContext } from "../../../../src/app/plugins";

export function setup(context: PanelPluginContext) {
  const router = new Router({ prefix: "/api/protected_instance" });
  const validator = context.middleware.validator;
  const requireUser = context.middleware.permission({ level: context.roles.USER });
  const RemoteRequest = context.services.remoteRequest;
  const remoteServices = context.services.remote;

  router.use(context.middleware.instanceAccess);

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

  context.registerRouter(router);
}
