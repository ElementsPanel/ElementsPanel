import { commandStringToArray } from "../entity/commands/base/command_parser";
import DockerPullCommand from "../entity/commands/docker/docker_pull";
import Instance from "../entity/instance/instance";
import { DefaultDocker } from "./docker_service";

import Docker from "dockerode";
import fs from "fs-extra";
import iconv from "iconv-lite";
import { toText } from "mcsmanager-common";
import path from "path";
import { EventEmitter } from "stream";
import { IInstanceProcess } from "../entity/instance/interface";
import { $t } from "../i18n";
import { AsyncTask } from "./async_task_service";
import logger from "./log";
import { NetworkLimitService } from "./network_limit_service";
import InstanceSubsystem from "./system_instance";

type PublicPortArray = {
  [key: string]: { HostPort: string }[];
};

type ExposedPorts = {
  [key: string]: {};
};

export class StartupDockerProcessError extends Error {
  constructor(msg: string) {
    super(msg);
  }
}

export interface IDockerProcessAdapterStartParam {
  isTty: boolean;
  h: number;
  w: number;
}

export class SetupDockerContainer extends AsyncTask {
  private container?: Docker.Container;

  constructor(
    public readonly instance: Instance,
    public readonly startCommand?: string,
    public readonly imageOverride?: string
  ) {
    super();
  }

