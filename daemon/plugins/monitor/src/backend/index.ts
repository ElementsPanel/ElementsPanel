import type { DaemonPluginContext } from "../../../../src/service/plugins";
import { SystemUsageHistory } from "./visual_data";

// Daemon side of the data monitoring page. It samples this host's CPU and
// memory usage and contributes the history to `info/overview` as `cpuMemChart`,
// which the panel draws per node. Without this plugin the daemon still reports
// its current usage in `system`; only the history line is missing.

const history = new SystemUsageHistory();

export function setup(context: DaemonPluginContext) {
  history.start();
  context.registerOverviewProvider(() => ({ cpuMemChart: history.getArray() }));
}

export function dispose() {
  history.stop();
}
