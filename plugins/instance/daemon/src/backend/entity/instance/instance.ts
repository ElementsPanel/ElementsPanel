import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import iconv from "iconv-lite";
import { configureEntityParams } from "mcsmanager-common";
import path from "path";
import { CircularBuffer } from "../../common/string_cache";
import StorageSubsystem from "../../common/system_storage";
import { STEAM_CMD_PATH } from "../../const";
import { $t } from "../../i18n";
import { javaManagerSubsystem } from "../../service/java_access";
import logger from "../../service/log";
import { instanceSetting } from "../../instance_settings";
import InstanceCommand from "../commands/base/command";
import { commandStringToArray } from "../commands/base/command_parser";
import FunctionDispatcher, { IPresetCommand } from "../commands/dispatcher";
import { OpenFrp } from "../commands/task/openfrp";
import { globalConfiguration } from "../config";
import InstanceConfig from "./Instance_config";
import { IInstanceProcess } from "./interface";
import { LifeCycleTaskManager } from "./life_cycle";
import { IExecutable, PresetCommandManager } from "./preset";

interface IInstanceInfo {
  mcPingOnline: boolean;
  currentPlayers: number;
  maxPlayers: number;
  version: string;
  fileLock: number;
  playersChart: { value: string }[];
  openFrpStatus: boolean;
  latency: number;
  cpuUsage?: number;
  memoryUsagePercent?: number;
  rxBytes?: number;
  txBytes?: number;
  rxRate?: number;
  txRate?: number;
  networkInterfaces?: string[];
  networkStatsSource?: "docker";
  readBytes?: number;
  writeBytes?: number;
  memoryUsage?: number;
  memoryLimit?: number;
  storageUsage?: number;
  storageLimit?: number;
  allocatedPorts?: { host: number; container: number; protocol: string }[];
}

interface IWatcherInfo {
  terminalSize: {
    w: number;
    h: number;
  };
}

const TERM_TEXT_YELLOW = "\x1B[0;33;1m";
const TERM_TEXT_GOLD = "\x1B[0;33m";
const TERM_RESET = "\x1B[0m";
function getIgnoreText() {
  return [
    "\n\n",
    TERM_TEXT_GOLD,
    "[MCSMANAGER] ",
    TERM_RESET,
    TERM_TEXT_YELLOW,
    $t("TXT_CODE_COMMON_THE_INSTANTANEOUS_OUTPUT_CONTENT_IS_TOO_LONG_AND_HAS_BEEN_REJECTED"),
    TERM_RESET,
    "\n\n"
  ].join("");
}

export default class Instance extends EventEmitter {
  public static readonly STATUS_BUSY = -1;
  public static readonly STATUS_STOP = 0;
  public static readonly STATUS_STOPPING = 1;
  public static readonly STATUS_STARTING = 2;
  public static readonly STATUS_RUNNING = 3;

  public static readonly TYPE_UNIVERSAL = "universal";
  public static readonly TYPE_MINECRAFT_JAVA = "minecraft/java";
  public static readonly TYPE_MINECRAFT_BEDROCK = "minecraft/bedrock";

  public instanceStatus: number = Instance.STATUS_STOP;
  public instanceUuid: string = "";
  public lock: boolean = false;
  public startCount: number = 0;
  public autoRestartCount: number = 0;
  public startTimestamp: number = 0;
  public asynchronousTask?: IExecutable | null;
  public openFrp?: OpenFrp;

  public readonly lifeCycleTaskManager = new LifeCycleTaskManager(this);
  public readonly presetCommandManager = new PresetCommandManager(this);

  public config: InstanceConfig;

  public info: IInstanceInfo = {
    mcPingOnline: false,
    currentPlayers: 0,
    maxPlayers: 0,
    version: "",
    fileLock: 0,
    playersChart: [],
    openFrpStatus: false,
    latency: 0,
    allocatedPorts: []
  };

  public watchers: Map<string, IWatcherInfo> = new Map();

  public process?: IInstanceProcess;
  public starting?: Promise<void>;

