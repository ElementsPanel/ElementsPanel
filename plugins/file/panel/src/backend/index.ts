import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import { registerFileRoutes } from "./file_router";
import { setPluginContext } from "./runtime";

export const inject = ["koa", "i18n", "middleware", "roles", "remote", "identity", "operations"];

export function apply(ctx: PanelPluginContext) {
  setPluginContext(ctx);
  registerFileRoutes();
}