  public async onStart() {
    const instance = this.instance;
    const customCommand = this.startCommand;
    const useImageOverride = Boolean(this.imageOverride?.trim());

    if (!fs.existsSync(this.instance.absoluteCwdPath())) {
      await fs.mkdirs(instance.absoluteCwdPath());
    }
    // Container users may differ from the daemon user; allow them to write installed files.
    fs.chmod(this.instance.absoluteCwdPath(), 0o777).catch(() => {
      logger.error(
        `Failed to chmod the instance directory to 777: ${this.instance.absoluteCwdPath()}`
      );
    });

    await instance.forceExec(new DockerPullCommand(this.imageOverride?.trim()));

    let commandList: string[];
    if (instance.config?.startCommand?.trim() || customCommand?.trim()) {
      const tmpCmd = customCommand ?? instance.config.startCommand;
      commandList = commandStringToArray(await instance.parseTextParams(tmpCmd));
    } else {
      commandList = [];
    }
    const dockerConfig = instance.config.docker;
    if (!dockerConfig) {
      throw new Error("Instance's Docker configuration is not found! ");
    }

    // Port mappings use hostPort:containerPort/protocol.
    const portMap = dockerConfig.ports || [];

    const logOpenedPorts: { host: number; container: number; protocol: string }[] = [];
    const publicPortArray: PublicPortArray = {};
    const exposedPorts: ExposedPorts = {};
    for (const portConfigText of portMap) {
      const elem = (await instance.parseTextParams(portConfigText)).split("/");
      if (elem.length != 2)
        throw new Error($t("TXT_CODE_COMMON_INCORRECT_PORT_OPEN_CONFIGURATION_FOR_THIS_CONTAINER"));
      const ports = elem[0];
      const protocol = elem[1];
      const publicAndPrivatePort = ports.split(":");
      if (publicAndPrivatePort.length != 2)
        throw new Error($t("TXT_CODE_DOCKER_PORT_MAPPING_INVALID"));
      publicPortArray[`${publicAndPrivatePort[1]}/${protocol}`] = [
        { HostPort: publicAndPrivatePort[0] }
      ];
      exposedPorts[`${publicAndPrivatePort[1]}/${protocol}`] = {};
      logOpenedPorts.push({
        host: Number(publicAndPrivatePort[0]),
        container: Number(publicAndPrivatePort[1]),
        protocol: protocol
      });
    }

    const extraVolumes = dockerConfig.extraVolumes || [];
    const extraBinds: { hostPath: string; containerPath: string }[] = [];
    for (const item of extraVolumes) {
      if (!item)
        throw new Error(
          $t(
            "TXT_CODE_COMMON_THE_ADDITIONAL_MOUNTING_PATH_OF_THE_INSTANCE_CONTAINER_IS_CONFIGURED_INCORRECTLY"
          )
        );
      const paths = item.split("|");
      if (paths.length < 2) throw new Error($t("TXT_CODE_DOCKER_VOLUME_MAPPING_LENGTH_INVALID"));
      const hostPath = path.normalize(paths[0]);
      const containerPath = path.normalize(paths[1]);
      extraBinds.push({ hostPath, containerPath });
    }

    let maxMemory: number | undefined = undefined;
    if (typeof dockerConfig.memory === "number" && dockerConfig.memory > 0)
      maxMemory = dockerConfig.memory * 1024 * 1024;

    let cpuQuota: number | undefined = undefined;
    let cpuPeriod: number | undefined = undefined;
    if (typeof dockerConfig.cpuUsage === "number" && dockerConfig.cpuUsage > 0) {
      cpuQuota = dockerConfig.cpuUsage * 10 * 1000;
      cpuPeriod = 1000 * 1000;
    }

    let cpusetCpus: string | undefined = undefined;
    if (dockerConfig.cpusetCpus) {
      const arr = dockerConfig.cpusetCpus.split(",");
      arr.forEach((v: string) => {
        if (isNaN(Number(v))) throw new Error($t("TXT_CODE_INSTANCE_INVALID_CPU", { v }));
      });
      cpusetCpus = dockerConfig.cpusetCpus;
    }

    let memorySwap: number | undefined = undefined;
    let memorySwappiness: number | undefined = undefined;
    if (typeof dockerConfig.memorySwap === "number" && maxMemory)
      memorySwap = dockerConfig.memorySwap * 1024 * 1024 + maxMemory;
    if (
      typeof dockerConfig.memorySwappiness === "number" &&
      dockerConfig.memorySwappiness <= 100 &&
      dockerConfig.memorySwappiness >= 0 &&
      maxMemory
    )
      memorySwappiness = dockerConfig.memorySwappiness;

    let containerName = dockerConfig.containerName || `MCSM-${instance.instanceUuid.slice(0, 6)}`;
    if (containerName && (containerName.length > 64 || containerName.length < 2)) {
      throw new Error($t("TXT_CODE_INSTANCE_INVALID_CONTAINER_NAME", { v: containerName }));
    }

    const workingDir = dockerConfig.workingDir || undefined;

    const capAdd = dockerConfig.capAdd || [];
    const capDrop = dockerConfig.capDrop || [];

    // Device mappings use hostPath|containerPath|permissions, with optional trailing fields.
    const devices = dockerConfig.devices || [];
    const parsedDevices: {
      PathOnHost: string;
      PathInContainer: string;
      CgroupPermissions: string;
    }[] = [];
    for (const item of devices) {
      if (!item)
        throw new Error(
          $t("TXT_CODE_COMMON_THE_DEVICES_OF_THE_INSTANCE_CONTAINER_ARE_CONFIGURED_INCORRECTLY")
        );
      const parts = item.split("|").map((p) => p.trim());
      if (!parts[0])
        throw new Error(
          $t("TXT_CODE_COMMON_THE_DEVICES_OF_THE_INSTANCE_CONTAINER_ARE_CONFIGURED_INCORRECTLY")
        );
      parsedDevices.push({
        PathOnHost: parts[0],
        PathInContainer: parts[1] || parts[0],
        CgroupPermissions: parts[2] || "rwm"
      });
    }

    const privileged = dockerConfig.privileged || false;

    let gpuDeviceRequests: any[] | undefined = undefined;
    if (dockerConfig.gpuEnabled) {
      const gpuCount = dockerConfig.gpuCount ?? -1;
      const gpuDeviceIds = dockerConfig.gpuDeviceIds ?? [];
      const gpuDriver = dockerConfig.gpuDriver ?? "";

      if (!Number.isInteger(gpuCount) || gpuCount < -1 || gpuCount > 128) {
        throw new Error($t("TXT_CODE_GPU_INVALID_COUNT", { v: String(gpuCount) }));
      }

      if (gpuDeviceIds.length > 128) {
        throw new Error(
          $t("TXT_CODE_GPU_INVALID_DEVICE_ID", { v: `(${gpuDeviceIds.length} items)` })
        );
      }
      const gpuIdPattern = /^[a-zA-Z0-9_-]+$/;
      for (const id of gpuDeviceIds) {
        if (typeof id !== "string" || !id.trim() || id.length > 128 || !gpuIdPattern.test(id)) {
          throw new Error($t("TXT_CODE_GPU_INVALID_DEVICE_ID", { v: id }));
        }
      }

      if (gpuDriver && (gpuDriver.length > 32 || !/^[a-zA-Z0-9]+$/.test(gpuDriver))) {
        throw new Error($t("TXT_CODE_GPU_INVALID_DRIVER", { v: gpuDriver }));
      }

      // Docker accepts GPU IDs or a count, not both.
      if (gpuDeviceIds.length > 0 && gpuCount > 0) {
        throw new Error($t("TXT_CODE_GPU_CONFLICT_COUNT_AND_IDS"));
      }

      if (gpuCount === 0 && gpuDeviceIds.length === 0) {
        logger.warn(
          `[SetupDockerContainer] GPU enabled but gpuCount=0 and no deviceIds specified, GPU will not be allocated. Instance: ${instance.instanceUuid}`
        );
      } else {
        if (privileged) {
          logger.warn(
            `[SetupDockerContainer] GPU passthrough is configured alongside privileged mode. ` +
              `In privileged mode the container already has access to all host devices. Instance: ${instance.instanceUuid}`
          );
        }

        const deviceRequest: any = {
          Driver: gpuDriver,
          Capabilities: [["gpu"]],
          Options: {}
        };

        if (gpuDeviceIds.length > 0) {
          deviceRequest.DeviceIDs = gpuDeviceIds;
          deviceRequest.Count = 0;
        } else {
          // Docker Count=-1 requests all GPUs.
          deviceRequest.Count = gpuCount;
        }

        gpuDeviceRequests = [deviceRequest];
      }
    }

    let cwd = instance.absoluteCwdPath();
    const defaultInstanceDir = InstanceSubsystem.getInstanceDataDir();
    const hostRealPath = toText(process.env.MCSM_DOCKER_WORKSPACE_PATH);
    if (hostRealPath && cwd.includes(defaultInstanceDir)) {
      cwd = path.normalize(path.join(hostRealPath, instance.instanceUuid));
    }

    const mounts: Docker.MountConfig = [];
    for (const v of extraBinds) {
      const hostPath = await instance.parseTextParams(v.hostPath);
      if (!fs.existsSync(hostPath)) fs.mkdirsSync(hostPath);
      mounts.push({
        Type: "bind",
        Source: hostPath,
        Target: await instance.parseTextParams(v.containerPath)
      });
    }
    if (workingDir && cwd) {
      mounts.push({
        Type: "bind",
        Source: cwd,
        Target: await instance.parseTextParams(workingDir)
      });
    }

    logger.info("----------------");
    logger.info(`[SetupDockerContainer]`);
    logger.info(`UUID: [${instance.instanceUuid}] [${instance.config.nickname}]`);
    logger.info(`NAME: [${containerName}]`);
    logger.info(`COMMAND: ${commandList.join(" ")}`);
    logger.info(`CWD: ${cwd}, WORKING_DIR: ${workingDir}`);
    logger.info(`NET_MODE: ${dockerConfig.networkMode}`);
    logger.info(`OPEN_PORT: ${JSON.stringify(publicPortArray)}`);
    logger.info(`Volume Mounts: ${JSON.stringify(mounts)}`);
    logger.info(`NET_ALIASES: ${JSON.stringify(dockerConfig.networkAliases)}`);
    logger.info(`UPLOAD_LIMIT: ${dockerConfig.uploadSpeedLimit} KB/s`);
    logger.info(`DOWNLOAD_LIMIT: ${dockerConfig.downloadSpeedLimit} KB/s`);
    logger.info(
      `MEM_LIMIT: ${maxMemory ? (maxMemory / 1024 / 1024).toFixed(2) : "--"} MB, Swap: ${
        memorySwap ? (memorySwap / 1024 / 1024).toFixed(2) : "--"
      } MB`
    );
    logger.info(`GPU: ${gpuDeviceRequests ? JSON.stringify(gpuDeviceRequests) : "disabled"}`);

    if (workingDir) {
      instance.println(
        "INFO",
        $t("TXT_CODE_COMMON_MOUNTED_WORKING_DIRECTORY") + cwd + " --> " + workingDir + "\n"
      );
    }

    if (logOpenedPorts.length) {
      instance.info.allocatedPorts = logOpenedPorts;
      instance.println(
        "INFO",
        $t("TXT_CODE_COMMON_THE_FOLLOWING_PORTS_HAVE_BEEN_OPENED_FOR_THE_INSTANCE")
      );
      logOpenedPorts.forEach((v) => {
        instance.println(
          "INFO",
          $t("TXT_CODE_COMMON_EXTERNAL_ACCESS_PORT_INTERNAL_CONTAINER_PORT_PROTOCOL", {
            host: v.host,
            container: v.container,
            protocol: v.protocol
          })
        );
      });
    } else {
      instance.info.allocatedPorts = [];
    }

    const docker = new DefaultDocker();

    let entrypoint: string | string[] | undefined = commandList.length ? commandList[0] : undefined;
    const startCmd = commandList.length > 1 ? commandList.slice(1) : undefined;

    // Docker API v29 and later require Entrypoint to be an array.
    const { Version: dockerVersion } = await docker.version();
    const versionNum = dockerVersion.split(".")[0];
    if (Number(versionNum.replace("v", "")) >= 29 && entrypoint !== undefined) {
      entrypoint = [entrypoint];
    }

    const effectiveImage = useImageOverride ? this.imageOverride! : dockerConfig.image;

    logger.info(`Container Entrypoint: ${entrypoint}`);
    logger.info(`Container Start Command: ${startCmd}`);
    logger.info(`Docker Version: ${dockerVersion}`);
    logger.info("----------------");

    const networkLimitService = NetworkLimitService.getInstance();
    if (dockerConfig.uploadSpeedLimit || dockerConfig.downloadSpeedLimit) {
      try {
        networkLimitService.checkRequiredCommands();
      } catch (error) {
        instance.println("ERROR", $t("TXT_CODE_NETWORK_RATE_LIMIT_TOOLS_UNAVAILABLE"));
        throw error;
      }
    }

    this.container = await docker.createContainer({
      Entrypoint: entrypoint,
      Cmd: startCmd,
      name: containerName,
      Hostname: containerName,
      Image: effectiveImage,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      WorkingDir: dockerConfig.changeWorkdir ? workingDir : undefined,
      OpenStdin: true,
      StdinOnce: false,
      ExposedPorts: exposedPorts,
      Env: dockerConfig?.env || [],
      User: instance.config.runAs || undefined,
      Labels: {
        ...dockerConfig.labels
          ?.map((label) => {
            const [key, ...rest] = label.split("=");
            return { [key]: rest.join("=") };
          })
          .reduce((acc, cur) => ({ ...acc, ...cur }), {}),
        "mcsmanager.instance.uuid": instance.instanceUuid
      },
      HostConfig: {
        Memory: maxMemory,
        MemorySwap: memorySwap,
        MemorySwappiness: memorySwappiness,
        AutoRemove: true,
        CpusetCpus: cpusetCpus,
        CpuPeriod: cpuPeriod,
        CpuQuota: cpuQuota,
        PortBindings: publicPortArray,
        NetworkMode: dockerConfig.networkMode,
        Mounts: mounts,
        CapAdd: capAdd,
        CapDrop: capDrop,
        Devices: parsedDevices,
        Privileged: privileged,
        DeviceRequests: gpuDeviceRequests
      },
      // Host networking does not support EndpointsConfig.
      ...(dockerConfig.networkMode !== "host" &&
        dockerConfig.networkMode !== "none" && {
          NetworkingConfig: {
            EndpointsConfig: {
              [dockerConfig.networkMode || "bridge"]: {
                Aliases: dockerConfig.networkAliases
              }
            }
          }
        })
    });

    await this.container.start();

    if (dockerConfig && (dockerConfig.uploadSpeedLimit || dockerConfig.downloadSpeedLimit)) {
      try {
        await networkLimitService.setBandwidthLimit(this.container.id, {
          uploadLimit: dockerConfig.uploadSpeedLimit,
          downloadLimit: dockerConfig.downloadSpeedLimit
        });
        logger.info(
          `Applied bandwidth limits to container ${this.container.id}, Instance: ${instance.config.nickname}`
        );
      } catch (error: any) {
        instance.println("ERROR", $t("TXT_CODE_DOCKER_NETWORK_RATE_LIMIT_START_FAILED"));
        instance.println("ERROR", $t("TXT_CODE_COMMON_ERROR_INFORMATION") + error.message);
        logger.error(`Failed to apply bandwidth limits:`, error);
        this.container.kill().catch(() => {});
        this.container.remove().catch(() => {});
        await networkLimitService.clearBandwidthLimit(this.container.id);
        throw error;
      }
    }

    this.container.wait(() => this.stop());
  }

