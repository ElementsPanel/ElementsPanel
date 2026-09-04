import type { DaemonPluginContext } from "../../../../src/plugin";
import { Logger } from "cordis";
import { systemInfo } from "mcsmanager-common";
import { FeaturesService, OverviewService } from "./registries";
import { SystemUsageHistory } from "./visual_data";

// Daemon side of the data monitoring page. It samples this host's CPU and
// memory usage and contributes the history to `info/overview` as `cpuMemChart`,
// which the panel draws per node. The `info/overview` event is owned here too,
// so removing monitor removes the daemon's monitoring contract as a whole.

export const inject = ["i18n", "protocol", "settings"];

export function apply(ctx: DaemonPluginContext) {
  ctx.plugin(FeaturesService);
  ctx.plugin(OverviewService);
  const history = new SystemUsageHistory(ctx);
  ctx.inject(["features", "overview"], (monitorCtx) => {
    monitorCtx.overview.provide(() => ({ cpuMemChart: history.getArray() }));

    // The overview payload is a monitoring contract, not a transport concern.
    // Keeping the route here means disabling monitor removes both its history
    // sampler and the corresponding daemon overview endpoint.
    ctx.protocol.on("info/overview", async (routerCtx) => {
      const config = ctx.settings.config;
      const info = {
        version: ctx.settings.version,
        brand: "ElementsPanel",
        process: {
          cpu: process.cpuUsage().system,
          memory: process.memoryUsage().heapUsed,
          cwd: process.cwd()
        },
        system: systemInfo(),
        config: {
          language: config.language,
          uploadSpeedRate: config.uploadSpeedRate,
          downloadSpeedRate: config.downloadSpeedRate,
          maxDownloadFromUrlFileCount: config.maxDownloadFromUrlFileCount,
          portRangeStart: config.allocatablePortRange[0],
          portRangeEnd: config.allocatablePortRange[1],
          portAssignInterval: config.portAssignInterval,
          port: config.port,
          outputBufferSize: config.outputBufferSize,
          enableSoftShutdown: config.enableSoftShutdown,
          softShutdownSkipDocker: config.softShutdownSkipDocker,
          softShutdownWaitSeconds: config.softShutdownWaitSeconds,
          instanceBackupPath: config.instanceBackupPath,
          instanceBackupFormat: config.instanceBackupFormat,
          instanceBackupCompressionLevel: config.instanceBackupCompressionLevel
        },
        features: monitorCtx.features.all()
      };
      ctx.protocol.response(routerCtx, { ...info, ...(await monitorCtx.overview.collect()) });
    });
  });

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
