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
      return instance.failure(new StartupError($t("TXT_CODE_start.instanceNotDown")));

    // Claim the state before the first await so two starts cannot both proceed.
    instance.setLock(true);
    instance.status(Instance.STATUS_STARTING);
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
            throw new Error($t("TXT_CODE_start.instanceMaturity"));
          }
        }
      }

      instance.println("INFO", $t("TXT_CODE_start.startInstance"));

      // prevent the dead-loop from starting
      await this.sleep();

      // check the disk space
      if (instance.config.docker?.maxSpace && instance.config.docker.maxSpace > 0) {
        instance.println("INFO", $t("TXT_CODE_2d7b8a91"));
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
            $t(
              "TXT_CODE_e5938389",
              {
                storageLimit: result?.storageLimit,
                storageUsage: result?.storageUsage
              }
            )
          );
        } else {
          instance.println(
            "INFO",
            $t("TXT_CODE_85e29331", {
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
    } finally {
      instance.setLock(false);
    }
  }

  protected abstract createProcess(instance: Instance): Promise<void>;
}
