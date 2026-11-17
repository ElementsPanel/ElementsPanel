import type Koa from "koa";
import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import { getDesktopLayout, setDesktopLayout } from "./desktop-layout-service";
import { registerDesktopSettings } from "./settings";
import { localeMessages } from "../i18n";

export const inject = ["koa", "middleware", "roles", "i18n", "storage"];

export async function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);
  const getSettings = await registerDesktopSettings(ctx);
  const router = ctx.koa.router("/api/overview");
  const requireUser = ctx.middleware.permission({ level: ctx.roles.USER });
  const logger = ctx.logger;

  router.get("/desktop_settings", (requestCtx: Koa.ParameterizedContext) => {
    requestCtx.body = getSettings();
  });

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
