import fs from "node:fs";
import path from "node:path";
import Instance from "../entity/instance/instance";
import { $t } from "../i18n";
import { ConsumerQueue } from "../utils/queue";
import { sleep } from "../utils/sleep";

interface IDiskLimitItem {
  instance: Instance;
  workspace: string;
  maxSpace: number;
}

class DiskLimitService {
  private readonly queue = new ConsumerQueue<IDiskLimitItem>(2048);
  private task: NodeJS.Timeout | null = null;
  private checking: boolean = false;
  private concurrent = 2;

  constructor() {
    this.task = setInterval(() => {
      this.#startCheck();
    }, 1000 * 10);
  }

  async checkInstanceDiskSize(instance: Instance) {
    const workspace = instance.absoluteCwdPath();
    const maxSpace = Number(instance.config.docker.maxSpace);
    this.queue.push({
      key: instance.instanceUuid,
      item: {
        instance,
        workspace,
        maxSpace
      }
    });
    this.#startCheck();
  }

  async #startCheck() {
    if (this.checking) return;
    this.checking = true;
    try {
      const promises = [];
      for (let i = 0; i < this.concurrent; i++) {
        const item = this.queue.pop();
        if (item) {
          promises.push(this.checkDiskNow(item));
        }
      }
      await Promise.all(promises);
    } finally {
      this.checking = false;
    }
  }

  async #stopInstance(instance: Instance) {
    if (instance.status() === Instance.STATUS_RUNNING) {
      const startCount = instance.startCount;
      instance.execPreset("stop");
      await sleep(1000 * 10);
      if (instance.status() !== Instance.STATUS_STOP && startCount === instance.startCount) {
        instance.println("ERROR", $t("TXT_CODE_COMMON_INSTANCE_SHUTDOWN_TIMEOUT_DUE_TO_INSUFFICIENT_STORAGE_SPACE_FORCE_STOPPING"));
        instance
          .execPreset("kill")
          .then(() => {})
          .catch((err) => {});
      }
    }
  }

  public async checkDiskNow(item: IDiskLimitItem, autoStop: boolean = true) {
    const { instance, workspace, maxSpace } = item;
    // Recheck the working directory because it may have changed since configuration was saved.
    if (['"', "'", "`", "$"].some((ch) => workspace.includes(ch)) || !fs.existsSync(workspace)) {
      instance.info.storageUsage = -1;
      instance.info.storageLimit = maxSpace;
      return;
    }

    // Traverse with Node.js APIs because du is unavailable on Windows.
    const diskUsageSizeBytes = await getDirectorySizeBytes(workspace);
    const diskUsageSizeMb = Math.ceil(diskUsageSizeBytes / (1024 * 1024));

    if (isNaN(Number(diskUsageSizeMb))) {
      instance.info.storageUsage = 0;
      instance.info.storageLimit = convertGBToBytes(maxSpace); // GB to bytes
    } else {
      instance.info.storageUsage = diskUsageSizeMb * 1024 * 1024; // MB to bytes
      instance.info.storageLimit = convertGBToBytes(maxSpace); // GB to bytes
    }

    const storageLimit = instance.info.storageLimit;
    const storageUsage = instance.info.storageUsage;

    if (autoStop) {
      if (storageUsage >= storageLimit && storageLimit > 0) {
        for (let i = 0; i < 3; i++) {
          instance.println(
            "WARNING",
            $t("TXT_CODE_COMMON_INSUFFICIENT_STORAGE_SPACE_YOUR_STORAGE_QUOTA_IS_GB_CURRENTLY_USED_GB", {
              storageLimit: convertBytesToGB(storageLimit),
              storageUsage: convertBytesToGB(storageUsage)
            })
          );
          instance.println("WARNING", $t("TXT_CODE_STORAGE_QUOTA_EXCEEDED_HINT"));
          await sleep(200);
        }
        this.#stopInstance(instance);
      }
    }

    return {
      isFull: storageUsage >= storageLimit && storageLimit > 0,
      storageLimit: convertBytesToGB(storageLimit),
      storageUsage: convertBytesToGB(storageUsage)
    };
  }
}

export function convertBytesToGB(bytes: number) {
  return Number((bytes / 1024 / 1024 / 1024).toFixed(2));
}

export function convertGBToBytes(gb: number) {
  return Number((gb * 1024 * 1024 * 1024).toFixed(2));
}

async function getDirectorySizeBytes(dirPath: string): Promise<number> {
  let totalSize = 0;
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += await getDirectorySizeBytes(fullPath);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.promises.stat(fullPath);
          totalSize += stat.size;
        } catch {
        }
      }
    }
  } catch {
    // Unreadable paths contribute zero to the directory total.
  }
  return totalSize;
}

export default new DiskLimitService();
