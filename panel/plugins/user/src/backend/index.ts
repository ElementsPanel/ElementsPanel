import Router from "@koa/router";
import type { PanelPluginContext } from "../../../../src/app/plugins";
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

export async function setup(context: PanelPluginContext) {
  setPluginContext(context);

  // Before anything that logs or throws: this plugin's strings live here, not
  // in the panel catalogue.
  context.registerLocaleMessages(localeMessages);

  await initAuthSettings();
  await userSystem.initialize();

  // From here on the whole panel is guarded. Removing this plugin removes the
  // policy with it, which is the documented behaviour.
  context.registerRequestGuard(createRequestGuard());

  // Nested under a single /api router, in the same order the core used to mount
  // them: several of these share the "/auth/" path and only differ by method,
  // so a flat registration would let one router's allowedMethods() answer 405
  // before the next router got a chance to match.
  const apiRouter = new Router({ prefix: "/api" });
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
  context.registerRouter(apiRouter);
}
