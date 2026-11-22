import { systemInfo } from "mcsmanager-common";
import type { PanelPluginContext } from "../../../../../../../core/panel/src/app/plugin";

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

export class VisualDataHistory {
  private readonly systemSamples: SystemSample[] = new Array(HISTORY_SIZE).fill({ cpu: 0, mem: 0 });
  private readonly requestSamples: RequestSample[] = new Array(HISTORY_SIZE).fill({
    value: 0,
    totalInstance: 0,
    runningInstance: 0
  });

  private requestCount = 0;

  constructor(private readonly ctx: PanelPluginContext) {
    ctx.setInterval(() => this.sampleSystem(), SAMPLE_INTERVAL_MS);
    ctx.setInterval(() => void this.sampleRequests(), SAMPLE_INTERVAL_MS);
  }

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
    // Sample instance counts from each node; unreachable nodes contribute zero.
    let totalInstance = 0;
    let runningInstance = 0;
    const remote = this.ctx.get("remote");
    if (!remote) {
      this.requestSamples.shift();
      this.requestSamples.push({ value: this.requestCount, totalInstance, runningInstance });
      this.requestCount = 0;
      return;
    }
    const RemoteRequest = remote.Request;
    for (const [, remoteService] of remote.services.services.entries()) {
      try {
        const info = await new RemoteRequest(remoteService).request("info/overview");
        if (!info?.instance) continue;
        totalInstance += info.instance.total;
        runningInstance += info.instance.running;
      } catch (error) {
        // Skip unavailable nodes in this sample.
      }
    }
    this.requestSamples.shift();
    this.requestSamples.push({ value: this.requestCount, totalInstance, runningInstance });
    this.requestCount = 0;
  }

  toChart() {
    return { system: this.systemSamples, request: this.requestSamples };
  }
}
