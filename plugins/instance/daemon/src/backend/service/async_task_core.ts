import EventEmitter from "events";
import { logger } from "../runtime";

export type IAsyncTaskJSON = any;

export interface IAsyncTask extends EventEmitter {
  taskId: string;
  type: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): number;
  toObject(): IAsyncTaskJSON;
}

export abstract class AsyncTask extends EventEmitter implements IAsyncTask {
  static readonly STATUS_STOP = 0;
  static readonly STATUS_RUNNING = 1;
  static readonly STATUS_ERROR = -1;

  taskId = "";
  type = "";
  errorInfo?: Error;
  protected _status = AsyncTask.STATUS_STOP;
  private stopping?: Promise<void>;

  async start() {
    if (this._status === AsyncTask.STATUS_RUNNING) return;
    this.stopping = undefined;
    this.errorInfo = undefined;
    this._status = AsyncTask.STATUS_RUNNING;
    try {
      await this.onStart();
      if (this._status === AsyncTask.STATUS_RUNNING) this.emit("started");
    } catch (error: any) {
      await this.error(error);
      throw error;
    }
  }

  async exec(_: any, __?: any) {
    return this.start();
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    if (this._status === AsyncTask.STATUS_STOP) return Promise.resolve();
    this.stopping = Promise.resolve()
      .then(() => this.onStop())
      .finally(() => {
        if (this._status !== AsyncTask.STATUS_ERROR) this._status = AsyncTask.STATUS_STOP;
        this.emit("stopped");
      });
    return this.stopping;
  }

  async error(error: Error) {
    if (this._status === AsyncTask.STATUS_ERROR) return;
    this._status = AsyncTask.STATUS_ERROR;
    this.errorInfo = error;
    logger.error(`AsyncTask - ID: ${this.taskId} TYPE: ${this.type} Error:`, error);
    try {
      await this.onError(error);
    } catch (hookError) {
      logger.error("Async task error handler failed:", hookError);
    }
    if (this.listenerCount("error") > 0) this.emit("error", error);
    await this.stop().catch((stopError) => logger.error("Async task cleanup failed:", stopError));
  }

  wait() {
    return new Promise<void>((resolve, reject) => {
      if (this._status === AsyncTask.STATUS_STOP) return resolve();
      if (this._status === AsyncTask.STATUS_ERROR) return reject(this.errorInfo);
      const cleanup = () => {
        this.removeListener("stopped", onStopped);
        this.removeListener("error", onError);
      };
      const onStopped = () => {
        cleanup();
        if (this._status === AsyncTask.STATUS_ERROR) reject(this.errorInfo);
        else resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      this.once("stopped", onStopped);
      this.once("error", onError);
    });
  }

  status() {
    return this._status;
  }

  abstract onStart(): Promise<void>;
  abstract onStop(): Promise<void>;
  abstract onError(error: Error): Promise<void>;
  abstract toObject(): IAsyncTaskJSON;
}

export class TaskCenter {
  static tasks: IAsyncTask[] = [];

  static addTask(task: IAsyncTask) {
    this.tasks.push(task);
    task.on("stopped", () => this.onTaskStopped(task));
    task.on("error", () => this.onTaskError(task));
    void task.start().catch(() => {});
  }

  static onTaskStopped(task: IAsyncTask) {
    logger.info("Async Task:", task.taskId, "Stopped.");
  }

  static onTaskError(task: IAsyncTask) {
    logger.info("Async Task:", task.taskId, "Failed.");
  }

  static getTask(taskId: string, type?: string) {
    return this.tasks.find(
      (task) => task.taskId === taskId && (type == null || task.type === type)
    );
  }

  static getTasks(type?: string) {
    return this.tasks.filter((task) => type == null || task.type === type);
  }

  static deleteAllStoppedTask() {
    this.tasks = this.tasks.filter((task) => task.status() === AsyncTask.STATUS_RUNNING);
  }
}