  private outputLoopTask?: NodeJS.Timeout;
  private outputBuffer: CircularBuffer<string>;
  private stopping?: Promise<void>;
  private resourceCleanup?: Promise<void>;
  private dispatcher?: InstanceCommand;
  private reloading = false;
  private restartPending = false;
  private shuttingDown = false;
  private restartResetTask?: NodeJS.Timeout;
  private stopTimeoutTask?: NodeJS.Timeout;

  private userRequestedStop = false;

  constructor(instanceUuid: string, config: InstanceConfig) {
    super();

    if (!instanceUuid || !config) throw new Error($t("TXT_CODE_INSTANCE_CONF_INIT_INSTANCE_ERR"));

    this.instanceStatus = Instance.STATUS_STOP;
    this.instanceUuid = instanceUuid;

    this.lock = false;

    this.config = config;

    this.outputBuffer = new CircularBuffer<string>(
      globalConfiguration.config.outputBufferSize || 256
    );

    this.process = undefined;
    this.startCount = 0;
  }

  isStoppedOrBusy() {
    return [Instance.STATUS_STOP, Instance.STATUS_BUSY].includes(this.status());
  }

  parameters(cfg: any, persistence = true) {
    if (cfg?.type && cfg?.type != this.config.type) {
      if (!this.isStoppedOrBusy())
        throw new Error($t("TXT_CODE_INSTANCE_CONF_CANT_MODIFY_INSTANCE_TYPE"));
      configureEntityParams(this.config, cfg, "type", String);
      this.forceExec(this.dispatcher ?? new FunctionDispatcher());
    }

    if (cfg?.enableRcon != null && cfg?.enableRcon !== this.config.enableRcon) {
      if (!this.isStoppedOrBusy()) throw new Error($t("TXT_CODE_COMMON_RCON_PROTOCOL_CANNOT_BE_ENABLED_OR_DISABLED_WHILE_RUNNING"));
      configureEntityParams(this.config, cfg, "enableRcon", Boolean);
      this.forceExec(this.dispatcher ?? new FunctionDispatcher());
    }

    if (cfg?.processType && cfg?.processType !== this.config.processType) {
      if (!this.isStoppedOrBusy())
        throw new Error($t("TXT_CODE_INSTANCE_CONF_CANT_MODIFY_PROCESS_TYPE"));
      configureEntityParams(this.config, cfg, "processType", String);
      this.forceExec(this.dispatcher ?? new FunctionDispatcher());
    }

    if (
      cfg?.terminalOption?.pty != null &&
      cfg?.terminalOption?.pty !== this.config.terminalOption.pty
    ) {
      if (!this.isStoppedOrBusy()) throw new Error($t("TXT_CODE_INSTANCE_CONF_CANT_MODIFY_PTY_MODEL"));
      configureEntityParams(this.config.terminalOption, cfg.terminalOption, "pty", Boolean);
      this.forceExec(this.dispatcher ?? new FunctionDispatcher());
    }

    // Only allow some configuration items to be modified when the server is stopped
    if (this.isStoppedOrBusy() && cfg.terminalOption) {
      configureEntityParams(this.config.terminalOption, cfg.terminalOption, "ptyWindowCol", Number);
      configureEntityParams(this.config.terminalOption, cfg.terminalOption, "ptyWindowRow", Number);
    }

    if (cfg.tag instanceof Array) {
      cfg.tag = cfg.tag.map((tag: any) => String(tag).trim());
      this.config.tag = cfg.tag;
    }

    if (cfg?.extraServiceConfig) {
      configureEntityParams(
        this.config.extraServiceConfig,
        cfg.extraServiceConfig,
        "isOpenFrp",
        Boolean
      );
      configureEntityParams(
        this.config.extraServiceConfig,
        cfg.extraServiceConfig,
        "openFrpToken",
        String
      );
      configureEntityParams(
        this.config.extraServiceConfig,
        cfg.extraServiceConfig,
        "openFrpTunnelId",
        String
      );
    }

    configureEntityParams(this.config, cfg, "nickname", String);
    configureEntityParams(this.config, cfg, "startCommand", String);
    configureEntityParams(this.config, cfg, "stopCommand", String);
    configureEntityParams(this.config, cfg, "updateCommand", String);
    configureEntityParams(this.config, cfg, "runAs", String);
    configureEntityParams(this.config, cfg, "cwd", String);
    configureEntityParams(this.config, cfg, "ie", String);
    configureEntityParams(this.config, cfg, "oe", String);
    configureEntityParams(this.config, cfg, "crlf", Number);
    configureEntityParams(this.config, cfg, "endTime", Number);
    configureEntityParams(this.config, cfg, "fileCode", String);
    configureEntityParams(this.config, cfg, "rconPassword", String);
    configureEntityParams(this.config, cfg, "rconPort", Number);
    configureEntityParams(this.config, cfg, "rconIp", String);
    configureEntityParams(this.config, cfg, "category", Number);
    configureEntityParams(this.config, cfg, "basePort", Number);

    if (cfg.docker) {
      configureEntityParams(this.config.docker, cfg.docker, "updateCommandImage", String);
      configureEntityParams(this.config.docker, cfg.docker, "containerName", String);
      configureEntityParams(this.config.docker, cfg.docker, "image", String);
      configureEntityParams(this.config.docker, cfg.docker, "memory", Number);
      configureEntityParams(this.config.docker, cfg.docker, "ports");
      configureEntityParams(this.config.docker, cfg.docker, "extraVolumes");
      configureEntityParams(this.config.docker, cfg.docker, "maxSpace", Number);
      configureEntityParams(this.config.docker, cfg.docker, "io", Number);
      configureEntityParams(this.config.docker, cfg.docker, "network", Number);
      configureEntityParams(this.config.docker, cfg.docker, "networkMode", String);
      configureEntityParams(this.config.docker, cfg.docker, "networkAliases");
      configureEntityParams(this.config.docker, cfg.docker, "cpusetCpus", String);
      configureEntityParams(this.config.docker, cfg.docker, "cpuUsage", Number);
      configureEntityParams(this.config.docker, cfg.docker, "env");
      configureEntityParams(this.config.docker, cfg.docker, "labels");
      configureEntityParams(this.config.docker, cfg.docker, "workingDir", String);
      configureEntityParams(this.config.docker, cfg.docker, "changeWorkdir", Boolean);
      configureEntityParams(this.config.docker, cfg.docker, "memorySwappiness", Number);
      configureEntityParams(this.config.docker, cfg.docker, "memorySwap", Number);
      configureEntityParams(this.config.docker, cfg.docker, "uploadSpeedLimit", Number);
      configureEntityParams(this.config.docker, cfg.docker, "downloadSpeedLimit", Number);
      configureEntityParams(this.config.docker, cfg.docker, "capAdd");
      configureEntityParams(this.config.docker, cfg.docker, "capDrop");
      configureEntityParams(this.config.docker, cfg.docker, "devices");
      configureEntityParams(this.config.docker, cfg.docker, "privileged", Boolean);
      configureEntityParams(this.config.docker, cfg.docker, "gpuEnabled", Boolean);
      configureEntityParams(this.config.docker, cfg.docker, "gpuCount", Number);
      configureEntityParams(this.config.docker, cfg.docker, "gpuDeviceIds");
      configureEntityParams(this.config.docker, cfg.docker, "gpuDriver", String);
    }
    if (cfg.pingConfig) {
      configureEntityParams(this.config.pingConfig, cfg.pingConfig, "ip", String);
      configureEntityParams(this.config.pingConfig, cfg.pingConfig, "port", Number);
      configureEntityParams(this.config.pingConfig, cfg.pingConfig, "type", Number);
    }
    if (cfg.eventTask) {
      configureEntityParams(this.config.eventTask, cfg.eventTask, "autoStart", Boolean);
      configureEntityParams(this.config.eventTask, cfg.eventTask, "autoRestart", Boolean);
      configureEntityParams(this.config.eventTask, cfg.eventTask, "autoRestartMaxTimes", Number);
      configureEntityParams(this.config.eventTask, cfg.eventTask, "ignore", Boolean);
    }
    if (cfg.terminalOption) {
      configureEntityParams(this.config.terminalOption, cfg.terminalOption, "haveColor", Boolean);
    }

    if (cfg.startCommand && commandStringToArray(cfg.startCommand)[0] != "{mcsm_java}") {
      this.config.java.id = "";
    } else if (cfg.java) {
      configureEntityParams(this.config.java, cfg.java, "id", String);
    }

    if (persistence) {
      if (!this.config.basePort) this.allocatePort(this.config);
      StorageSubsystem.store("InstanceConfig", this.instanceUuid, this.config);
    }
  }

