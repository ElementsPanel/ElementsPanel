import Router from "@koa/router";
import type Koa from "koa";
import type { PanelPluginContext } from "../../../../src/app/plugins";
import { getDesktopLayout, setDesktopLayout } from "./desktop-layout-service";

export function setup(context: PanelPluginContext) {
  const router = new Router({ prefix: "/api/overview" });
  const requireUser = context.middleware.permission({ level: context.roles.USER });

  router.get("/desktop_layout", requireUser, async (ctx: Koa.ParameterizedContext) => {
    const userUuid = ctx.session?.uuid;
    if (!userUuid) {
      ctx.status = 403;
      ctx.body = "User not logged in";
      return;
    }
    ctx.body = getDesktopLayout(userUuid, context.logger) || { windows: [], updatedAt: 0 };
  });

  router.post("/desktop_layout", requireUser, async (ctx: Koa.ParameterizedContext) => {
    const userUuid = ctx.session?.uuid;
    if (!userUuid) {
      ctx.status = 403;
      ctx.body = "User not logged in";
      return;
    }
    setDesktopLayout(userUuid, ctx.request.body, context.logger);
    ctx.body = true;
  });

  context.registerRouter(router);
}
