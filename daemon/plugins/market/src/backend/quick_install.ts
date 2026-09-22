import axios from "axios";
import { createHash } from "crypto";
import fs from "fs-extra";
import path from "path";
import { pipeline, Readable } from "stream";
import { v4 } from "uuid";
type InstanceEntity = any;
type IAsyncTaskJSON = any;
import type { DaemonPluginContext } from "../../../../src/plugin";
import type { MinecraftInstallOptions } from "../../../../../common/src/minecraft";
import {
  minecraftFileName,
  minecraftInstallerCommand,
  minecraftStartCommand
} from "./minecraft_install";

/**
 * Downloads a market package into an instance directory, unpacks it and applies
 * the configuration it ships with. Used both when creating a new instance from
 * the market and when reinstalling an existing one.
 *
 * The class is built inside a factory because it extends `AsyncTask`, which the
 * plugin can only reach through its context — importing the daemon core directly
 * would compile a second task subsystem.
 */
export function createQuickInstallTaskClass(ctx: DaemonPluginContext) {
  const { AsyncTask } = ctx.tasks;
  const {
    Instance,
    Config: InstanceConfig,
    UpdateAction: InstanceUpdateAction,
    fileManager: getFileManager,
    headers: getCommonHeaders,
    subsystem: instances
  } = ctx.instances;
  const $t = ctx.i18n.$t;
  const logger = ctx.logger;
  type InstanceUpdateTask = InstanceType<typeof InstanceUpdateAction>;

  return class QuickInstallTask extends AsyncTask {
    public static TYPE = "QuickInstallTask";

    public instance: InstanceEntity;
    public readonly TMP_ZIP_NAME = "mcsm_install_package.zip";
    public readonly ZIP_CONFIG_JSON = "mcsmanager-config.json";
    public filePath = "";
    public extName = "";

    public downloadProgress = {
      percentage: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0, // bytes per second
      eta: 0 // estimated time remaining in seconds
    };

    private lastProgressOutput = 0; // Throttle progress output
    private isInitInstance = false;
    private cancelled = false;
    private finished = false;

    private abortController?: AbortController;
    private downloadStream?: fs.WriteStream;
    private writeStream?: fs.WriteStream;
    private updateTask?: InstanceUpdateTask;

    constructor(
      public instanceName: string,
      public targetLink?: string,
      public buildParams?: IGlobalInstanceConfig,
      curInstance?: InstanceEntity,
      private readonly minecraft?: MinecraftInstallOptions
    ) {
      super();
      this.extName = this.minecraft
        ? path.extname(minecraftFileName(this.minecraft))
        : path.extname(this.targetLink ? new URL(this.targetLink).pathname : "") || ".zip";
      const config = new InstanceConfig();
      config.nickname = instanceName;
      config.stopCommand = "^c";
      if (!curInstance) {
        config.cwd = "";
        this.instance = instances.createInstance(config);
        this.isInitInstance = true;
      } else {
        this.instance = curInstance;
        this.isInitInstance = false;
      }

      this.taskId = `${QuickInstallTask.TYPE}-${this.instance.instanceUuid}-${v4()}`;
      this.type = QuickInstallTask.TYPE;
    }

    private async download() {
      this.abortController = new AbortController();
      if (!this.targetLink) throw new Error("No targetLink!");
      let downloadFileName = this.TMP_ZIP_NAME;
      if (this.minecraft) {
        downloadFileName = minecraftFileName(this.minecraft);
      } else if (this.extName !== ".zip") {
        const url = new URL(this.targetLink);
        downloadFileName = url.pathname.split("/").pop() || `application${this.extName}`;
      }
      this.filePath = path.normalize(path.join(this.instance.absoluteCwdPath(), downloadFileName));

      // Initialize download progress
      this.downloadProgress = {
        percentage: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speed: 0,
        eta: 0
      };

      const response = await axios<Readable>({
        url: this.targetLink,
        responseType: "stream",
        signal: this.abortController.signal,
        headers: {
          ...getCommonHeaders(this.targetLink),
          ...(this.minecraft ? { "User-Agent": "ElementsPanel" } : {})
        },
        timeout: this.minecraft ? 30000 : 0,
        maxRedirects: 10
      });
      if (this.cancelled) {
        response.data.destroy();
        return;
      }

      // Get total file size
      const contentLength = response.headers["content-length"];
      const totalBytes =
        typeof contentLength === "string" || typeof contentLength === "number"
          ? Number(contentLength)
          : NaN;
      if (Number.isSafeInteger(totalBytes) && totalBytes >= 0) {
        this.downloadProgress.totalBytes = totalBytes;
      }

      let lastProgressUpdate = Date.now();
      let lastDownloadedBytes = 0;
      const hash = this.minecraft?.sha256 ? createHash("sha256") : undefined;

      // listen download progress
      response.data.on("data", (chunk: Buffer) => {
        hash?.update(chunk);
        this.downloadProgress.downloadedBytes += chunk.length;

        // Calculate download speed (update every second)
        const currentTime = Date.now();
        if (currentTime - lastProgressUpdate >= 1000) {
          const timeDiff = (currentTime - lastProgressUpdate) / 1000;
          const bytesDiff = this.downloadProgress.downloadedBytes - lastDownloadedBytes;
          this.downloadProgress.speed = bytesDiff / timeDiff;

          // Calculate remaining time
          if (this.downloadProgress.speed > 0 && this.downloadProgress.totalBytes > 0) {
            const remainingBytes =
              this.downloadProgress.totalBytes - this.downloadProgress.downloadedBytes;
            this.downloadProgress.eta = remainingBytes / this.downloadProgress.speed;
          }

          lastProgressUpdate = currentTime;
          lastDownloadedBytes = this.downloadProgress.downloadedBytes;
        }

        // Calculate download percentage
        if (this.downloadProgress.totalBytes > 0) {
          this.downloadProgress.percentage = Math.round(
            (this.downloadProgress.downloadedBytes / this.downloadProgress.totalBytes) * 100
          );
        }
        // Throttle progress output to once per second
        const now = Date.now();
        const PROGRESS_THROTTLE_MS = 1000;
        if (now - this.lastProgressOutput >= PROGRESS_THROTTLE_MS) {
          const downloadText = $t("TXT_CODE_b135e9bd");
          const speed = `${(this.downloadProgress.speed / 1024 / 1024).toFixed(2)} MB/s`;
          this.instance.println(
            "INFO",
            `${downloadText} ${this.downloadProgress.percentage}% ${speed}`
          );
          this.lastProgressOutput = now;
        }
      });

      // await download
      await new Promise<boolean>((resolve, reject) => {
        // Open the file only once the response is available so pipeline owns
        // its error events, including disk/permission errors during open.
        this.writeStream = fs.createWriteStream(this.filePath);
        this.downloadStream = pipeline(response.data, this.writeStream!, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(true);
          }
        });
      });

      if (hash && hash.digest("hex").toLowerCase() !== this.minecraft!.sha256!.toLowerCase()) {
        await fs.remove(this.filePath);
        throw new Error($t("TXT_CODE_minecraft.hashMismatch"));
      }

      this.downloadProgress.percentage = 100;
      this.instance.println(
        "INFO",
        `Download "${this.minecraft ? downloadFileName : this.targetLink}" success!!!`
      );
    }

    private async runUpdate() {
      this.updateTask = new InstanceUpdateAction(this.instance);
      // Attach the error listener before starting: a missing Java executable
      // can fail before start() resolves.
      const failure = () => {};
      this.updateTask.on("error", failure);
      try {
        await this.updateTask.start();
        await this.updateTask.wait();
      } finally {
        this.updateTask.removeListener("error", failure);
      }
    }

    private async installMinecraft() {
      if (!this.minecraft) return;
      if (this.minecraft.kind === "forge" || this.minecraft.kind === "neoforge") {
        const updateCommand = this.instance.config.updateCommand;
        try {
          this.instance.config.updateCommand = minecraftInstallerCommand(this.minecraft);
          await this.runUpdate();
        } finally {
          this.instance.config.updateCommand = updateCommand;
        }
      }
      if (this.cancelled) return;
      const startCommand = await minecraftStartCommand(
        this.instance.absoluteCwdPath(),
        this.minecraft,
        $t
      );
      if (!this.instance.config.startCommand?.trim())
        this.instance.parameters({ startCommand }, true);
    }

    async onStart() {
      this.instance.print("\n");
      if (
        this.instance.config.processType === "docker" &&
        this.buildParams?.processType !== "docker"
      ) {
        this.instance.println("ERROR", $t("TXT_CODE_f8145844"));
        this.stop();
        return;
      }

      this.instance.println("INFO", $t("TXT_CODE_e166bc2f"));

      const fileManager = getFileManager(this.instance.instanceUuid);
      try {
        this.instance.status(Instance.STATUS_BUSY);
        if (this.isInitInstance) {
          if (this.instance.asynchronousTask) {
            throw new Error($t("TXT_CODE_5b0e93b5"));
          }
          this.instance.asynchronousTask = this;
        }

        if (this.targetLink) {
          await this.download();
          if (this.cancelled) return;
          if (this.extName === ".zip") {
            this.instance.println("INFO", $t("TXT_CODE_e4a926bf"));
            const isOk = await fileManager.unzip(this.TMP_ZIP_NAME, ".", "UTF-8");
            if (!isOk) {
              throw new Error($t("TXT_CODE_quick_install.unzipError"));
            }
          }
        }
        if (this.cancelled) return;

        this.instance.println("INFO", $t("TXT_CODE_9df98e2"));
        let config: Partial<IGlobalInstanceConfig>;
        if (this.minecraft) {
          config = { ...this.buildParams, cwd: this.instance.config.cwd, processType: "general" };
        } else if (
          this.buildParams?.startCommand ||
          !fs.existsSync(fileManager.toAbsolutePath(this.ZIP_CONFIG_JSON))
        ) {
          config = this.buildParams || {};
        } else {
          config = JSON.parse(await fileManager.readFile(this.ZIP_CONFIG_JSON));
        }

        logger.info(
          $t("TXT_CODE_e5ba712d"),
          this.instance.config.nickname,
          this.instance.instanceUuid,
          "URL:",
          this.minecraft ? `${this.minecraft.server}/${this.minecraft.version}` : this.targetLink
        );
        logger.info($t("TXT_CODE_ac225d07") + JSON.stringify(config));

        this.instance.resetConfigWithoutDocker();
        this.instance.parameters(config, true);
        await this.installMinecraft();
        if (this.cancelled) return;

        this.instance.println("INFO", $t("TXT_CODE_4eccdde8"));

        if (this.instance?.config?.updateCommand) {
          try {
            this.instance.println("INFO", $t("TXT_CODE_e577c77c"));
            await this.runUpdate();
            if (this.cancelled) return;
            this.instance.println("INFO", $t("TXT_CODE_9b4985d3"));
            this.instance.println("INFO", $t("TXT_CODE_1562f6cf"));
          } catch (error: any) {
            if (this.minecraft) throw error;
            this.instance.println(
              "ERROR",
              `\n========================================
${$t("TXT_CODE_47d56d0d")}
${error?.message}
========================================\n`
            );
          }
        } else {
          this.instance.println("INFO", $t("TXT_CODE_1562f6cf"));
        }

        this.finished = true;
        await this.stop();
      } catch (error: any) {
        if (!this.cancelled) await this.error(error);
      } finally {
        this.instance.status(Instance.STATUS_STOP);
        if (this.isInitInstance && this.instance.asynchronousTask === this)
          this.instance.asynchronousTask = undefined;
        if (fs.existsSync(fileManager.toAbsolutePath(this.TMP_ZIP_NAME)))
          fs.remove(fileManager.toAbsolutePath(this.TMP_ZIP_NAME), () => {});
      }
    }

    async onStop() {
      if (!this.finished) this.cancelled = true;
      try {
        this.abortController?.abort();
        this.writeStream?.destroy();
        this.downloadStream?.destroy();
        this.writeStream = undefined;
        this.downloadStream = undefined;
        this.abortController = undefined;
      } catch (error: any) {
        this.instance.println(
          "ERROR",
          "QuickInstallTask -> onStop(): destroy download stream error: " + error?.message
        );
        logger.error("QuickInstallTask -> onStop(): destroy download stream error: ", error);
      }

      try {
        await this.updateTask?.stop();
        this.updateTask = undefined;
      } catch (error: any) {
        this.instance.println(
          "ERROR",
          "QuickInstallTask -> onStop(): updateTask stop error: " + error?.message
        );
        logger.error("QuickInstallTask -> onStop(): updateTask stop error: ", error);
      } finally {
        this.instance.print("\n");
      }
    }

    toObject(): IAsyncTaskJSON {
      return JSON.parse(
        JSON.stringify({
          taskId: this.taskId,
          status: this.status(),
          instanceUuid: this.instance.instanceUuid,
          instanceStatus: this.instance.status(),
          instanceConfig: this.instance.config,
          downloadProgress: this.downloadProgress,
          error: this.errorInfo?.message
        })
      );
    }

    async onError(err: Error) {
      this.instance.println("ERROR", err?.message);
    }
  };
}

/** The produced class and its instances, for typing the plugin's references. */
export type QuickInstallTaskClass = ReturnType<typeof createQuickInstallTaskClass>;
export type QuickInstallTask = InstanceType<QuickInstallTaskClass>;