  allocatePort(cfg: InstanceConfig) {
    const globalCfg = globalConfiguration.config;
    const [minPort, maxPort] = globalCfg.allocatablePortRange;

    cfg.basePort = globalCfg.currentAllocatablePort;
    globalCfg.currentAllocatablePort += globalCfg.portAssignInterval;

    if (globalCfg.currentAllocatablePort > maxPort) {
      globalCfg.currentAllocatablePort = minPort;
    }

    // Avoid port overlap with Daemon.
    if (
      cfg.basePort <= globalCfg.port &&
      cfg.basePort + globalCfg.portAssignInterval >= globalCfg.port
    ) {
      cfg.basePort = globalCfg.port + 1;
      globalCfg.currentAllocatablePort = cfg.basePort + globalCfg.portAssignInterval;
    }

    globalConfiguration.store();
  }

  resetConfigWithoutDocker() {
    const newDockerCfg: IGlobalInstanceConfig["docker"] = JSON.parse(
      JSON.stringify(this.config.docker)
    );

    const extendDockerCfg = newDockerCfg as any;

    if (!extendDockerCfg?.isResetDockerCfg) {
      // Clear image-specific settings before generating defaults for a new image.
      delete newDockerCfg.image;
      delete newDockerCfg.env;
      delete newDockerCfg.ports;
      delete newDockerCfg.workingDir;
      delete newDockerCfg.changeWorkdir;
      delete newDockerCfg.containerName;

      this.config.updateCommand = "";
      this.config.startCommand = "";
      this.config.stopCommand = "^C";
      this.config.type = Instance.TYPE_UNIVERSAL;
    }

    this.config.docker = newDockerCfg;
  }

