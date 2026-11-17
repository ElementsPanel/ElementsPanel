import fs from "fs-extra";
import { $t } from "../../i18n";
import disk_limit_service from "../../service/disk_limit_service";
import Instance from "../instance/instance";
import InstanceCommand from "./base/command";

export class StartupError extends Error {
  constructor(msg: string) {
    super(msg);
  }
}

export default abstract class AbsStartCommand extends InstanceCommand {
  private async sleep() {
    return new Promise((ok) => {
      setTimeout(ok, 1000 * 2);
    });
  }

  async exec(instance: Instance) {
    if (instance.status() !== Instance.STATUS_STOP)
      return instance.failure(new StartupError($t("TXT_CODE_START_INSTANCE_NOT_DOWN")));

    // Claim the state before the first await so two starts cannot both proceed.
    instance.setLock(true);
    instance.status(Instance.STATUS_STARTING);
    const starting = this.start(instance);
    instance.starting = starting;
    try {
      return await starting;
    } finally {
      instance.starting = undefined;
      instance.setLock(false);
    }
  }

  private async start(instance: Instance) {
    try {
      if (!fs.existsSync(instance.absoluteCwdPath())) {
        await fs.mkdirs(instance.absoluteCwdPath());
      }
      instance.startCount++;

      instance.startTimestamp = Date.now();

      if (instance.config.endTime) {
        const endTime = instance.config.endTime;
        if (endTime) {
          if (endTime <= instance.startTimestamp) {
            throw new Error($t("TXT_CODE_START_INSTANCE_MATURITY"));
          }
        }
      }

      instance.println("INFO", $t("TXT_CODE_START_START_INSTANCE"));

      // prevent the dead-loop from starting
      await this.sleep();

      // check the disk space
      if (instance.config.docker?.maxSpace && instance.config.docker.maxSpace > 0) {
        instance.println("INFO", $t("TXT_CODE_COMMON_CALCULATING_USED_STORAGE_SPACE_PLEASE_WAIT_PATIENTLY"));
        const result = await disk_limit_service.checkDiskNow(
          {
            instance,
            workspace: instance.absoluteCwdPath(),
            maxSpace: instance.config.docker.maxSpace
          },
          false
        );
        if (result?.isFull) {
          throw new StartupError(
            $t("TXT_CODE_COMMON_UNABLE_TO_START_INSUFFICIENT_STORAGE_SPACE_YOUR_STORAGE_QUOTA_IS_GB_CURRENTLY_USED_GB", {
              storageLimit: result?.storageLimit,
              storageUsage: result?.storageUsage
            })
          );
        } else {
          instance.println(
            "INFO",
            $t("TXT_CODE_COMMON_STORAGE_SPACE_IS_SUFFICIENT_CURRENTLY_USED_GB_GB", {
              storageUsage: result?.storageUsage,
              storageLimit: result?.storageLimit
            })
          );
        }
      }

      return await this.createProcess(instance);
    } catch (error: any) {
      // createProcess owns a child until started() hands it to the instance.
      // A delayed kill preset could otherwise kill a subsequent startup.
      await instance.releaseResources();
      instance.status(Instance.STATUS_STOP);
      instance.startTimestamp = 0;
      instance.failure(error);
    }
  }

  protected abstract createProcess(instance: Instance): Promise<void>;
}
