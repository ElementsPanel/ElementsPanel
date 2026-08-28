import Instance from "../entity/instance/instance";
import * as protocol from "../service/protocol";
import { routerApp } from "../service/router";
import InstanceSubsystem from "../service/system_instance";

import { systemInfo } from "mcsmanager-common";
import { globalConfiguration } from "../entity/config";
import { DockerManager } from "../service/docker_service";
import logger from "../service/log";
import VisualDataSubsystem from "../service/system_visual_data";
import { getVersion } from "../service/version";

// Writing this configuration back ("info/setting") belongs to the daemon-side
// node plugin, see daemon/plugins/node.

// Get the basic information of the daemon system
routerApp.on("info/overview", async (ctx) => {
  const daemonVersion = getVersion();
  let total = 0;
  let running = 0;
  InstanceSubsystem.getInstances().forEach((v) => {
    total++;
    if (v.status() == Instance.STATUS_RUNNING) running++;
  });

  let dockerPlatforms: string[] | undefined;
  try {
    const dockerManager = new DockerManager();
    dockerPlatforms = await dockerManager.getSupportedPlatforms();
  } catch (error: any) {
    logger.debug("Failed to get Docker platforms:", error);
  }

  const info = {
    version: daemonVersion,
    brand: "ElementsPanel",
    process: {
      cpu: process.cpuUsage().system,
      memory: process.memoryUsage().heapUsed,
      cwd: process.cwd()
    },
    instance: {
      running,
      total
    },
    system: systemInfo(),
    cpuMemChart: VisualDataSubsystem.getSystemChartArray(),
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
    features: {
      instanceBackup: true
    },
    dockerPlatforms
  };
  protocol.response(ctx, info);
});
