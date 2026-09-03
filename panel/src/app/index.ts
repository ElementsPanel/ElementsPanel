import Router from "@koa/router";
import Koa from "koa";

import "./service/user_statistics";

import overviewRouter from "./routers/overview_router";
import panelStatusRouter from "./routers/panel_status_router";
import settingsRouter from "./routers/settings_router";

// Login, account management and SSO are mounted by the "user" panel plugin, and
// the file manager by the "file" one.
export function mountRouters(app: Koa<Koa.DefaultState, Koa.DefaultContext>) {
  const apiRouter = new Router({ prefix: "/api" });
  apiRouter.use(overviewRouter.routes()).use(overviewRouter.allowedMethods());
  apiRouter.use(panelStatusRouter.routes()).use(panelStatusRouter.allowedMethods());
  apiRouter.use(settingsRouter.routes()).use(settingsRouter.allowedMethods());

  app.use(apiRouter.routes()).use(apiRouter.allowedMethods());
}
