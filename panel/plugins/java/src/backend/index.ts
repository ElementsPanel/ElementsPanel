import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";
import { registerJavaManagerRoutes } from "./java_router";

// Panel-side HTTP forwarding for the Java Manager. The frontend half is loaded
// independently, but both halves share this plugin's manifest and translations.
export const inject = ["koa", "i18n", "remote", "middleware", "roles", "identity"];

export function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);
  registerJavaManagerRoutes(ctx);
}
