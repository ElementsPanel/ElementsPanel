import archiver from "archiver";
import { spawn } from "child_process";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { v4 } from "uuid";
import { GitignoreMatcher } from "../../common/gitignore_matcher";
import { SEVEN_ZIP_PATH, ZIP_TIMEOUT_SECONDS } from "../../const";
import { globalConfiguration } from "../../entity/config";
import Instance from "../../entity/instance/instance";
import { $t } from "../../i18n";
import logger from "../log";
import { check7zipStatus } from "../seven_zip_service";
import { AsyncTask, IAsyncTaskJSON, TaskCenter } from "./index";

export class InstanceBackupTask extends AsyncTask {
    public static TYPE = "InstanceBackupTask";

    private instance: Instance;
    private backupPath: string = "";
    private backupFileName: string = "";

    constructor(instance: Instance) {
        super();
        this.instance = instance;
        this.taskId = `${InstanceBackupTask.TYPE}-${this.instance.instanceUuid}-${v4()}`;
        this.type = InstanceBackupTask.TYPE;
    }

    async onStart() {
        try {
            this.instance.println("INFO", $t("TXT_CODE_INSTANCE_BACKUP_START"));

            let customBackupPath = globalConfiguration.config.instanceBackupPath;
            if (!customBackupPath) {
                customBackupPath = path.join(process.cwd(), "data/backups");
            }
            this.backupPath = path.normalize(customBackupPath);
            await fs.ensureDir(this.backupPath);

            if (this.instance.status() !== Instance.STATUS_STOP) {
                this.instance.println("INFO", $t("TXT_CODE_INSTANCE_BACKUP_STOPPING"));
                await this.instance.execPreset("stop");
                let retry = 0;
                while (this.instance.status() !== Instance.STATUS_STOP && retry < 60) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    retry++;
                }
                if (this.instance.status() !== Instance.STATUS_STOP) {
                    throw new Error($t("TXT_CODE_INSTANCE_BACKUP_STOP_TIMEOUT"));
                }
            }

            this.instance.status(Instance.STATUS_BUSY);
            this.instance.println("INFO", $t("TXT_CODE_INSTANCE_BACKUP_COMPRESSING"));

            const now = new Date();
            const dateStr = now.getFullYear() +
                "-" + String(now.getMonth() + 1).padStart(2, '0') +
                "-" + String(now.getDate()).padStart(2, '0') +
                "_" + String(now.getHours()).padStart(2, '0') +
                "-" + String(now.getMinutes()).padStart(2, '0') +
                "-" + String(now.getSeconds()).padStart(2, '0');

            const backupId = v4().split("-")[0];
            const configuredFormat = globalConfiguration.config.instanceBackupFormat;
            const backupFormat = configuredFormat === "tar.gz" || configuredFormat === "7z"
                ? configuredFormat
                : "zip";
            const configuredLevel = globalConfiguration.config.instanceBackupCompressionLevel;
            const compressionLevel = Number.isInteger(configuredLevel)
                ? Math.min(9, Math.max(0, configuredLevel))
                : 9;
            this.backupFileName = `${backupId}-${dateStr}.${backupFormat}`;

            const instanceBackupDir = path.join(this.backupPath, this.instance.instanceUuid);
            await fs.ensureDir(instanceBackupDir);
            const targetArchivePath = path.join(instanceBackupDir, this.backupFileName);

            const instanceCwd = this.instance.absoluteCwdPath();

            const epbaklstPath = path.join(instanceCwd, ".epbaklst");
            let gitignoreMatcher: GitignoreMatcher | null = null;
            let blacklistedCount = 0;

            if (await fs.pathExists(epbaklstPath)) {
                const content = await fs.readFile(epbaklstPath, "utf-8");
                const lines = content.split(/\r?\n/);
                const firstLine = lines.length > 0 ? lines[0].trim() : "";
                
                let whitelistMode = false;
                if (firstLine.startsWith("$")) {
                    const directive = firstLine.toLowerCase();
                    if (directive === "$white") {
                        whitelistMode = true;
                    } else if (directive === "$black") {
                        whitelistMode = false;
                    } else {
                        whitelistMode = false;
                    }
                } else {
                    whitelistMode = false;
                }

                gitignoreMatcher = new GitignoreMatcher(content, instanceCwd, whitelistMode);
                const rules = gitignoreMatcher.getRules();
            }

            const whitelistMode = gitignoreMatcher ? gitignoreMatcher.isWhitelistMode() : false;

            const allFiles: { filePath: string; stat: fs.Stats }[] = [];
            let totalSize = 0;

            async function walkDir(dir: string, relativePath: string = "", whitelistedParent: boolean = false) {
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
                            } else {
                                if (dirIgnored) {
                                    blacklistedCount++;
                                    continue;
                                }
                            }
                        }
                        await walkDir(fullPath, relPath, dirWhitelisted);
                    } else {
                        if (!whitelistedParent && gitignoreMatcher && gitignoreMatcher.isIgnored(relPath, false)) {
                            blacklistedCount++;
                            continue;
                        }
                        const stat = await fs.stat(fullPath);
                        allFiles.push({ filePath: relPath, stat });
                        totalSize += stat.size;
                    }
                }
            }

            await walkDir(instanceCwd);

            if (gitignoreMatcher && blacklistedCount > 0) {
                this.instance.println("INFO", $t("TXT_CODE_INSTANCE_BACKUP_EXCLUDED", { num: String(blacklistedCount) }));
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
                const bar = '[' + '#'.repeat(filled) + ' '.repeat(empty) + ']';
                this.instance.print(`${progressPrefix}${bar} ${normalizedPercent}%`);
            };

            if (backupFormat === "7z") {
                if (!await check7zipStatus()) {
                    throw new Error($t("TXT_CODE_a0ede210"));
                }

                // The 7-Zip process runs from the instance directory so that the
                // relative paths in the list file keep their directory layout.
                // Resolve the archive destination first; otherwise a relative
                // backup path would be resolved relative to the instance cwd.
                const absoluteTargetArchivePath = path.resolve(targetArchivePath);
                const listFilePath = path.join(os.tmpdir(), `elements-panel-instance-backup-${backupId}.lst`);
                try {
                    await fs.writeFile(
                        listFilePath,
                        allFiles.map((file) => file.filePath.replace(/\\/g, "/")).join("\n"),
                        "utf8"
                    );
                    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
                        const child = spawn(SEVEN_ZIP_PATH, [
                            "a",
                            absoluteTargetArchivePath,
                            "-t7z",
                            `-mx=${compressionLevel}`,
                            "-scsUTF-8",
                            "-spd",
                            "-bsp1",
                            `@${listFilePath}`
                        ], {
                            cwd: instanceCwd,
                            windowsHide: true
                        });
                        let stdout = "";
                        let stderr = "";
                        let progressOutput = "";
                        let settled = false;
                        const timeout = setTimeout(() => {
                            child.kill();
                            if (!settled) {
                                settled = true;
                                reject(new Error($t("TXT_CODE_1d1ec400")));
                            }
                        }, ZIP_TIMEOUT_SECONDS * 1000);
                        const consume = (chunk: Buffer, isStderr: boolean) => {
                            const text = chunk.toString();
                            if (isStderr) stderr += text;
                            else {
                                stdout += text;
                                progressOutput = `${progressOutput}${text}`.slice(-128);
                                const matches = progressOutput.match(/(?:^|\D)(\d{1,3})%/g) || [];
                                for (const match of matches) {
                                    const percent = Number(match.match(/\d+/)?.[0]);
                                    if (Number.isFinite(percent)) printProgress(percent);
                                }
                                const lastPercentIndex = progressOutput.lastIndexOf("%");
                                if (lastPercentIndex >= 0) {
                                    progressOutput = progressOutput.slice(lastPercentIndex + 1);
                                }
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
                        throw new Error(output.trim() || $t("TXT_CODE_11ecd5a9"));
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
                const archive = backupFormat === "tar.gz"
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

            this.instance.println("INFO", $t("TXT_CODE_INSTANCE_BACKUP_SUCCESS", { name: this.backupFileName }));
            logger.info(`Instance backup success: ${this.instance.config.nickname} -> ${targetArchivePath}`);

            this.stop();
        } catch (error: any) {
            this.instance.println("ERROR", $t("TXT_CODE_INSTANCE_BACKUP_FAILED", { err: error.message }));
            this.error(error);
        } finally {
            this.instance.status(Instance.STATUS_STOP);
        }
    }

    async onStop() {
        this.instance.print("\n");
    }

    async onError(err: Error) {
        logger.error(`InstanceBackupTask Error: ${err.message}`);
    }

    toObject(): IAsyncTaskJSON {
        return {
            taskId: this.taskId,
            status: this.status(),
            instanceUuid: this.instance.instanceUuid,
            backupFileName: this.backupFileName,
            backupPath: this.backupPath
        };
    }
}

export function createInstanceBackupTask(instance: Instance) {
    const task = new InstanceBackupTask(instance);
    TaskCenter.addTask(task);
    return task;
}
