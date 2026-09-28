import { systemInfo } from "mcsmanager-common";
import type { DaemonPluginContext } from "../../../../src/plugin";

const SAMPLE_INTERVAL_MS = 1000 * 3;
const HISTORY_SIZE = 200;

export interface SystemSample {
  cpu: number;
  mem: number;
}

/**
 * A rolling history of this daemon's CPU and memory usage. The panel charts it
 * per node, so the daemon keeps only enough samples to draw one line.
 */
export class SystemUsageHistory {
  private readonly samples: SystemSample[] = new Array(HISTORY_SIZE).fill({ cpu: 0, mem: 0 });

  constructor(ctx: DaemonPluginContext) {
    // cordis owns the timer: it is an effect of this plugin’s scope, so it stops
    // when the plugin unloads and there is nothing to tear down by hand.
    ctx.setInterval(() => this.sample(), SAMPLE_INTERVAL_MS);
  }

  private sample() {
    const info = systemInfo();
    this.samples.shift();
    this.samples.push(
      info
        ? {
            cpu: Number((info.cpuUsage * 100).toFixed(0)),
            mem: Number((info.memUsage * 100).toFixed(0))
          }
        : { cpu: 0, mem: 0 }
    );
  }

  getArray(): readonly SystemSample[] {
    return this.samples;
  }
}
