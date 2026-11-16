import Instance from "../instance/instance";
import { ctx as daemon } from "../../plugin/context";
import InstanceCommand from "./base/command";
import DockerResizeCommand from "./docker/docker_pty_resize";
import DockerStartCommand from "./docker/docker_start";
import GeneralSendCommand from "./general/general_command";
import GeneralKillCommand from "./general/general_kill";
import GeneralRestartCommand from "./general/general_restart";
import GeneralStartCommand from "./general/general_start";
import GeneralStopCommand from "./general/general_stop";
import GeneralUpdateCommand from "./general/general_update";
import PtyResizeCommand from "./pty/pty_resize";
import PtyStartCommand from "./pty/pty_start";
import RconCommand from "./steam/rcon_command";
import InstanceDiskCheckTask from "./task/any_stats";
import DockerStatsTask from "./task/docker_stats";
import TimeCheck from "./task/time";

export type IPresetCommand =
  | "start"
  | "stop"
  | "restart"
  | "kill"
  | "update"
  | "refreshPlayers"
  | "command"
  | "resize"
  | "install";

export default class FunctionDispatcher extends InstanceCommand {
  constructor() {
    super("FunctionDispatcher");
  }

  async exec(instance: Instance) {
    instance.lifeCycleTaskManager.clearLifeCycleTask();
    instance.clearPreset();

    instance.lifeCycleTaskManager.registerLifeCycleTask(new TimeCheck());

    instance.setPreset("command", new GeneralSendCommand());
    instance.setPreset("stop", new GeneralStopCommand());
    instance.setPreset("kill", new GeneralKillCommand());
    instance.setPreset("restart", new GeneralRestartCommand());
    instance.setPreset("update", new GeneralUpdateCommand());
    instance.lifeCycleTaskManager.registerLifeCycleTask(new InstanceDiskCheckTask());

    if (!instance.config.processType || instance.config.processType === "general") {
      instance.setPreset("start", new GeneralStartCommand());
    }

    if (instance.config.terminalOption.pty && instance.config.processType === "general") {
      instance.setPreset("start", new PtyStartCommand());
      instance.setPreset("resize", new PtyResizeCommand());
    }
    if (instance.config.processType === "docker") {
      instance.setPreset("start", new DockerStartCommand());
      instance.setPreset("resize", new DockerResizeCommand());
      instance.lifeCycleTaskManager.registerLifeCycleTask(new DockerStatsTask());
    }
    if (instance.config.enableRcon) {
      instance.setPreset("command", new RconCommand());
    }

    // Plugin-contributed lifecycle tasks, such as Minecraft status polling.
    for (const createTask of daemon.instanceLifecycle.entries()) {
      const task = createTask(instance);
      if (task) instance.lifeCycleTaskManager.registerLifeCycleTask(task);
    }

    // Apply plugin presets after defaults so plugins can add or override commands.
    for (const [preset, createCommand] of daemon.presets.entries()) {
      instance.setPreset(preset, createCommand());
    }
  }
}
