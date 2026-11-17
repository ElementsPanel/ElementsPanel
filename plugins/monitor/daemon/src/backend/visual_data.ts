import { systemInfo } from "mcsmanager-common";
import type { DaemonPluginContext } from "../../../../../core/daemon/src/plugin";

const SAMPLE_INTERVAL_MS = 1000 * 3;
const HISTORY_SIZE = 200;

export interface SystemSample {
  cpu: number;
  mem: number;
}

export class SystemUsageHistory {
  private readonly samples: SystemSample[] = new Array(HISTORY_SIZE).fill({ cpu: 0, mem: 0 });

  constructor(ctx: DaemonPluginContext) {
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
