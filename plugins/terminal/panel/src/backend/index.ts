import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import { registerTerminalRoutes } from "./terminal_router";
import { setPluginContext } from "./runtime";
import { registerTerminalSettings } from "./settings";
import { localeMessages } from "../i18n";

export const inject = ["koa", "middleware", "remote", "roles", "i18n", "storage"];

export async function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);
  setPluginContext(ctx);
  registerTerminalRoutes(await registerTerminalSettings(ctx));
}
