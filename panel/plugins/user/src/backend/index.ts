import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";
import { createRequestGuard } from "./guard";
import createAuthSettingsRouter from "./routers/auth_settings_router";
import createGeneralUserRouter from "./routers/general_user_router";
import createLoginRouter from "./routers/login_router";
import createManageUserRouter from "./routers/manage_user_router";
import createSsoRouter from "./routers/sso_router";
import createUserOverviewRouter from "./routers/user_overview_router";
import { setPluginContext } from "./runtime";
import { initAuthSettings } from "./service/auth_settings";
import userSystem from "./service/user_service";

// Authentication for the whole panel: accounts, sessions, SSO and the
// authorization policy every core route is checked against. The core holds none
// of it — it asks `ctx.guard`, and serves every request while nothing provides
// one.

export const inject = [
  "koa",
  "i18n",
  "storage",
  "settings",
  "middleware",
  "roles",
  "instances",
  "operations",
  "globals"
];

export async function apply(ctx: PanelPluginContext) {
  setPluginContext(ctx);

  // Before anything that logs or throws: this plugin's strings live here, not
  // in the panel catalogue.
  ctx.i18n.define(localeMessages);

  await initAuthSettings();
  await userSystem.initialize();

  // From here on the whole panel is guarded. Unloading this plugin removes the
  // service, and with it the policy, which is the documented behaviour.
  ctx.set("guard", createRequestGuard());

  // Nested under a single /api router, in the same order the core used to mount
  // them: several of these share the "/auth/" path and only differ by method,
  // so a flat registration would let one router's allowedMethods() answer 405
  // before the next router got a chance to match.
  const apiRouter = ctx.koa.router("/api");
  for (const router of [
    createManageUserRouter(),
    createLoginRouter(),
    createGeneralUserRouter(),
    createUserOverviewRouter(),
    createAuthSettingsRouter(),
    createSsoRouter()
  ]) {
    apiRouter.use(router.routes()).use(router.allowedMethods());
  }
}
