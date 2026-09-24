import axios from "axios";
import { createHash } from "crypto";
import fs from "fs-extra";
import path from "path";
import { pipeline, Readable } from "stream";
import { v4 } from "uuid";
type InstanceEntity = any;
type IAsyncTaskJSON = any;
import type { DaemonInstancesService, DaemonPluginContext } from "../../../../src/plugin";

export interface InstallDownloadOptions {
  fileName?: string;
  sha256?: string;
  hashMismatchMessage?: string;
  headers?: Record<string, string>;
  timeout?: number;
  /** A public description for logs when the download URL contains credentials. */
  sourceLabel?: string;
}

/** Shared instance installation lifecycle; consumers supply their own package policy. */
export function createInstanceInstallTaskClass(
  ctx: DaemonPluginContext,
  services: Omit<DaemonInstancesService, "InstallTask">
) {
  const { AsyncTask } = ctx.tasks;
  const {
    Instance,
    Config: InstanceConfig,
    UpdateAction: InstanceUpdateAction,
    fileManager: getFileManager,
    headers: getCommonHeaders,
    subsystem: instances
  } = services;
  const $t = ctx.i18n.$t;
  const logger = ctx.logger;
  type InstanceUpdateTask = InstanceType<typeof InstanceUpdateAction>;

  return class InstanceInstallTask extends AsyncTask {
    public static TYPE = "InstanceInstallTask";

    public instance: InstanceEntity;
    public readonly TMP_ZIP_NAME = "mcsm_install_package.zip";
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
    protected cancelled = false;
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
      private readonly downloadOptions: InstallDownloadOptions = {}
    ) {
      super();
      this.extName = this.downloadOptions.fileName
        ? path.extname(this.downloadOptions.fileName)
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

      this.type = (new.target as typeof InstanceInstallTask).TYPE;
      this.taskId = `${this.type}-${this.instance.instanceUuid}-${v4()}`;
    }

    private async download() {
      this.abortController = new AbortController();
      if (!this.targetLink) throw new Error("No targetLink!");
      let downloadFileName = this.TMP_ZIP_NAME;
      if (this.downloadOptions.fileName) {
        downloadFileName = this.downloadOptions.fileName;
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
          ...this.downloadOptions.headers
        },
        timeout: this.downloadOptions.timeout ?? 0,
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
      const hash = this.downloadOptions.sha256 ? createHash("sha256") : undefined;

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

      if (hash && hash.digest("hex").toLowerCase() !== this.downloadOptions.sha256!.toLowerCase()) {
        await fs.remove(this.filePath);
        throw new Error(this.downloadOptions.hashMismatchMessage || "SHA-256 verification failed");
      }

      this.downloadProgress.percentage = 100;
      this.instance.println(
        "INFO",
        `Download "${this.downloadOptions.sourceLabel || this.targetLink}" success!!!`
      );
    }

    protected async runUpdate() {
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

    protected async installationConfig(): Promise<Partial<IGlobalInstanceConfig>> {
      return this.buildParams || {};
    }

    protected async install() {}

    protected updateFailed(error: Error) {
      throw error;
    }

    async onStart() {
      this.instance.print("\n");
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
        const config = await this.installationConfig();
        if (this.cancelled) return;
        logger.info(
          this.instance.config.nickname,
          this.instance.instanceUuid,
          "Source:",
          this.downloadOptions.sourceLabel || this.targetLink
        );
        logger.info($t("TXT_CODE_ac225d07") + JSON.stringify(config));

        this.instance.resetConfigWithoutDocker();
        this.instance.parameters(config, true);
        await this.install();
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
            this.updateFailed(error);
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
          "InstanceInstallTask -> onStop(): destroy download stream error: " + error?.message
        );
        logger.error("InstanceInstallTask -> onStop(): destroy download stream error: ", error);
      }

      try {
        await this.updateTask?.stop();
        this.updateTask = undefined;
      } catch (error: any) {
        this.instance.println(
          "ERROR",
          "InstanceInstallTask -> onStop(): updateTask stop error: " + error?.message
        );
        logger.error("InstanceInstallTask -> onStop(): updateTask stop error: ", error);
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
export type InstanceInstallTaskClass = ReturnType<typeof createInstanceInstallTaskClass>;
export type InstanceInstallTask = InstanceType<InstanceInstallTaskClass>;
