import type { DaemonPluginContext } from "../../../../src/plugin";
import { LifecycleService, PresetsService, SchedulesService, TasksService } from "./registries";
import { setPluginContext } from "./runtime";
import { routerApp } from "./service/router";

export const inject = {
  i18n: { required: true },
  settings: { required: true },
  storage: { required: true },
  files: { required: true },
  transfer: { required: true },
  protocol: { required: true },
  features: { required: true },
  overview: { required: true },
  // Java support is installed by a later, optional plugin. Instance startup
  // resolves it only when a Java runtime is actually needed.
  javaManager: { required: false }
};

export function apply(ctx: DaemonPluginContext) {
  ctx.plugin(TasksService);
  ctx.plugin(LifecycleService);
  ctx.plugin(PresetsService);
  ctx.plugin(SchedulesService);
  setPluginContext(ctx);

  // The registry services above are created as child plugins, so their values
  // are available on the next turn rather than synchronously in this function.
  // Restoring instances before that point makes the legacy dispatcher read
  // missing `presets` and `instanceLifecycle` services and emit warnings.
  ctx.inject(["tasks", "instanceLifecycle", "presets", "schedules"], (instanceCtx) => {
    // The modules are required only after the context has been set and the
    // instance registries are ready. Keeping these synchronous requires keeps
    // webpack's output self-contained and avoids a second copy of the context.
    const { default: InstanceSubsystem } = require("./service/system_instance") as typeof import("./service/system_instance");
    const { default: Instance } = require("./entity/instance/instance") as typeof import("./entity/instance/instance");
    const { default: Config } = require("./entity/instance/Instance_config") as typeof import("./entity/instance/Instance_config");
    const { default: InstanceCommand } = require("./entity/commands/base/command") as typeof import("./entity/commands/base/command");
    const { InstanceUpdateAction } = require("./service/instance_update_action") as typeof import("./service/instance_update_action");
    const { commandStringToArray } = require("./entity/commands/base/command_parser") as typeof import("./entity/commands/base/command_parser");
    const { default: FunctionDispatcher } = require("./entity/commands/dispatcher") as typeof import("./entity/commands/dispatcher");
    const { DockerManager } = require("./service/docker_service") as typeof import("./service/docker_service");

    instanceCtx.set("instances", {
      subsystem: InstanceSubsystem,
      Instance,
      Config,
      Command: InstanceCommand,
      UpdateAction: InstanceUpdateAction,
      fileManager: (instanceUuid: string) => instanceCtx.files.getFileManager(instanceUuid),
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
    void FunctionDispatcher;

    require("./routers/Instance_router");
    const { registerInstanceEvents } = require("./routers/instance_event_router") as typeof import("./routers/instance_event_router");
    require("./routers/schedule_router");
    require("./routers/environment_router");
    const disposeInstanceEvents = registerInstanceEvents();
    const { default: InstanceControlSubsystem } = require("./service/system_instance_control") as typeof import("./service/system_instance_control");

    instanceCtx.on("dispose", () => routerApp.dispose());

    try {
      InstanceSubsystem.loadInstances();
      instanceCtx.logger.info(`Loaded ${InstanceSubsystem.getInstances().length} application instances.`);
    } catch (error) {
      instanceCtx.logger.error("Failed to load application instances:", error);
      throw error;
    }

    instanceCtx.features.add("instances");
    instanceCtx.overview.provide(async () => {
      let running = 0;
      const instances = InstanceSubsystem.getInstances();
      for (const instance of instances) {
        if (instance.status() === Instance.STATUS_RUNNING) running++;
      }
      let dockerPlatforms: string[] | undefined;
      try {
        dockerPlatforms = await new DockerManager().getSupportedPlatforms();
      } catch (error) {
        instanceCtx.logger.debug("Failed to get Docker platforms:", error);
      }
      return {
        instance: { running, total: instances.length },
        dockerPlatforms
      };
    });

    instanceCtx.on("dispose", async () => {
      disposeInstanceEvents();
      InstanceControlSubsystem.dispose();
      try {
        const config = instanceCtx.settings.config;
        if (config.enableSoftShutdown) {
          await InstanceSubsystem.softExit(
            Boolean(config.softShutdownSkipDocker),
            Number(config.softShutdownWaitSeconds) || 10
          );
        } else {
          await InstanceSubsystem.exit(true);
        }
      } catch (error) {
        instanceCtx.logger.error("Failed to stop application instances:", error);
      }
    });
  });
}
