import type { DaemonPluginContext } from "../../../../src/plugin";
import { SystemUsageHistory } from "./visual_data";

// Daemon side of the data monitoring page. It samples this host's CPU and
// memory usage and contributes the history to `info/overview` as `cpuMemChart`,
// which the panel draws per node. Without this plugin the daemon still reports
// its current usage in `system`; only the history line is missing.

export const inject = ["overview"];

export function apply(ctx: DaemonPluginContext) {
  const history = new SystemUsageHistory(ctx);
  ctx.overview.provide(() => ({ cpuMemChart: history.getArray() }));
}
