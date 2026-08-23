import archiver from "archiver";
import fs from "fs-extra";
import path from "path";
import { v4 } from "uuid";
import { GitignoreMatcher } from "../../common/gitignore_matcher";
import { globalConfiguration } from "../../entity/config";
import Instance from "../../entity/instance/instance";
import { $t } from "../../i18n";
import logger from "../log";
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
            const backupFormat = globalConfiguration.config.instanceBackupFormat === "tar.gz"
                ? "tar.gz"
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
            
            const output = fs.createWriteStream(targetArchivePath);
            const archive = backupFormat === "tar.gz"
                ? archiver("tar", { gzip: true, gzipOptions: { level: compressionLevel } })
                : archiver("zip", { zlib: { level: compressionLevel } });
            
            archive.pipe(output);
            
            for (const file of allFiles) {
                archive.file(path.join(instanceCwd, file.filePath), { name: file.filePath });
            }
            
            let lastPercent = -1;
            const progressPrefix = `\x1b[K\r`;
            
            const progressInterval = setInterval(() => {
                const processedBytes = archive.pointer();
                const percent = totalSize > 0 ? Math.floor((processedBytes / totalSize) * 100) : 0;
                if (percent !== lastPercent) {
                    lastPercent = percent;
                    const barLength = 30;
                    const filled = Math.floor((percent / 100) * barLength);
                    const empty = barLength - filled;
                    const bar = '[' + '#'.repeat(filled) + ' '.repeat(empty) + ']';
                    const progressText = `${progressPrefix}${bar} ${percent}%`;
                    this.instance.print(progressText);
                }
            }, 200);
            
            await new Promise<void>((resolve, reject) => {
                output.on('close', () => {
                    clearInterval(progressInterval);
                    const barLength = 30;
                    const bar = '[' + '#'.repeat(barLength) + ']';
                    const progressText = `${progressPrefix}${bar} 100%`;
                    this.instance.print(progressText);
                    resolve();
                });
                archive.on('error', (err) => {
                    clearInterval(progressInterval);
                    reject(err);
                });
                archive.finalize();
            });
            
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
