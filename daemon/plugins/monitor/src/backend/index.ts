import type { DaemonPluginContext } from "../../../../src/plugin";
import { Logger } from "cordis";
import { systemInfo } from "mcsmanager-common";
import { SystemUsageHistory } from "./visual_data";

// Optional CPU/memory histories augment the runtime overview.

export const inject = ["i18n", "overview"];

export function apply(ctx: DaemonPluginContext) {
  const history = new SystemUsageHistory(ctx);
  ctx.overview.provide(() => ({ cpuMemChart: history.getArray() }));

  // The host report is monitoring output, not logger infrastructure. Keeping
  // its timer in this plugin means disabling monitor also stops the report.
  const systemLogger = new Logger("sysinfo");
  ctx.setInterval(() => {
    const info = systemInfo();
    const MB_SIZE = 1024 * 1024;
    const toInt = (value: number) => parseInt(String(value));
    const self = process.memoryUsage();
    const summary =
      `MEM: ${toInt((info.totalmem - info.freemem) / MB_SIZE)}MB/${toInt(info.totalmem / MB_SIZE)}MB` +
      ` CPU: ${toInt(info.cpuUsage * 100)}%`;
    const selfInfo = `Heap: ${toInt(self.heapUsed / MB_SIZE)}MB/${toInt(self.heapTotal / MB_SIZE)}MB`;
    const rss = `RSS: ${toInt(self.rss / MB_SIZE)}MB`;
    systemLogger.info(`[${ctx.i18n.$t("TXT_CODE_app.sysinfo")}] ${summary} ${selfInfo} ${rss}`);
  }, 1000 * 5);
}
