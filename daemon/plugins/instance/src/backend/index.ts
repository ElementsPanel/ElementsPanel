import type { DaemonPluginContext } from "../../../../src/plugin";
import { setPluginContext } from "./runtime";

export const inject = [
  "settings",
  "storage",
  "files",
  "transfer",
  "protocol",
  "tasks",
  "instanceLifecycle",
  "presets",
  "schedules",
  "features",
  "overview"
];

export async function apply(ctx: DaemonPluginContext) {
  setPluginContext(ctx);

  // The modules are required only after the context has been set. A number of
  // migrated modules resolve shared capabilities through the local runtime
  // facades while their singletons are being constructed. Keeping these as
  // synchronous requires also keeps webpack's output self-contained: no
  // runtime chunks need to be copied alongside the plugin entry.
  const { default: InstanceSubsystem } = require("./service/system_instance") as typeof import("./service/system_instance");
  const { default: Instance } = require("./entity/instance/instance") as typeof import("./entity/instance/instance");
  const { default: Config } = require("./entity/instance/Instance_config") as typeof import("./entity/instance/Instance_config");
  const { default: InstanceCommand } = require("./entity/commands/base/command") as typeof import("./entity/commands/base/command");
  const { InstanceUpdateAction } = require("./service/instance_update_action") as typeof import("./service/instance_update_action");
  const { commandStringToArray } = require("./entity/commands/base/command_parser") as typeof import("./entity/commands/base/command_parser");
  const { default: FunctionDispatcher } = require("./entity/commands/dispatcher") as typeof import("./entity/commands/dispatcher");
  const { DockerManager } = require("./service/docker_service") as typeof import("./service/docker_service");

  ctx.set("instances", {
    subsystem: InstanceSubsystem,
    Instance,
    Config,
    Command: InstanceCommand,
    UpdateAction: InstanceUpdateAction,
    fileManager: (instanceUuid: string) => ctx.files.getFileManager(instanceUuid),
    headers: (url?: string) => {
      const headers: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Connection: "keep-alive"
      };
      if (url) {
        try {
          headers.Referer = new URL(url).origin;
        } catch {}
      }
      return headers;
    },
    commandStringToArray
  });

  // The dispatcher is the instance plugin's built-in preset/lifecycle bridge.
  // Loading the module above also ensures every command class is available
  // before persisted instances are restored.
  void FunctionDispatcher;

  require("./routers/Instance_router");
  const { registerInstanceEvents } = require("./routers/instance_event_router") as typeof import("./routers/instance_event_router");
  require("./routers/schedule_router");
  require("./routers/environment_router");
  const disposeInstanceEvents = registerInstanceEvents();
  const { default: InstanceControlSubsystem } = require("./service/system_instance_control") as typeof import("./service/system_instance_control");

  try {
    InstanceSubsystem.loadInstances();
    ctx.logger.info(`Loaded ${InstanceSubsystem.getInstances().length} application instances.`);
  } catch (error) {
    ctx.logger.error("Failed to load application instances:", error);
    throw error;
  }

  ctx.features.add("instances");
  ctx.overview.provide(async () => {
    let running = 0;
    const instances = InstanceSubsystem.getInstances();
    for (const instance of instances) {
      if (instance.status() === Instance.STATUS_RUNNING) running++;
    }
    let dockerPlatforms: string[] | undefined;
    try {
      dockerPlatforms = await new DockerManager().getSupportedPlatforms();
    } catch (error) {
      ctx.logger.debug("Failed to get Docker platforms:", error);
    }
    return {
      instance: { running, total: instances.length },
      dockerPlatforms
    };
  });

  ctx.on("dispose", async () => {
    disposeInstanceEvents();
    InstanceControlSubsystem.dispose();
    try {
      const config = ctx.settings.config;
      if (config.enableSoftShutdown) {
        await InstanceSubsystem.softExit(
          Boolean(config.softShutdownSkipDocker),
          Number(config.softShutdownWaitSeconds) || 10
        );
      } else {
        await InstanceSubsystem.exit(true);
      }
    } catch (error) {
      ctx.logger.error("Failed to stop application instances:", error);
    }
  });
}