  public async onStop() {
    const containerId = this.container?.id;

    try {
      await this.container?.kill();
    } catch (error) {
      // The container may have already stopped.
    }
    try {
      await this.container?.remove();
    } catch (error) {
      // The container may have already been removed.
    }

    if (containerId) {
      try {
        await NetworkLimitService.getInstance().clearBandwidthLimit(containerId);
      } catch (error) {
        // Continue cleanup if the network interface is unavailable.
      }
    }
  }

  public getContainer() {
    if (!this.container) throw new Error("Function getContainer(): Failed, Container is Null!");
    return this.container;
  }

  public async attach(instance: Instance) {
    const outputCode = instance.config.terminalOption.pty ? "utf-8" : instance.config.oe;
    const container = this.container;
    if (!container) throw new Error("Attach Failed, Container is Null!");
    try {
      const stream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
        stdin: true,
        hijack: true
      });
      stream.on("data", (text: any) => instance.print(iconv.decode(text, outputCode)));
      stream.on("error", (text: any) => instance.print(iconv.decode(text, outputCode)));
    } catch (error: any) {
      this.error(error);
      throw error;
    }
  }

  public async onError(_err: Error) {}

  public toObject() {}
}

export class DockerProcessAdapter extends EventEmitter implements IInstanceProcess {
  pid?: number | string;

