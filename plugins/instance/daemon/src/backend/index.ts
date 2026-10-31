import { initSteamCmd } from "./tools/steam_cmd";
import { migrateConfig } from "./service/version_adapter";
import type { DaemonPluginContext } from "../../../../../core/daemon/src/plugin";
import { LifecycleService, PresetsService, SchedulesService, TasksService } from "./registries";
import { setPluginContext } from "./runtime";
import { routerApp } from "./service/router";
import { localeMessages } from "../i18n";
import { createInstanceInstallTaskClass } from "./install_task";
import * as minecraftInstall from "./minecraft_task";
import { registerSettings } from "./settings";
import { registerJavaManager } from "./java";
import { registerMinecraftStatus } from "./mcstats";

export const inject = {
  i18n: { required: true },
  settings: { required: true },
  storage: { required: true },
  files: { required: true },
  transfer: { required: true },
  protocol: { required: true },
  features: { required: true },
  overview: { required: true }
};

export function apply(ctx: DaemonPluginContext) {
  ctx.i18n.define(localeMessages);
  registerSettings(ctx);
  ctx.plugin(TasksService);
  ctx.plugin(LifecycleService);
  ctx.plugin(PresetsService);
  ctx.plugin(SchedulesService);
  const runtime = setPluginContext(ctx);
  let preserving = false;
  let subsystem: typeof import("./service/system_instance").default | undefined;
  let disposeSchedules: (() => void) | undefined;
  ctx.on("plugins/reloading", async () => {
    const inventory = ctx.get("plugins")?.inventory();
    preserving = inventory?.some((plugin) => plugin.id === "instance" && plugin.enabled) ?? true;
    if (preserving) {
      disposeSchedules?.();
      await subsystem?.suspendForReload();
    }
  });
  migrateConfig(ctx);
  void initSteamCmd(ctx);

  // The registry services above are created as child plugins, so their values
  // are available on the next turn rather than synchronously in this function.
  // Restoring instances before that point makes the legacy dispatcher read
  // missing `presets` and `instanceLifecycle` services and emit warnings.
  ctx.inject(["tasks", "instanceLifecycle", "presets", "schedules"], async (instanceCtx) => {
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
    const { default: InstanceControlSubsystem } = require("./service/system_instance_control") as typeof import("./service/system_instance_control");

    subsystem = InstanceSubsystem;
    disposeSchedules = () => InstanceControlSubsystem.dispose();
    const previous = runtime.handover;
    let recovering = Boolean(previous);
    let disposeInstanceEvents: (() => void | Promise<void>) | undefined;
    let shuttingDown: Promise<void> | undefined;
    const config = instanceCtx.settings.config;
    const shutdown = () =>
      (shuttingDown ??= (async () => {
        for (const instance of InstanceSubsystem.instances.values()) instance.beginShutdown();
        try {
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
      })());
    const retain = () => {
      runtime.handover = {
        instances: [...InstanceSubsystem.instances.values()],
        shutdown,
        release: () => InstanceSubsystem.releaseAfterReload()
      };
    };
    // Own the processes before any asynchronous initialization. A failed Java
    // manager or replacement must leave them available for another attempt.
    if (previous) {
      InstanceControlSubsystem.dispose();
      InstanceSubsystem.adoptInstances(previous.instances);
      retain();
      previous.release();
    }
    instanceCtx.on("dispose", async () => {
      await disposeInstanceEvents?.();
      InstanceControlSubsystem.dispose();
      routerApp.dispose();
      if ((preserving || recovering) && !runtime.stopping && ctx.root.scope.isActive) {
        await InstanceSubsystem.suspendForReload();
        retain();
      } else {
        await shutdown();
      }
      InstanceSubsystem.detachListeners();
    });

    const services = {
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
    };
    const instanceServices = {
      ...services,
      InstallTask: createInstanceInstallTaskClass(instanceCtx, services)
    };
    instanceCtx.set("instances", instanceServices);
    // Restored instances must see their Java runtimes and status presets from
    // their first lifecycle dispatch, including automatic startup and takeover.
    if (!(await registerJavaManager(instanceCtx, instanceServices))) return;
    registerMinecraftStatus(instanceCtx, instanceServices);
    instanceCtx.plugin(minecraftInstall);

    // The dispatcher is the instance plugin's built-in preset/lifecycle bridge.
    void FunctionDispatcher;

    require("./routers/Instance_router");
    const { registerInstanceEvents } = require("./routers/instance_event_router") as typeof import("./routers/instance_event_router");
    require("./routers/schedule_router");
    require("./routers/environment_router");
    disposeInstanceEvents = registerInstanceEvents();

    try {
      if (!previous) InstanceSubsystem.loadInstances();
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

    if (previous) {
      let resuming: Promise<void> | undefined;
      const resume = () =>
        (resuming ??= (async () => {
          if (runtime.stopping || !instanceCtx.scope.isActive || !ctx.root.scope.isActive) return;
          await InstanceSubsystem.resumeAfterReload();
          if (runtime.stopping || !instanceCtx.scope.isActive || !ctx.root.scope.isActive) return;
          InstanceControlSubsystem.loadSchedules();
          recovering = false;
          runtime.handover = undefined;
        })());
      // Rebuild commands after other plugins have registered their presets and
      // lifecycle tasks, and before the replacement server starts listening.
      instanceCtx.on("plugins/reloaded", resume);
      // Also allow recovery by enabling/retrying only the instance plugin.
      instanceCtx.on("ready", resume);
    }
  });
}
