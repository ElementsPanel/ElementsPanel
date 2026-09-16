import archiver from "archiver";
import { spawn } from "child_process";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { v4 } from "uuid";
import type { DaemonPluginContext } from "../../../../src/plugin";
type InstanceEntity = any;
import { localeMessages } from "../i18n";

export const inject = ["i18n", "protocol", "instances", "tasks", "schedules", "features", "archive", "settings", "settingsForm"];

export function apply(ctx: DaemonPluginContext) {
  ctx.i18n.define(localeMessages);

  const BACKUP_FORMATS = ["zip", "tar.gz", "7z"];

  // Described, not drawn. The fields a backup actually reads live in the
  // daemon configuration, and the panel's plugin manager renders this
  // declaration; there is no browser half of a daemon plugin to put a form in.
  ctx.settingsForm.declare({
    fields: () => [
      {
        key: "instanceBackupPath",
        type: "string",
        title: ctx.i18n.$t("TXT_CODE_DBACKUP_PATH"),
        description: ctx.i18n.$t("TXT_CODE_DBACKUP_PATH_TIP")
      },
      {
        key: "instanceBackupFormat",
        type: "select",
        title: ctx.i18n.$t("TXT_CODE_DBACKUP_FORMAT"),
        options: BACKUP_FORMATS.map((format) => ({ value: format, label: format }))
      },
      {
        key: "instanceBackupCompressionLevel",
        type: "number",
        title: ctx.i18n.$t("TXT_CODE_DBACKUP_LEVEL"),
        description: ctx.i18n.$t("TXT_CODE_DBACKUP_LEVEL_TIP"),
        min: 0,
        max: 9
      },
      {
        key: "instanceBackupMaxSize",
        type: "number",
        title: ctx.i18n.$t("TXT_CODE_DBACKUP_MAX_SIZE"),
        description: ctx.i18n.$t("TXT_CODE_DBACKUP_MAX_SIZE_TIP"),
        min: 0
      }
    ],
    read: () => ({
      instanceBackupPath: ctx.settings.config.instanceBackupPath,
      instanceBackupFormat: ctx.settings.config.instanceBackupFormat,
      instanceBackupCompressionLevel: ctx.settings.config.instanceBackupCompressionLevel,
      instanceBackupMaxSize: ctx.settings.config.instanceBackupMaxSize
    }),
    write: (values) => {
      const config = ctx.settings.config;
      if (values.instanceBackupPath != null) {
        config.instanceBackupPath = String(values.instanceBackupPath);
      }
      const format = values.instanceBackupFormat;
      if (typeof format === "string" && BACKUP_FORMATS.includes(format)) {
        config.instanceBackupFormat = format;
      }
      const level = Number(values.instanceBackupCompressionLevel);
      if (Number.isInteger(level) && level >= 0 && level <= 9) {
        config.instanceBackupCompressionLevel = level;
      }
      const maxSize = Number(values.instanceBackupMaxSize);
      if (Number.isFinite(maxSize) && maxSize >= 0) {
        config.instanceBackupMaxSize = maxSize;
      }
      ctx.settings.save();
    }
  });

  const { AsyncTask, Center: TaskCenter } = ctx.tasks;
  const { GitignoreMatcher, decompressWithProgress, check7zipStatus, sevenZipPath, zipTimeoutSeconds } =
    ctx.archive;
  const Instance = ctx.instances.Instance;
  const t = ctx.i18n.$t;
  const protocol = ctx.protocol;
  const instances = ctx.instances.subsystem;
  const logger = ctx.logger;
  type InstanceBackupMatcher = InstanceType<typeof GitignoreMatcher>;

  const BACKUP_EXTENSIONS = [".zip", ".tar.gz", ".7z"];
  const GB_IN_BYTES = 1024 * 1024 * 1024;

  const getBackupDirPath = (instanceUuid: string) =>
    path.join(
      path.normalize(ctx.settings.config.instanceBackupPath || path.join(process.cwd(), "data/backups")),
      instanceUuid
    );

  // Returns the instance's backup archives, newest first. `time` is in milliseconds.
  const listBackupFiles = async (instanceUuid: string) => {
    const instanceBackupDir = getBackupDirPath(instanceUuid);
    if (!(await fs.pathExists(instanceBackupDir))) return [];
    const backups: Array<{ name: string; size: number; time: number }> = [];
    for (const file of await fs.readdir(instanceBackupDir)) {
      const lowerFileName = file.toLowerCase();
      if (!BACKUP_EXTENSIONS.some((extension) => lowerFileName.endsWith(extension))) continue;
      const stat = await fs.stat(path.join(instanceBackupDir, file)).catch(() => null);
      if (!stat?.isFile()) continue;
      backups.push({ name: file, size: stat.size, time: stat.birthtimeMs || stat.ctimeMs });
    }
    return backups.sort((a, b) => b.time - a.time);
  };

  // One instance may store at most `instanceBackupMaxSize` GB of backup archives
  // (0 = unlimited). A new backup is only allowed while the space left is at
  // least as large as the average size of the archives already stored, so the
  // archive about to be written stays within the budget.
  const getBackupBudget = (backups: Array<{ size: number }>) => {
    const limitGb = Number(ctx.settings.config.instanceBackupMaxSize);
    const unlimited = !Number.isFinite(limitGb) || limitGb <= 0;
    const usedBytes = backups.reduce((total, backup) => total + backup.size, 0);
    const averageBytes = backups.length > 0 ? usedBytes / backups.length : 0;
    return {
      unlimited,
      limitGb,
      usedBytes,
      averageBytes,
      exceeded: !unlimited && limitGb * GB_IN_BYTES - usedBytes < averageBytes
    };
  };

  const toGigabytes = (bytes: number) => (bytes / GB_IN_BYTES).toFixed(2);

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
        const budget = getBackupBudget(await listBackupFiles(this.instance.instanceUuid));
        if (budget.exceeded) {
          throw new Error(
            t("TXT_CODE_INSTANCE_BACKUP_QUOTA_EXCEEDED", {
              limit: String(budget.limitGb),
              used: toGigabytes(budget.usedBytes),
              average: toGigabytes(budget.averageBytes)
            })
          );
        }

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
  // A scheduled backup must not be blocked by a full budget, so the oldest
  // archives are dropped until a new one fits. The task's own check then passes.
  const freeBackupBudget = async (instance: InstanceEntity) => {
    const instanceBackupDir = getBackupDirPath(instance.instanceUuid);
    let backups = await listBackupFiles(instance.instanceUuid);
    let budget = getBackupBudget(backups);
    while (budget.exceeded && backups.length > 0) {
      const oldest = backups[backups.length - 1];
      await fs.remove(path.join(instanceBackupDir, oldest.name));
      instance.println(
        "INFO",
        t("TXT_CODE_INSTANCE_BACKUP_AUTO_DELETE_OLDEST", { name: oldest.name })
      );
      backups = await listBackupFiles(instance.instanceUuid);
      budget = getBackupBudget(backups);
    }
  };

  ctx.schedules.register("backup", async (instance) => {
    const runningBackup = TaskCenter.getTasks(InstanceBackupTask.TYPE).find(
      (task) => task.toObject().instanceUuid === instance.instanceUuid && task.status() === 1
    );
    const backupTask = runningBackup || createBackupTask(instance);
    if (!runningBackup) {
      await freeBackupBudget(instance);
      TaskCenter.addTask(backupTask);
    }
    await (backupTask as unknown as { wait(): Promise<void> }).wait();
  });

  ctx.protocol.on("instance/backup/list", async (routerCtx, data) => {
    try {
      const instanceUuid = data.instanceUuid;
      if (!instances.getInstance(instanceUuid)) throw new Error(t("TXT_CODE_3bfb9e04"));
      const backups = await listBackupFiles(instanceUuid);
      protocol.response(
        routerCtx,
        backups.map((backup) => ({ ...backup, time: new Date(backup.time).toLocaleString() }))
      );
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
