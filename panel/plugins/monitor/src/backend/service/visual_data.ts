import { systemInfo } from "mcsmanager-common";
import type { PanelPluginContext } from "../../../../../src/app/plugins";

const SAMPLE_INTERVAL_MS = 1000 * 10;
const HISTORY_SIZE = 60;

export interface SystemSample {
  cpu: number;
  mem: number;
}

export interface RequestSample {
  value: number;
  totalInstance: number;
  runningInstance: number;
}

/**
 * The two rolling histories the monitoring page charts: the panel host's CPU and
 * memory usage, and how many API requests arrived per sampling window alongside
 * the instance counts at that moment.
 *
 * Both used to be a panel core singleton. They exist only to be drawn, so they
 * belong to this plugin — a panel without it collects nothing.
 */
export class VisualDataHistory {
  private readonly systemSamples: SystemSample[] = new Array(HISTORY_SIZE).fill({ cpu: 0, mem: 0 });
  private readonly requestSamples: RequestSample[] = new Array(HISTORY_SIZE).fill({
    value: 0,
    totalInstance: 0,
    runningInstance: 0
  });

  private requestCount = 0;
  private systemTimer?: NodeJS.Timeout;
  private requestTimer?: NodeJS.Timeout;

  constructor(private readonly context: PanelPluginContext) {}

  /** Called by this plugin's middleware for every `/api/` request. */
  addRequestCount() {
    this.requestCount++;
  }

  private sampleSystem() {
    const info = systemInfo();
    this.systemSamples.shift();
    this.systemSamples.push(
      info
        ? {
            cpu: Number((info.cpuUsage * 100).toFixed(1)),
            mem: Number((info.memUsage * 100).toFixed(1))
          }
        : { cpu: 0, mem: 0 }
    );
  }

  private async sampleRequests() {
    // The instance counts come from the nodes themselves, so one sample means
    // one round of daemon requests. An unreachable node simply contributes zero.
    let totalInstance = 0;
    let runningInstance = 0;
    const RemoteRequest = this.context.services.remoteRequest;
    for (const [, remoteService] of this.context.services.remote.services.entries()) {
      try {
        const info = await new RemoteRequest(remoteService).request("info/overview");
        if (!info?.instance) continue;
        totalInstance += info.instance.total;
        runningInstance += info.instance.running;
      } catch (error) {
        // ignore unreachable nodes
      }
    }
    this.requestSamples.shift();
    this.requestSamples.push({ value: this.requestCount, totalInstance, runningInstance });
    this.requestCount = 0;
  }

  start() {
    if (this.systemTimer) return;
    this.systemTimer = setInterval(() => this.sampleSystem(), SAMPLE_INTERVAL_MS);
    this.requestTimer = setInterval(() => void this.sampleRequests(), SAMPLE_INTERVAL_MS);
  }

  stop() {
    if (this.systemTimer) clearInterval(this.systemTimer);
    if (this.requestTimer) clearInterval(this.requestTimer);
    this.systemTimer = undefined;
    this.requestTimer = undefined;
  }

  toChart() {
    return { system: this.systemSamples, request: this.requestSamples };
  }
}