  private stream?: NodeJS.ReadWriteStream;
  public container?: Docker.Container;

  constructor(public readonly containerWrapper: SetupDockerContainer) {
    super();
  }

  // Release startup ownership even if post-start setup fails.
  public async start(param: IDockerProcessAdapterStartParam, container?: Docker.Container) {
    try {
      if (container) {
        this.container = container;
      } else {
        await this.containerWrapper.start();
        this.container = this.containerWrapper.getContainer();
      }

      const { isTty, h, w } = param;
      if (isTty) {
        this.container.resize({ h, w });
      }

      this.pid = this.container.id;
      this.stream = await this.container.attach({
        stream: true,
        stdout: true,
        stderr: true,
        stdin: true,
        hijack: true
      });
      this.stream.on("data", (data) => this.emit("data", data));
      this.stream.on("error", (data) => this.emit("data", data));
      this.wait();
    } catch (error: any) {
      this.kill();
      throw error;
    }
  }

  public write(data?: string) {
    if (this.stream && data) this.stream.write(data);
  }

  public async kill(_s?: string) {
    await this.container?.kill();
    return true;
  }

  public async destroy() {
    try {
      await this.container?.remove();
    } catch (error: any) {
      // The container may have already been removed.
    }
  }

  private wait() {
    this.container?.wait(async (v) => {
      await this.destroy();
      this.emit("exit", v);
    });
  }
}
