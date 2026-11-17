import { sleep } from "../../../tools/time";
import Instance from "../../instance/instance";
import InstanceCommand from "../base/command";

export default class GeneralKillCommand extends InstanceCommand {
  constructor() {
    super("KillCommand");
  }

  async exec(instance: Instance) {
    if (instance.status() === Instance.STATUS_STOP) return;
    instance.setUserRequestedStop(true);

    // Block forced termination during the first six seconds.
    const waitTime = instance.startTimestamp + 6 * 1000 - Date.now();
    if (instance.startTimestamp && waitTime > 0) {
      await sleep(waitTime);
    }

    instance.ignoreEventTaskOnce();

    const task = instance?.asynchronousTask;
    if (task && typeof task.stop === "function") {
      task.stop(instance).catch((err) => {
        instance.println(
          "ERROR",
          `Instance ${instance.config.nickname} asynchronousTask stop failed: ${err}`
        );
      });
    }

    if (instance.process) {
      try {
        await instance.process.kill("SIGKILL");
      } catch (err) {
        instance.println(
          "ERROR",
          `Instance ${instance.config.nickname} process kill failed: ${err}`
        );
      }
    }
  }
}
