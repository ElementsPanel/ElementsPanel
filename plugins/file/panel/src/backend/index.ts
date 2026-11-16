import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import { registerFileRoutes } from "./file_router";
import { setPluginContext } from "./runtime";

// Forward file-manager requests to the daemon that owns the instance.

export const inject = [
  "koa",
  "i18n",
  "middleware",
  "roles",
  "remote",
  "identity",
  "operations"
];

export function apply(ctx: PanelPluginContext) {
  setPluginContext(ctx);
  // File-manager access errors use translations shared with the permission middleware.
  registerFileRoutes();
}
