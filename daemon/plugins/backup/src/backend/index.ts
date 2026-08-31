import archiver from "archiver";
import { spawn } from "child_process";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { v4 } from "uuid";
import type { DaemonPluginContext } from "../../../../src/plugin";
import type InstanceEntity from "../../../../src/entity/instance/instance";
import { localeMessages } from "../i18n";

export const inject = ["i18n", "protocol", "instances", "tasks", "schedules", "features", "archive", "settings"];

export function apply(ctx: DaemonPluginContext) {
  ctx.i18n.define(localeMessages);

  const { AsyncTask, Center: TaskCenter } = ctx.tasks;
  const { GitignoreMatcher, decompressWithProgress, check7zipStatus, sevenZipPath, zipTimeoutSeconds } =
    ctx.archive;
  const Instance = ctx.instances.Instance;
  const t = ctx.i18n.$t;
  const protocol = ctx.protocol;
  const instances = ctx.instances.subsystem;
  const logger = ctx.logger;
  type InstanceBackupMatcher = InstanceType<typeof GitignoreMatcher>;

  class InstanceBackupTask extends AsyncTask {
    public static readonly TYPE = "InstanceBackupTask";

    private backupPath = "";
    private backupFileName = "";

    constructor(private readonly instance: InstanceEntity) {
      super();
      this.taskId = `${InstanceBackupTask.TYPE}-${instance.instanceUuid}-${v4()}`;
      this.type = InstanceBackupTask.TYPE;
    }

    async onStart() {
      try {
        this.instance.println("INFO", t("TXT_CODE_INSTANCE_BACKUP_START"));

        const configuredPath = ctx.settings.config.instanceBackupPath;
        this.backupPath = path.normalize(configuredPath || path.join(process.cwd(), "data/backups"));
        await fs.ensureDir(this.backupPath);

        if (this.instance.status() !== Instance.STATUS_STOP) {
          this.instance.println("INFO", t("TXT_CODE_INSTANCE_BACKUP_STOPPING"));
          await this.instance.execPreset("stop");
          let retry = 0;
          while (this.instance.status() !== Instance.STATUS_STOP && retry < 60) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            retry++;
          }
          if (this.instance.status() !== Instance.STATUS_STOP) {
            throw new Error(t("TXT_CODE_INSTANCE_BACKUP_STOP_TIMEOUT"));
          }
        }

        this.instance.status(Instance.STATUS_BUSY);
        this.instance.println("INFO", t("TXT_CODE_INSTANCE_BACKUP_COMPRESSING"));

        const now = new Date();
        const dateStr =
          now.getFullYear() +
          "-" +
          String(now.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(now.getDate()).padStart(2, "0") +
          "_" +
          String(now.getHours()).padStart(2, "0") +
          "-" +
          String(now.getMinutes()).padStart(2, "0") +
          "-" +
          String(now.getSeconds()).padStart(2, "0");
        const backupId = v4().split("-")[0];
        const configuredFormat = ctx.settings.config.instanceBackupFormat;
        const backupFormat =
          configuredFormat === "tar.gz" || configuredFormat === "7z" ? configuredFormat : "zip";
        const configuredLevel = ctx.settings.config.instanceBackupCompressionLevel;
        const compressionLevel = Number.isInteger(configuredLevel)
          ? Math.min(9, Math.max(0, configuredLevel))
          : 9;
        this.backupFileName = `${backupId}-${dateStr}.${backupFormat}`;

        const instanceBackupDir = path.join(this.backupPath, this.instance.instanceUuid);
        await fs.ensureDir(instanceBackupDir);
        const targetArchivePath = path.join(instanceBackupDir, this.backupFileName);
        const instanceCwd = this.instance.absoluteCwdPath();

        const epbaklstPath = path.join(instanceCwd, ".epbaklst");
        let gitignoreMatcher: InstanceBackupMatcher | null = null;
        let blacklistedCount = 0;

        if (await fs.pathExists(epbaklstPath)) {
          const content = await fs.readFile(epbaklstPath, "utf-8");
          const firstLine = content.split(/\r?\n/)[0]?.trim() || "";
          const whitelistMode = firstLine.toLowerCase() === "$white";
          gitignoreMatcher = new GitignoreMatcher(content, instanceCwd, whitelistMode);
        }

        const whitelistMode = gitignoreMatcher ? gitignoreMatcher.isWhitelistMode() : false;
        const allFiles: { filePath: string; stat: fs.Stats }[] = [];
        let totalSize = 0;

        const walkDir = async (
          dir: string,
          relativePath = "",
          whitelistedParent = false
        ): Promise<void> => {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relPath = path.join(relativePath, entry.name);
            if (entry.isDirectory()) {
              let dirWhitelisted = whitelistedParent;
              if (!dirWhitelisted && gitignoreMatcher) {
                const dirIgnored = gitignoreMatcher.isIgnored(relPath, true);
                if (whitelistMode) {
                  dirWhitelisted = !dirIgnored;
                } else if (dirIgnored) {
                  blacklistedCount++;
                  continue;
                }
              }
              await walkDir(fullPath, relPath, dirWhitelisted);
            } else {
              if (
                !whitelistedParent &&
                gitignoreMatcher &&
                gitignoreMatcher.isIgnored(relPath, false)
              ) {
                blacklistedCount++;
                continue;
              }
              const stat = await fs.stat(fullPath);
              allFiles.push({ filePath: relPath, stat });
              totalSize += stat.size;
            }
          }
        };

        await walkDir(instanceCwd);
        if (gitignoreMatcher && blacklistedCount > 0) {
          this.instance.println(
            "INFO",
            t("TXT_CODE_INSTANCE_BACKUP_EXCLUDED", { num: String(blacklistedCount) })
          );
        }

        const progressPrefix = `\x1b[K\r`;
        let lastPercent = -1;
        const printProgress = (percent: number) => {
          const normalizedPercent = Math.min(100, Math.max(0, Math.floor(percent)));
          if (normalizedPercent <= lastPercent) return;
          lastPercent = normalizedPercent;
          const barLength = 30;
          const filled = Math.floor((normalizedPercent / 100) * barLength);
          const empty = barLength - filled;
          const bar = "[" + "#".repeat(filled) + " ".repeat(empty) + "]";
          this.instance.print(`${progressPrefix}${bar} ${normalizedPercent}%`);
        };

        if (backupFormat === "7z") {
          if (!(await check7zipStatus())) throw new Error(t("TXT_CODE_a0ede210"));
          const absoluteTargetArchivePath = path.resolve(targetArchivePath);
          const listFilePath = path.join(
            os.tmpdir(),
            `elements-panel-instance-backup-${backupId}.lst`
          );
          try {
            await fs.writeFile(
              listFilePath,
              allFiles.map((file) => file.filePath.replace(/\\/g, "/")).join("\n"),
              "utf8"
            );
            const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
              const child = spawn(
                sevenZipPath,
                [
                  "a",
                  absoluteTargetArchivePath,
                  "-t7z",
                  `-mx=${compressionLevel}`,
                  "-scsUTF-8",
                  "-spd",
                  "-bsp1",
                  `@${listFilePath}`
                ],
                { cwd: instanceCwd, windowsHide: true }
              );
              let stdout = "";
              let stderr = "";
              let progressOutput = "";
              let settled = false;
              const timeout = setTimeout(() => {
                child.kill();
                if (!settled) {
                  settled = true;
                  reject(new Error(t("TXT_CODE_1d1ec400")));
                }
              }, zipTimeoutSeconds * 1000);
              const consume = (chunk: Buffer, isStderr: boolean) => {
                const text = chunk.toString();
                if (isStderr) {
                  stderr += text;
                } else {
                  stdout += text;
                  progressOutput = `${progressOutput}${text}`.slice(-128);
                  const matches = progressOutput.match(/(?:^|\D)(\d{1,3})%/g) || [];
                  for (const match of matches) {
                    const percent = Number(match.match(/\d+/)?.[0]);
                    if (Number.isFinite(percent)) printProgress(percent);
                  }
                  const lastPercentIndex = progressOutput.lastIndexOf("%");
                  if (lastPercentIndex >= 0) progressOutput = progressOutput.slice(lastPercentIndex + 1);
                }
              };
              printProgress(0);
              child.stdout.on("data", (chunk: Buffer) => consume(chunk, false));
              child.stderr.on("data", (chunk: Buffer) => consume(chunk, true));
              child.on("error", (error) => {
                clearTimeout(timeout);
                if (!settled) {
                  settled = true;
                  reject(error);
                }
              });
              child.on("close", (code) => {
                clearTimeout(timeout);
                if (settled) return;
                settled = true;
                if (code === 0) resolve({ stdout, stderr });
                else reject(new Error(`${stdout}\n${stderr}`.trim() || `7-Zip exited with code ${code}`));
              });
            });
            const output = `${result.stdout}\n${result.stderr}`;
            const archiveStat = await fs.stat(absoluteTargetArchivePath).catch(() => null);
            if (!archiveStat?.isFile() || archiveStat.size === 0) {
              throw new Error(output.trim() || t("TXT_CODE_11ecd5a9"));
            }
            printProgress(100);
          } catch (error) {
            await fs.remove(absoluteTargetArchivePath).catch(() => undefined);
            throw error;
          } finally {
            await fs.remove(listFilePath).catch(() => undefined);
          }
        } else {
          const output = fs.createWriteStream(targetArchivePath);
          const archive =
            backupFormat === "tar.gz"
              ? archiver("tar", { gzip: true, gzipOptions: { level: compressionLevel } })
              : archiver("zip", { zlib: { level: compressionLevel } });
          archive.pipe(output);
          for (const file of allFiles) {
            archive.file(path.join(instanceCwd, file.filePath), { name: file.filePath });
          }
          const progressInterval = setInterval(() => {
            const processedBytes = archive.pointer();
            printProgress(totalSize > 0 ? (processedBytes / totalSize) * 100 : 0);
          }, 200);
          await new Promise<void>((resolve, reject) => {
            output.on("close", () => {
              clearInterval(progressInterval);
              printProgress(100);
              resolve();
            });
            archive.on("error", (err) => {
              clearInterval(progressInterval);
              reject(err);
            });
            archive.finalize();
          });
        }

        this.instance.print("\n");
        this.instance.println(
          "INFO",
          t("TXT_CODE_INSTANCE_BACKUP_SUCCESS", { name: this.backupFileName })
        );
        logger.info(`Instance backup success: ${this.instance.config.nickname} -> ${targetArchivePath}`);
        await this.stop();
      } catch (error: any) {
        this.instance.println(
          "ERROR",
          t("TXT_CODE_INSTANCE_BACKUP_FAILED", { err: error.message })
        );
        await this.error(error);
      } finally {
        this.instance.status(Instance.STATUS_STOP);
      }
    }

    async onStop() {
      this.instance.print("\n");
    }

    async onError(error: Error) {
      logger.error(`InstanceBackupTask Error: ${error.message}`);
    }

    toObject() {
      return {
        taskId: this.taskId,
        status: this.status(),
        instanceUuid: this.instance.instanceUuid,
        backupFileName: this.backupFileName,
        backupPath: this.backupPath
      };
    }
  }

  const createBackupTask = (instance: InstanceEntity) => new InstanceBackupTask(instance);
  const getBackupPath = (instanceUuid: string, backupName: unknown) => {
    if (typeof backupName !== "string" || !backupName || path.basename(backupName) !== backupName) {
      throw new Error(t("TXT_CODE_Instance_router.accessFileErr"));
    }
    const backupRoot = path.resolve(
      ctx.settings.config.instanceBackupPath || path.join(process.cwd(), "data/backups")
    );
    const instanceBackupDir = path.resolve(backupRoot, instanceUuid);
    const archivePath = path.resolve(instanceBackupDir, backupName);
    const relativePath = path.relative(instanceBackupDir, archivePath);
    if (
      !relativePath ||
      relativePath === ".." ||
      relativePath.startsWith(".." + path.sep) ||
      path.isAbsolute(relativePath)
    ) {
      throw new Error(t("TXT_CODE_Instance_router.accessFileErr"));
    }
    return archivePath;
  };

  ctx.tasks.register("instance_backup", {
    type: InstanceBackupTask.TYPE,
    create: createBackupTask
  });
  ctx.schedules.register("backup", async (instance) => {
    const runningBackup = TaskCenter.getTasks(InstanceBackupTask.TYPE).find(
      (task) => task.toObject().instanceUuid === instance.instanceUuid && task.status() === 1
    );
    const backupTask = runningBackup || createBackupTask(instance);
    if (!runningBackup) TaskCenter.addTask(backupTask);
    await (backupTask as unknown as { wait(): Promise<void> }).wait();
  });

  ctx.protocol.on("instance/backup/list", async (routerCtx, data) => {
    try {
      const instanceUuid = data.instanceUuid;
      if (!instances.getInstance(instanceUuid)) throw new Error(t("TXT_CODE_3bfb9e04"));
      const instanceBackupDir = path.join(
        path.normalize(ctx.settings.config.instanceBackupPath || path.join(process.cwd(), "data/backups")),
        instanceUuid
      );
      if (!fs.existsSync(instanceBackupDir)) return protocol.response(routerCtx, []);
      const backups: Array<{ name: string; size: number; time: string }> = [];
      for (const file of await fs.readdir(instanceBackupDir)) {
        const lowerFileName = file.toLowerCase();
        if (!lowerFileName.endsWith(".zip") && !lowerFileName.endsWith(".tar.gz") && !lowerFileName.endsWith(".7z")) continue;
        const stat = await fs.stat(path.join(instanceBackupDir, file));
        backups.push({
          name: file,
          size: stat.size,
          time: new Date(stat.birthtimeMs || stat.ctimeMs).toLocaleString()
        });
      }
      backups.sort((a, b) => {
        const statA = fs.statSync(path.join(instanceBackupDir, a.name));
        const statB = fs.statSync(path.join(instanceBackupDir, b.name));
        return (statB.birthtimeMs || statB.ctimeMs) - (statA.birthtimeMs || statA.ctimeMs);
      });
      protocol.response(routerCtx, backups);
    } catch (error: any) {
      protocol.responseError(routerCtx, error);
    }
  });

  ctx.protocol.on("instance/backup/delete", async (routerCtx, data) => {
    try {
      if (!instances.getInstance(data.instanceUuid)) throw new Error(t("TXT_CODE_3bfb9e04"));
      const filePath = getBackupPath(data.instanceUuid, data.backupName);
      if (fs.existsSync(filePath)) await fs.remove(filePath);
      protocol.response(routerCtx, true);
    } catch (error: any) {
      protocol.responseError(routerCtx, error);
    }
  });

  ctx.protocol.on("instance/backup/restore", async (routerCtx, data) => {
    try {
      const instance = instances.getInstance(data.instanceUuid);
      if (!instance) throw new Error(t("TXT_CODE_3bfb9e04"));
      if (instance.status() !== Instance.STATUS_STOP) {
        if (instance.status() === Instance.STATUS_BUSY) {
          throw new Error(t("TXT_CODE_instanceConf.instanceBusy"));
        }
        if (instance.status() === Instance.STATUS_RUNNING || instance.status() === Instance.STATUS_STARTING) {
          instance.println("INFO", t("TXT_CODE_INSTANCE_BACKUP_STOPPING"));
          await instance.execPreset("stop");
        }
        let stopSuccess = false;
        for (let i = 0; i < 60; i++) {
          if (instance.status() === Instance.STATUS_STOP) {
            stopSuccess = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (!stopSuccess) throw new Error(t("TXT_CODE_INSTANCE_BACKUP_STOP_TIMEOUT"));
      }
      const archivePath = getBackupPath(data.instanceUuid, data.backupName);
      if (!fs.existsSync(archivePath)) throw new Error(t("TXT_CODE_Instance_router.accessFileErr"));
      instance.status(Instance.STATUS_BUSY);
      instance.println("INFO", t("TXT_CODE_INSTANCE_BACKUP_RESTORING"));
      (async () => {
        try {
          const destDir = instance.absoluteCwdPath();
          const progressPrefix = `\x1b[K\r`;
          let lastPercent = -1;
          await decompressWithProgress(
            archivePath,
            destDir,
            (percent: number) => {
              if (percent === lastPercent) return;
              lastPercent = percent;
              const barLength = 30;
              const filled = Math.floor((percent / 100) * barLength);
              const bar = "[" + "#".repeat(filled) + " ".repeat(barLength - filled) + "]";
              instance.print(`${progressPrefix}${bar} ${percent}%`);
            },
            instance.config.fileCode
          );
          instance.print("\n");
          instance.println("INFO", t("TXT_CODE_INSTANCE_BACKUP_RESTORE_SUCCESS"));
        } catch (error: any) {
          instance.print("\n");
          logger.error(t("TXT_CODE_INSTANCE_BACKUP_RESTORE_FAILED", { err: error.message }));
          instance.println("ERROR", t("TXT_CODE_INSTANCE_BACKUP_RESTORE_FAILED", { err: error.message }));
        } finally {
          instance.status(Instance.STATUS_STOP);
        }
      })();
      protocol.response(routerCtx, true);
    } catch (error: any) {
      protocol.responseError(routerCtx, error);
    }
  });

  ctx.features.add("instanceBackup");
}
