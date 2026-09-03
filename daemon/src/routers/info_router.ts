import * as protocol from "../service/protocol";
import { routerApp } from "../service/router";

import { systemInfo } from "mcsmanager-common";
import { globalConfiguration } from "../entity/config";
import { ctx as daemon } from "../plugin/context";
import { getVersion } from "../service/version";

// Writing this configuration back ("info/setting") belongs to the daemon-side
// node plugin, see daemon/plugins/node.

// Get the basic information of the daemon system
routerApp.on("info/overview", async (ctx) => {
  const daemonVersion = getVersion();
  const info = {
    version: daemonVersion,
    brand: "ElementsPanel",
    process: {
      cpu: process.cpuUsage().system,
      memory: process.memoryUsage().heapUsed,
      cwd: process.cwd()
    },
    system: systemInfo(),
    config: {
      language: globalConfiguration.config.language,
      uploadSpeedRate: globalConfiguration.config.uploadSpeedRate,
      downloadSpeedRate: globalConfiguration.config.downloadSpeedRate,
      maxDownloadFromUrlFileCount: globalConfiguration.config.maxDownloadFromUrlFileCount,
      portRangeStart: globalConfiguration.config.allocatablePortRange[0],
      portRangeEnd: globalConfiguration.config.allocatablePortRange[1],
      portAssignInterval: globalConfiguration.config.portAssignInterval,
      port: globalConfiguration.config.port,
      outputBufferSize: globalConfiguration.config.outputBufferSize,
      enableSoftShutdown: globalConfiguration.config.enableSoftShutdown,
      softShutdownSkipDocker: globalConfiguration.config.softShutdownSkipDocker,
      softShutdownWaitSeconds: globalConfiguration.config.softShutdownWaitSeconds,
      instanceBackupPath: globalConfiguration.config.instanceBackupPath,
      instanceBackupFormat: globalConfiguration.config.instanceBackupFormat,
      instanceBackupCompressionLevel: globalConfiguration.config.instanceBackupCompressionLevel
    },
    features: daemon.features.all(),
  };
  // Plugin-contributed fields, e.g. the monitoring plugin's cpuMemChart.
  protocol.response(ctx, { ...info, ...(await daemon.overview.collect()) });
});
