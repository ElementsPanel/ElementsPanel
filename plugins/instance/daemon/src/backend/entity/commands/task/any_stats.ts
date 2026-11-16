import disk_limit_service from "../../../service/disk_limit_service";
import Instance from "../../instance/instance";
import { ILifeCycleTask } from "../../instance/life_cycle";
import { instanceSetting } from "../../../instance_settings";

export default class InstanceDiskCheckTask implements ILifeCycleTask {
  public status: number = 0;
  public name: string = "AnyInstanceStats";

  private task: any = null;

  async start(instance: Instance) {
    if (this.task) return;
    const schedule = () => {
      this.task = setTimeout(
        () => {
          void disk_limit_service.checkInstanceDiskSize(instance);
          schedule();
        },
        1000 * instanceSetting("instanceDiskCheckIntervalSeconds")
      );
    };
    schedule();
  }

  async stop(instance: Instance) {
    clearTimeout(this.task);
    this.task = null;
    instance.info = {
      ...instance.info,
      storageUsage: 0,
      storageLimit: instance.config.docker?.maxSpace ?? 0
    };
  }
}