  setLock(bool: boolean) {
    if (this.lock === true && bool === true) {
      throw new Error($t("TXT_CODE_COMMON_THE_INSTANCE_HAS_OTHER_TASKS_IN_PROGRESS_AND_THIS_OPERATION_CANNOT_BE_PERFORMED"));
    }
    this.lock = bool;
  }

  async forceExec(command: InstanceCommand) {
    return await command.exec(this);
  }

  status(v?: number) {
    if (v != null) {
      this.instanceStatus = v;
      if (v === Instance.STATUS_STARTING) this.restartPending = false;
      if (v !== Instance.STATUS_RUNNING) this.clearRestartReset();
      else this.scheduleRestartReset();
    }
    return this.instanceStatus;
  }

  started(
    process: IInstanceProcess,
    previous?: {
      startTimestamp: number;
      startCount: number;
      autoRestartCount: number;
      userRequestedStop?: boolean;
    }
  ) {
    this.restartPending = false;
    this.startTimestamp = this.config.lastDatetime = previous?.startTimestamp || Date.now();
    if (previous) {
      this.startCount = previous.startCount;
      this.autoRestartCount = previous.autoRestartCount;
    }
    this.userRequestedStop = previous?.userRequestedStop ?? false;
    if (this.userRequestedStop) this.ignoreEventTaskOnce();
    process.snapshot?.({
      pid: Number(process.pid),
      startTimestamp: this.startTimestamp,
      startCount: this.startCount,
      autoRestartCount: this.autoRestartCount,
      userRequestedStop: this.userRequestedStop
    });
    const outputCode = this.config.terminalOption.pty ? "utf-8" : this.config.oe;
    process.on("data", (text: any) => {
      this.pushOutput(iconv.decode(text, outputCode));
    });
    process.on("error", (error: Error) => {
      if (this.process === process) this.println("ERROR", error.message ?? String(error));
    });
    process.once("exit", (code: number) => {
      if (this.process !== process) return;
      void this.stopped(code).catch((error) =>
        logger.error(`Instance ${this.instanceUuid} failed to stop:`, error)
      );
    });
    this.process = process;
    this.instanceStatus = Instance.STATUS_RUNNING;
    if (this.shuttingDown) {
      this.userRequestedStop = true;
      void Promise.resolve()
        .then(() => process.kill("SIGKILL"))
        .catch((error) => logger.error(`Instance ${this.instanceUuid} failed to stop:`, error));
      return;
    }
    this.emit("open", this);
    this.scheduleRestartReset();

    if (!this.reloading) {
      void this.lifeCycleTaskManager.execLifeCycleTask(1);
      this.startOutputLoop();
    }
  }

