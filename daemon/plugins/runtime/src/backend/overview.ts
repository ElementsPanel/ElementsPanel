import { systemInfo } from "mcsmanager-common";
import type { DaemonPluginContext } from "../../../../src/plugin";

/** Base node identity, configuration and capabilities do not require monitoring. */
export function registerOverview(ctx: DaemonPluginContext) {
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
        softShutdownWaitSeconds: config.softShutdownWaitSeconds
      },
      features: ctx.features.all()
    };
    ctx.protocol.response(routerCtx, { ...info, ...(await ctx.overview.collect()) });
  });
}
