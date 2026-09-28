import Instance from "./instance";
import logger from "../../service/log";

export interface ILifeCycleTask {
  name: string; // task name
  status: number; // Running status, the default is 0, the task manager will automatically change
  start: (instance: Instance) => Promise<void>;
  stop: (instance: Instance) => Promise<void>;
}

export class LifeCycleTaskManager {
  // list of life cycle tasks
  public readonly lifeCycleTask: ILifeCycleTask[] = [];
  private readonly pending = new WeakMap<
    ILifeCycleTask,
    { type: 1 | 0; promise: Promise<void> }
  >();
  private retired: Promise<void> = Promise.resolve();

  constructor(private self: Instance) {}

  registerLifeCycleTask(task: ILifeCycleTask) {
    this.lifeCycleTask.push(task);
  }

  execLifeCycleTask(type: 1 | 0): Promise<void> {
    return Promise.all(this.lifeCycleTask.map((task) => this.transition(task, type))).then(() => {});
  }

  private transition(task: ILifeCycleTask, type: 1 | 0): Promise<void> {
    const previous = this.pending.get(task);
    if (previous?.type === type) return previous.promise;
    if (!previous && task.status === type) return Promise.resolve();
    const promise = (previous?.promise ?? this.retired).then(async () => {
      if (task.status === type) return;
      try {
        await (type === 1 ? task.start(this.self) : task.stop(this.self));
        task.status = type;
      } catch (error) {
        logger.error(`Instance lifecycle task ${task.name} failed:`, error);
        if (type === 1) {
          // A failed start may already own resources. Release them before retrying.
          task.status = 1;
          try {
            await task.stop(this.self);
            task.status = 0;
          } catch (cleanupError) {
            logger.error(`Instance lifecycle task ${task.name} cleanup failed:`, cleanupError);
          }
        }
      }
    });
    this.pending.set(task, { type, promise });
    void promise.then(() => {
      if (this.pending.get(task)?.promise === promise) this.pending.delete(task);
    });
    return promise;
  }

  clearLifeCycleTask(): Promise<void> {
    const tasks = this.lifeCycleTask.splice(0);
    const stopping = tasks.map((task) => this.transition(task, 0));
    // Newly registered tasks wait until the previous dispatcher's tasks stop.
    this.retired = Promise.all([this.retired, ...stopping]).then(() => {});
    return this.retired;
  }
}
