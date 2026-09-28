import type { DaemonPluginContext } from "../../../../src/plugin";
import { registerTerminalEvents } from "./stream_router";

export const inject = ["i18n", "protocol", "instances", "transfer"];

export function apply(ctx: DaemonPluginContext) {
  registerTerminalEvents(ctx);
}