  failure(error: Error) {
    this.emit("failure", error);
    this.println("ERROR", error.message ?? String(error));
    throw error;
  }

  stopped(code = 0): Promise<void> {
    if (this.stopping) return this.stopping;
    if (this.instanceStatus === Instance.STATUS_STOP && !this.process) return Promise.resolve();
    const stoppedQuickly = this.startTimestamp > 0 && Date.now() - this.startTimestamp < 2000;
    const isCrash = !this.userRequestedStop;
    const shouldRestart = !this.config.eventTask.ignore && this.config.eventTask.autoRestart;
    this.clearRestartReset();
    this.clearStopTimeout();
    this.instanceStatus = Instance.STATUS_STOPPING;
    this.userRequestedStop = false;
    this.config.eventTask.ignore = false;

    const operation = Promise.resolve().then(async () => {
      this.stopOutputLoop();
      this.println("INFO", $t("TXT_CODE_COMMON_THE_INSTANCE_HAS_BEEN_STOPPED"));
      await this.releaseResources();
      await this.lifeCycleTaskManager.execLifeCycleTask(0);
      this.instanceStatus = Instance.STATUS_STOP;
      this.startTimestamp = 0;
      this.emit("exit", { code, isCrash });
      try {
        StorageSubsystem.store("InstanceConfig", this.instanceUuid, this.config);
      } catch (error) {
        logger.error(`Instance ${this.instanceUuid} failed to save its stopped state:`, error);
      }
      if (isCrash && stoppedQuickly) this.println("ERROR", $t("TXT_CODE_INSTANCE_PROCESS_START_FAILED"));

      // Release this stop before a restarted process can emit its own exit.
      this.stopping = undefined;
      if (shouldRestart && !this.shuttingDown) {
        if (this.reloading) this.restartPending = true;
        else this.restartAfterCrash();
      }
    }).finally(() => {
      if (this.stopping === operation) this.stopping = undefined;
    });
    this.stopping = operation;
    return operation;
  }

  private restartAfterCrash() {
    if (this.shuttingDown) return;
    const maxAutoRestartCount = this.config.eventTask.autoRestartMaxTimes;
    if (maxAutoRestartCount !== -1 && this.autoRestartCount >= maxAutoRestartCount) {
      this.println($t("TXT_CODE_INSTANCE_CONF_ERROR"), $t("TXT_CODE_COMMON_REACHED_THE_MAXIMUM_AUTO_RESTART_LIMIT"));
      return;
    }
    void this.execPreset("start")
      .then(() => {
        this.autoRestartCount++;
        this.process?.snapshot?.({ autoRestartCount: this.autoRestartCount });
        this.println($t("TXT_CODE_INSTANCE_CONF_INFO"), $t("TXT_CODE_INSTANCE_CONF_AUTO_RESTART"));
        this.emit("autoRestarted", { count: this.autoRestartCount });
      })
      .catch((err) => {
        this.println(
          $t("TXT_CODE_INSTANCE_CONF_ERROR"),
          $t("TXT_CODE_INSTANCE_CONF_AUTO_RESTART_ERR", { err })
        );
      });
  }

  private clearRestartReset() {
    if (this.restartResetTask) clearTimeout(this.restartResetTask);
    this.restartResetTask = undefined;
  }

  private scheduleRestartReset() {
    this.clearRestartReset();
    const seconds = instanceSetting("instanceAutoRestartResetSeconds");
    if (!seconds || this.shuttingDown || this.reloading) return;
    const startCount = this.startCount;
    const reset = () => {
      this.restartResetTask = undefined;
      if (this.status() !== Instance.STATUS_RUNNING || this.startCount !== startCount) return;
      this.autoRestartCount = 0;
      this.process?.snapshot?.({ autoRestartCount: 0 });
    };
    const remaining = this.startTimestamp + seconds * 1000 - Date.now();
    if (remaining <= 0) reset();
    else this.restartResetTask = setTimeout(reset, remaining);
  }

