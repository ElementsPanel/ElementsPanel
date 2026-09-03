import Router from "@koa/router";
import type { PanelPluginContext } from "../../../../src/app/plugin";
import { createEnvironmentRouter } from "./routers/environment_router";
import { createInstanceAdminRouter } from "./routers/instance_admin_router";
import { createInstanceOperateRouter } from "./routers/instance_operate_router";
import { createModManagerRouter } from "./routers/mod_manager_router";
import { createScheduleRouter } from "./routers/schedule_router";
import { getInstancesByUuid } from "./service/instance_service";
import { setPluginContext, middleware, remote, roles } from "./runtime";

export const inject = [
  "koa",
  "remote",
  "middleware",
  "roles",
  "identity",
  "operations"
];

export function apply(ctx: PanelPluginContext) {
  setPluginContext(ctx);
  // The instance lookup is also consumed by the user plugin's account API.
  ctx.set("instances", { getByUuid: getInstancesByUuid });

  const api = ctx.koa.router("/api");
  const operateRouter = createInstanceOperateRouter();
  const adminRouter = createInstanceAdminRouter();
  const environmentRouter = createEnvironmentRouter();
  const scheduleRouter = createScheduleRouter();
  const modRouter = createModManagerRouter();
  api.use(operateRouter.routes()).use(operateRouter.allowedMethods());
  api.use(adminRouter.routes()).use(adminRouter.allowedMethods());
  api.use(environmentRouter.routes()).use(environmentRouter.allowedMethods());
  api.use(scheduleRouter.routes()).use(scheduleRouter.allowedMethods());
  api.use(modRouter.routes()).use(modRouter.allowedMethods());

  // Instance selection is part of instance management, while daemon CRUD is
  // owned by the node plugin.
  const instanceSelection = new Router({ prefix: "/service" });
  instanceSelection.get(
    "/remote_service_instances",
    middleware().permission({ level: roles().ADMIN }),
    middleware().validator({ query: { daemonId: String, page: Number, page_size: Number } }),
    async (requestCtx) => {
      const daemonId = String(requestCtx.query.daemonId);
      const page = Math.max(1, Number(requestCtx.query.page) || 1);
      const pageSize = Math.min(50, Math.max(1, Number(requestCtx.query.page_size) || 10));
      const instanceName = requestCtx.query.instance_name;
      const status = requestCtx.query.status;
      const tag = String(requestCtx.query.tag);
      const remoteService = remote().services.getInstance(daemonId);
      let tagList: string[] = [];
      try {
        tagList = JSON.parse(tag);
      } catch {
        // Ignore malformed optional tag filters.
      }
      requestCtx.body = await new (remote().Request)(remoteService).request("instance/select", {
        page,
        pageSize,
        condition: {
          instanceName,
          status,
          tag: tagList.length > 0 ? tagList : null
        }
      });
    }
  );
  api.use(instanceSelection.routes());
  api.use(instanceSelection.allowedMethods());
}
