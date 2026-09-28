import type Koa from "koa";
import type { PanelPluginContext } from "../../../../src/app/plugin";
import { getDesktopLayout, setDesktopLayout } from "./desktop-layout-service";

// Panel side of Desktop mode: it persists one window layout per user.

export const inject = ["koa", "middleware", "roles"];

export function apply(ctx: PanelPluginContext) {
  const router = ctx.koa.router("/api/overview");
  const requireUser = ctx.middleware.permission({ level: ctx.roles.USER });
  const logger = ctx.logger;

  router.get("/desktop_layout", requireUser, async (ctx: Koa.ParameterizedContext) => {
    const userUuid = ctx.session?.uuid;
    if (!userUuid) {
      ctx.status = 403;
      ctx.body = "User not logged in";
      return;
    }
    ctx.body = getDesktopLayout(userUuid, logger) || { windows: [], updatedAt: 0 };
  });

  router.post("/desktop_layout", requireUser, async (ctx: Koa.ParameterizedContext) => {
    const userUuid = ctx.session?.uuid;
    if (!userUuid) {
      ctx.status = 403;
      ctx.body = "User not logged in";
      return;
    }
    setDesktopLayout(userUuid, ctx.request.body, logger);
    ctx.body = true;
  });
}
