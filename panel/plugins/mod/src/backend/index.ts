import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";
import { ModManagerService } from "./mod_manager";
import { registerModManagerRoutes } from "./router";

export const inject = ["koa", "i18n", "remote", "middleware", "roles", "identity"];

export function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);
  const manager = new ModManagerService(ctx);
  registerModManagerRoutes(ctx, manager);
}
