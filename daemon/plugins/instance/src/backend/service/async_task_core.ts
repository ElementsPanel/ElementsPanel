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

  async start() {
    this._status = AsyncTask.STATUS_RUNNING;
    try {
      await this.onStart();
      this.emit("started");
    } catch (error: any) {
      void this.error(error);
      throw error;
    }
  }

  async exec(_: any, __?: any) {
    return this.start();
  }

  async stop() {
    if (this._status === AsyncTask.STATUS_STOP) return;
    try {
      await this.onStop();
    } finally {
      if (this._status !== AsyncTask.STATUS_ERROR) this._status = AsyncTask.STATUS_STOP;
      this.emit("stopped");
    }
  }

  async error(error: Error) {
    this._status = AsyncTask.STATUS_ERROR;
    this.errorInfo = error;
    logger.error(`AsyncTask - ID: ${this.taskId} TYPE: ${this.type} Error:`, error);
    await this.onError(error);
    this.emit("error", error);
    void this.stop();
  }

  wait() {
    return new Promise<void>((resolve, reject) => {
      if (this._status === AsyncTask.STATUS_STOP) return resolve();
      if (this._status === AsyncTask.STATUS_ERROR) return reject(this.errorInfo);
      this.once("stopped", resolve);
      this.once("error", reject);
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
    void task.start();
    task.on("stopped", () => this.onTaskStopped(task));
    task.on("error", () => this.onTaskError(task));
  }

  static onTaskStopped(task: IAsyncTask) {
    logger.info("Async Task:", task.taskId, "Stopped.");
  }

  static onTaskError(task: IAsyncTask) {
    logger.info("Async Task:", task.taskId, "Failed.");
  }

  static getTask(taskId: string, type?: string) {
    return this.tasks.find((task) => task.taskId === taskId && (type == null || task.type === type));
  }

  static getTasks(type?: string) {
    return this.tasks.filter((task) => type == null || task.type === type);
  }

  static deleteAllStoppedTask() {
    this.tasks = this.tasks.filter((task) => task.status() === AsyncTask.STATUS_RUNNING);
  }
}
