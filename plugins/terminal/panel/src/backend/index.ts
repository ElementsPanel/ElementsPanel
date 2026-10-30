import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import { registerTerminalRoutes } from "./terminal_router";
import { setPluginContext } from "./runtime";

export const inject = ["koa", "middleware", "remote", "roles", "i18n"];

export function apply(ctx: PanelPluginContext) {
  setPluginContext(ctx);
  registerTerminalRoutes();
}
