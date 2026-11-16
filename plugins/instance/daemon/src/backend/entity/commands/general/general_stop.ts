import { $t } from "../../../i18n";
import Instance from "../../instance/instance";
import InstanceCommand from "../base/command";
import { globalConfiguration } from "../../config";
import { instanceSetting } from "../../../instance_settings";

export default class GeneralStopCommand extends InstanceCommand {
  constructor() {
    super("StopCommand");
  }

  async exec(instance: Instance) {
    instance.setUserRequestedStop(true);
    const stopCommand = instance.config.stopCommand;
    if (instance.status() === Instance.STATUS_STOP || !instance.process)
      return instance.failure(new Error($t("TXT_CODE_general_stop.notRunning")));
    const process = instance.process;
    const cacheStartCount = instance.startCount;

    instance.status(Instance.STATUS_STOPPING);
    instance.ignoreEventTaskOnce();

    const stopCommandList = stopCommand.split("\n");
    for (const stopCommand of stopCommandList) {
      await instance.execPreset("command", stopCommand);
    }

    instance.print("\n");
    instance.println("INFO", $t("TXT_CODE_pty_stop.execCmd", { stopCommand: `\n${stopCommand}` }));

    if (instance.status() !== Instance.STATUS_STOPPING || instance.process !== process)
      return instance;
    const forceKill = globalConfiguration.config.instanceStopForceKill === true;

    instance.scheduleStopTimeout(instanceSetting("instanceStopTimeoutSeconds"), () => {
      if (
        instance.status() === Instance.STATUS_STOPPING &&
        instance.startCount === cacheStartCount &&
        instance.process === process
      ) {
        instance.println("ERROR", $t("TXT_CODE_general_stop.stopErr"));
        if (forceKill) {
          instance.println("WARNING", $t("TXT_CODE_INSTANCE_STOP_FORCE_KILL"));
          void Promise.resolve()
            .then(() => process.kill("SIGKILL"))
            .catch((error) => {
              instance.println("ERROR", String(error));
              if (instance.startCount === cacheStartCount && instance.process === process)
                instance.status(Instance.STATUS_RUNNING);
            });
        } else {
          instance.status(Instance.STATUS_RUNNING);
        }
      }
    });

    return instance;
  }
}