  private clearStopTimeout() {
    if (this.stopTimeoutTask) clearTimeout(this.stopTimeoutTask);
    this.stopTimeoutTask = undefined;
  }

  scheduleStopTimeout(seconds: number, callback: () => void) {
    this.clearStopTimeout();
    if (this.shuttingDown) return;
    this.stopTimeoutTask = setTimeout(() => {
      this.stopTimeoutTask = undefined;
      callback();
    }, seconds * 1000);
  }

  /** Keep the process and its pipe readers alive while plugin services change. */
  async suspendForReload() {
    this.stopOutputLoop();
    this.reloading = true;
    this.clearRestartReset();
    this.watchers.clear();
    await this.starting?.catch(() => {});
    await this.lifeCycleTaskManager.clearLifeCycleTask();
  }

  async resumeAfterReload(dispatcher: InstanceCommand) {
    if (this.shuttingDown) return;
    await this.stopping;
    if (this.shuttingDown) return;
    this.dispatcher = dispatcher;
    await this.forceExec(dispatcher);
    if (this.shuttingDown) return;
    this.reloading = false;
    this.flushOutputBuffer();
    if (this.status() === Instance.STATUS_RUNNING) {
      this.scheduleRestartReset();
      await this.lifeCycleTaskManager.execLifeCycleTask(1);
      if (!this.shuttingDown && this.status() === Instance.STATUS_RUNNING) {
        this.startOutputLoop(false);
      }
    } else if (this.status() === Instance.STATUS_STOP && this.restartPending) {
      this.restartPending = false;
      this.restartAfterCrash();
    }
  }

  beginShutdown() {
    this.clearRestartReset();
    this.clearStopTimeout();
    this.restartPending = false;
    this.reloading = false;
    this.shuttingDown = true;
    this.ignoreEventTaskOnce();
  }

  ignoreEventTaskOnce() {
    if (this.config.eventTask) this.config.eventTask.ignore = true;
  }

  setUserRequestedStop(value: boolean) {
    if (value) this.restartPending = false;
    this.userRequestedStop = value;
    this.process?.snapshot?.({ userRequestedStop: value });
  }

  getUserRequestedStop() {
    return this.userRequestedStop;
  }

  println(level: string, text: string) {
    const str = `[${level}] ${text}\n`;
    this.print(str);
  }

  print(data: any) {
    if (this.reloading) this.pushOutput(String(data));
    else this.emit("data", data);
  }

  releaseResources(): Promise<void> {
    if (this.resourceCleanup) return this.resourceCleanup;
    const process = this.process;
    this.process = undefined;
    const cleanup = Promise.resolve()
      .then(() => process?.destroy())
      .catch((error) => logger.error(`Instance ${this.instanceUuid}, Release resources error:`, error))
      .then(() => { this.resetInstanceRuntimeInfo(); })
      .finally(() => {
        if (this.resourceCleanup === cleanup) this.resourceCleanup = undefined;
      });
    this.resourceCleanup = cleanup;
    return cleanup;
  }

  resetInstanceRuntimeInfo() {
    this.info = {
      mcPingOnline: false,
      currentPlayers: 0,
      maxPlayers: 0,
      version: "",
      fileLock: this.info.fileLock,
      playersChart: [],
      openFrpStatus: false,
      latency: 0,
      allocatedPorts: this.info.allocatedPorts ?? []
    };
  }

  async destroy() {
    this.restartPending = false;
    this.clearRestartReset();
    this.clearStopTimeout();
    this.ignoreEventTaskOnce();
    this.stopOutputLoop();
    await this.lifeCycleTaskManager.clearLifeCycleTask();
    await this.releaseResources();
    this.removeAllListeners();
  }

  fullTime() {
    const date = new Date();
    return date.toLocaleDateString() + " " + date.getHours() + ":" + date.getMinutes();
  }

  hasCwdPath() {
    return !!this.config.cwd;
  }

  absoluteCwdPath() {
    if (!this.config || !this.config.cwd) throw new Error("Instance config error, cwd is Null!");
    if (path.isAbsolute(this.config.cwd)) return path.normalize(this.config.cwd);
    return path.normalize(path.join(process.cwd(), this.config.cwd));
  }

