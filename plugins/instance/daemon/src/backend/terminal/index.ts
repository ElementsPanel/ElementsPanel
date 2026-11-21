import type { DaemonPluginContext } from "../../../../../../core/daemon/src/plugin";
import { registerTerminalEvents } from "./stream_router";
import { registerSettings } from "./settings";

export function apply(ctx: DaemonPluginContext, instances = ctx.instances) {
  registerSettings(ctx);
  registerTerminalEvents(ctx, instances);
}
