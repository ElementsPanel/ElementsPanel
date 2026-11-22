import { ILifeCycleTask } from "../../instance/life_cycle";
import Instance from "../../instance/instance";

export default class TimeCheck implements ILifeCycleTask {
  public status: number = 0;
  public name: string = "TimeCheck";

  private task: any = null;

  async start(instance: Instance) {
    this.task = setInterval(
      async () => {
        if (instance.config.endTime) {
          const endTime = instance.config.endTime;
          if (endTime) {
            const currentTime = Date.now();
            if (endTime <= currentTime) {
              await instance.execPreset("kill");
              clearInterval(this.task);
            }
          }
        }
      },
      1000 * 60 * 60
    );
  }

  async stop(_instance: Instance) {
    clearInterval(this.task);
  }
}
