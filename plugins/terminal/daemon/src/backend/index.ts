import type { DaemonPluginContext } from "../../../../../core/daemon/src/plugin";
import { registerTerminalEvents } from "./stream_router";
import { registerSettings } from "./settings";
import { localeMessages } from "../i18n";

export const inject = ["i18n", "protocol", "instances", "transfer", "settings"];

export function apply(ctx: DaemonPluginContext) {
  ctx.i18n.define(localeMessages);
  registerSettings(ctx);
  registerTerminalEvents(ctx);
}
