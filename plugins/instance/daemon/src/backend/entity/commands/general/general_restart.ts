import { $t } from "../../../i18n";
import Instance from "../../instance/instance";
import InstanceCommand from "../base/command";

export default class GeneralRestartCommand extends InstanceCommand {
  constructor() {
    super("GeneralRestartCommand");
  }

  async exec(instance: Instance) {
    try {
      instance.ignoreEventTaskOnce();
      instance.println("INFO", $t("TXT_CODE_RESTART_START"));
      instance.setLock(true);
      try {
        await instance.execPreset("stop");
      } catch (error) {
      }
      const startCount = instance.startCount;
      const task = setInterval(async () => {
        try {
          if (startCount !== instance.startCount) {
            throw new Error($t("TXT_CODE_RESTART_ERROR1"));
          }
          if (
            instance.status() !== Instance.STATUS_STOPPING &&
            instance.status() !== Instance.STATUS_STOP
          ) {
            throw new Error($t("TXT_CODE_RESTART_ERROR2"));
          }
          if (instance.status() === Instance.STATUS_STOP) {
            instance.println("INFO", $t("TXT_CODE_RESTART_RESTARTING"));
            instance.setLock(false);
            clearInterval(task);
            await instance.execPreset("start");
          }
        } catch (error: any) {
          clearInterval(task);
          instance.setLock(false);
          instance.failure(error);
        }
      }, 1000);
    } catch (error: any) {
      instance.setLock(false);
      instance.failure(error);
    }
  }
}