  async execPreset(action: IPresetCommand, p?: any) {
    if (this.presetCommandManager) {
      return await this.presetCommandManager.execPreset(action, p);
    }
    throw new Error(`Preset Manager does not exist`);
  }

  setPreset(action: IPresetCommand, cmd: InstanceCommand) {
    this.presetCommandManager.setPreset(action, cmd);
  }

  getPreset(action: IPresetCommand) {
    return this.presetCommandManager.getPreset(action);
  }

  clearPreset() {
    this.presetCommandManager.clearPreset();
  }

  computeTerminalSize() {
    let minW = this.config.terminalOption.ptyWindowCol;
    let minH = this.config.terminalOption.ptyWindowRow;
    for (const iterator of this.watchers.values()) {
      const { w, h } = iterator.terminalSize;
      if (w && h) {
        if (w < minW) minW = w;
        if (h < minH) minH = h;
      }
    }
    return {
      w: minW,
      h: minH
    };
  }

  public resetPingInfo() {
    this.info.mcPingOnline = false;
    this.info.currentPlayers = 0;
    this.info.maxPlayers = 0;
    this.info.version = "";

    this.info.latency = 0;
  }

  public async parseTextParams(text: string) {
    if (typeof text !== "string") return "";
    text = text.replace(/\{mcsm_workspace\}/gim, this.absoluteCwdPath());
    text = text.replace(/\{mcsm_cwd\}/gim, this.absoluteCwdPath());
    text = text.replace(/\{mcsm_uuid\}/gim, this.instanceUuid);
    text = text.replace(/\{mcsm_random\}/gim, randomUUID());
    text = text.replace(/\{mcsm_run_as\}/gim, this.config.runAs);
    text = text.replace(/\{mcsm_steamcmd\}/gim, STEAM_CMD_PATH);
    text = text.replace(/\{mcsm_instance_id\}/gim, this.instanceUuid);
    text = text.replace(/\{mcsm_instance_name\}/gim, this.config.nickname);
    text = text.replace(/\{mcsm_instance_base_port\}/gim, String(this.config.basePort));

    const javaId = this.config.java.id;
    if (javaId) {
      text = text.replace(
        /\{mcsm_java\}/gim,
        await javaManagerSubsystem().getJavaRuntimeCommand(javaId)
      );
    }

    const ports = Array.from(
      { length: globalConfiguration.config.portAssignInterval || 1 },
      (_, index) => index + 1
    );
    const basePort = Number(this.config.basePort);
    ports.forEach((portOffset) => {
      const placeholder = `\\{mcsm_port${portOffset}\\}`;
      const replacement = String(basePort + portOffset);
      text = text.replace(new RegExp(placeholder, "gim"), replacement);
    });
    return text;
  }

  public getCrlfValue(): string {
    return this.config.crlf === 2 ? "\r\n" : "\n";
  }

  public generateEnv() {
    let env = process.env;
    if (this.config.runAs) {
      env = {
        ...env,
        USER: this.config.runAs ?? "",
        HOME: this.config.runAs ? `/home/${this.config.runAs}` : "",
        LOGNAME: this.config.runAs ?? ""
      };
    }
    return env;
  }

  private pushOutput(data: string) {
    this.outputBuffer.pushLog(data);
  }

  private flushOutputBuffer(shouldClear = false) {
    if (this.reloading) return;
    const { items, wasDeleted } = this.outputBuffer.getCache();
    if (!items.length) return;
    if (wasDeleted) items.unshift(getIgnoreText());
    if (shouldClear) this.outputBuffer.clear();
    this.emit("data", items.join(""));
  }

  private startOutputLoop(resetBuffer = true) {
    if (this.outputLoopTask) return;
    if (resetBuffer)
      this.outputBuffer = new CircularBuffer<string>(
        globalConfiguration.config.outputBufferSize || 256
      );
    this.outputLoopTask = setInterval(() => {
      this.flushOutputBuffer();
    }, 50);
  }

  private stopOutputLoop() {
    if (this.outputLoopTask) clearInterval(this.outputLoopTask);
    this.outputLoopTask = undefined;
    this.flushOutputBuffer(true);
  }
}
