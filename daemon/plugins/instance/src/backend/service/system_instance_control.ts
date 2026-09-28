import schedule from "node-schedule";
import StorageSubsystem from "../common/system_storage";
import Instance from "../entity/instance/instance";
import { $t } from "../i18n";
import { sleep } from "../utils/sleep";
import { fileSubsystem } from "./file_access";
import logger from "./log";
import { ctx as daemon } from "../plugin/context";
import InstanceSubsystem from "./system_instance";

export enum ScheduleActionTypeEnum {
  Delay = "delay",
  Command = "command",
  Stop = "stop",
  Start = "start",
  Restart = "restart",
  Kill = "kill"
}

export const ScheduleTypeEnum = {
  Interval: 1,
  Cycle: 2,
  Specify: 3
};

interface IScheduleAction {
  type: string;
  payload: string;
}

// Scheduled task configuration item interface
interface IScheduleTask {
  instanceUuid: string;
  name: string;
  count: number;
  time: string;
  action: string | undefined;
  payload: string | undefined;
  actions: IScheduleAction[];
  type: number;
}

// Scheduled task timer/periodic task interface
interface IScheduleJob {
  cancel: Function;
}

// @Entity
// Schedule task configuration data entity class
class TaskConfig implements IScheduleTask {
  instanceUuid = "";
  name = "";
  count = 1;
  time = "";
  action: string | undefined = undefined;
  payload: string | undefined = undefined;
  actions: IScheduleAction[] = [];
  type = 1;
}

class IntervalJob implements IScheduleJob {
  public job: ReturnType<typeof setInterval>;

  constructor(
    callback: () => void,
    public time: number
  ) {
    this.job = setInterval(callback, time * 1000);
  }

  cancel() {
    clearInterval(this.job);
  }
}

// Scheduled task instance class
class Task {
  public running = false;
  public cancelled = false;
  constructor(
    public config: TaskConfig,
    public job?: IScheduleJob
  ) {}
}

class InstanceControlSubsystem {
  public readonly taskMap = new Map<string, Array<Task>>();
  public readonly taskJobMap = new Map<string, schedule.Job>();

  constructor() {
    // Initialize all persistent data and load into memory one by one
    StorageSubsystem.list("TaskConfig").forEach((uuid: string) => {
      try {
        const config = StorageSubsystem.load("TaskConfig", TaskConfig, uuid) as TaskConfig;
        // load old task config
        if (config.action) {
          config.actions[config.actions.length] = {
            type: config.action,
            payload: config.payload || ""
          };
          config.action = undefined;
          config.payload = undefined;
          StorageSubsystem.store("TaskConfig", uuid, config);
        }
        this.registerScheduleJob(config, false);
      } catch (error: any) {
        // Some scheduled tasks may be left, but the upper limit will not change
        // Ignore the scheduled task registration at startup
      }
    });
  }

  public registerScheduleJob(task: IScheduleTask, needStore = true, replaceName?: string) {
    const key = `${task.instanceUuid}`;
    const registeredTasks = this.taskMap.get(key) || [];
    const previous =
      replaceName == null
        ? undefined
        : registeredTasks.find((entry) => entry.config.name === replaceName);
    if (replaceName != null && !previous) {
      throw new Error($t("TXT_CODE_system_instance_control.crateTaskErr", { name: replaceName }));
    }
    if (!previous && registeredTasks.length >= 8)
      throw new Error($t("TXT_CODE_system_instance_control.execLimit"));
    if (registeredTasks.some((entry) => entry !== previous && entry.config.name === task.name))
      throw new Error($t("TXT_CODE_system_instance_control.existRepeatTask"));
    if (!fileSubsystem().FileManager.checkFileName(task.name))
      throw new Error($t("TXT_CODE_system_instance_control.illegalName"));
    if (
      !Object.values(ScheduleTypeEnum).includes(task.type) ||
      !Number.isSafeInteger(task.count) ||
      (task.count !== -1 && task.count <= 0) ||
      !Array.isArray(task.actions) ||
      task.actions.length === 0 ||
      task.actions.length > 10 ||
      task.actions.some(
        (action) =>
          !action ||
          typeof action.type !== "string" ||
          typeof action.payload !== "string" ||
          (needStore &&
            !Object.values(ScheduleActionTypeEnum).some((type) => type === action.type) &&
            !daemon.schedules.get(action.type)) ||
          (action.type === ScheduleActionTypeEnum.Delay &&
            (!Number.isSafeInteger(Number(action.payload)) ||
              Number(action.payload) < 0 ||
              Number(action.payload) > 2147483647))
      )
    )
      throw new Error($t("TXT_CODE_system_instance_control.crateTaskErr", { name: task.name }));
    if (needStore)
      logger.info(
        $t("TXT_CODE_system_instance_control.crateTask", {
          name: task.name,
          task: JSON.stringify(task)
        })
      );

    const newTask = new Task({ ...task, actions: task.actions.map((action) => ({ ...action })) });
    const run = async () => {
      if (newTask.running || newTask.cancelled) return;
      newTask.running = true;
      try {
        await this.action(newTask.config, () => !newTask.cancelled);
        if (newTask.cancelled || newTask.config.count === -1) return;
        if (newTask.config.count === 1) this.deleteTask(key, newTask.config.name);
        else {
          newTask.config.count--;
          StorageSubsystem.store("TaskConfig", `${key}_${newTask.config.name}`, newTask.config);
        }
      } catch (error) {
        logger.error(`Scheduled task ${task.name} failed:`, error);
      } finally {
        newTask.running = false;
      }
    };

    // min interval check
    if (task.type === ScheduleTypeEnum.Interval) {
      // Unit: seconds
      const internalTime = Number(task.time);
      if (!Number.isFinite(internalTime) || internalTime < 3 || internalTime * 1000 > 2147483647) {
        throw new Error($t("TXT_CODE_ec96e2bf"));
      }

      // task.type=1: Time interval scheduled task, implemented with built-in timer
      newTask.job = new IntervalJob(() => void run(), internalTime);
    } else {
      // Expression validity check: 8 19 14 * * 1,2,3,4
      const timeArray = task.time.trim().split(/\s+/);
      if (timeArray[0] === "*") {
        throw new Error($t("TXT_CODE_6b77cd52"));
      }

      // The editor always emits a six-field expression with a fixed second.
      if (timeArray.length !== 6 || !/^\d+$/.test(timeArray[0]) || Number(timeArray[0]) > 59) {
        throw new Error($t("TXT_CODE_system_instance_control.crateTaskErr", { name: task.name }));
      }
      const job = schedule.scheduleJob(task.time, () => void run());
      if (!job)
        throw new Error($t("TXT_CODE_system_instance_control.crateTaskErr", { name: task.name }));
      newTask.job = job;
    }
    let stored = false;
    try {
      if (needStore) {
        StorageSubsystem.store("TaskConfig", `${key}_${newTask.config.name}`, newTask.config);
        stored = true;
        if (previous && previous.config.name !== newTask.config.name) {
          StorageSubsystem.delete("TaskConfig", `${key}_${previous.config.name}`);
        }
      }
    } catch (error) {
      newTask.job.cancel();
      if (stored && previous && previous.config.name !== newTask.config.name) {
        try {
          StorageSubsystem.delete("TaskConfig", `${key}_${newTask.config.name}`);
        } catch (rollbackError) {
          logger.error(`Cannot roll back scheduled task ${newTask.config.name}:`, rollbackError);
        }
      }
      throw error;
    }
    // Keep the old timer and persisted task until validation and storage succeed.
    if (previous) {
      previous.cancelled = true;
      previous.job?.cancel();
      registeredTasks.splice(registeredTasks.indexOf(previous), 1, newTask);
    } else {
      registeredTasks.push(newTask);
    }
    this.taskMap.set(key, registeredTasks);
    if (needStore)
      logger.info($t("TXT_CODE_system_instance_control.crateSuccess", { name: task.name }));
  }

  public listScheduleJob(instanceUuid: string) {
    const key = `${instanceUuid}`;
    const arr = this.taskMap.get(key) || [];
    const res: IScheduleTask[] = [];
    arr.forEach((v) => {
      res.push(v.config);
    });
    return res;
  }

  public async action(task: IScheduleTask, isActive = () => true) {
    try {
      const actions = task.actions;
      const instanceUuid = task.instanceUuid;
      const instance = InstanceSubsystem.getInstance(instanceUuid);

      // If the instance has been deleted, it needs to be automatically destroyed
      if (!instance || !instance?.config) {
        return this.deleteScheduleTask(task.instanceUuid, task.name);
      }

      for (const action of actions) {
        if (!isActive()) return;
        const actionType = action.type;
        const payload = action.payload;
        const instanceStatus = instance.status();
        if (actionType === ScheduleActionTypeEnum.Delay) {
          await sleep(Number(payload));
          continue;
        }
        if (actionType === ScheduleActionTypeEnum.Start) {
          if (instanceStatus === Instance.STATUS_STOP) {
            await instance.execPreset("start");
          }
          continue;
        }
        if (actionType === ScheduleActionTypeEnum.Stop) {
          if (instanceStatus === Instance.STATUS_RUNNING) {
            await instance.execPreset("stop");
          }
          continue;
        }
        if (actionType === ScheduleActionTypeEnum.Restart) {
          if (
            instanceStatus === Instance.STATUS_RUNNING ||
            instanceStatus === Instance.STATUS_STOP
          ) {
            await instance.execPreset("restart");
          }
          continue;
        }
        if (actionType === ScheduleActionTypeEnum.Command) {
          if (instanceStatus === Instance.STATUS_RUNNING) {
            await instance.execPreset("command", payload);
          }
          continue;
        }
        if (actionType === ScheduleActionTypeEnum.Kill) {
          await instance.execPreset("kill");
          continue;
        }
        const pluginAction = daemon.schedules.get(actionType);
        if (pluginAction) {
          await pluginAction(instance, payload);
          continue;
        }

        // Limit execution frequency to prevent user scheduled tasks from causing performance issues
        await sleep(100);
      }
    } catch (error: any) {
      logger.error(`Scheduled task ${task.name} failed:`, error);
    }
  }

  public deleteInstanceAllTask(instanceUuid: string) {
    const tasks = this.listScheduleJob(instanceUuid);
    if (tasks)
      tasks.forEach((v) => {
        this.deleteScheduleTask(instanceUuid, v.name);
      });
  }

  public dispose() {
    for (const tasks of this.taskMap.values()) {
      for (const task of tasks) {
        task.cancelled = true;
        task.job?.cancel();
      }
    }
    for (const job of this.taskJobMap.values()) job.cancel();
    this.taskMap.clear();
    this.taskJobMap.clear();
  }

  public deleteScheduleTask(instanceUuid: string, name: string) {
    const key = `${instanceUuid}`;
    this.deleteTask(key, name);
  }

  private deleteTask(key: string, name: string) {
    this.taskMap.get(key)?.forEach((v, index, arr) => {
      if (v?.config?.name === name) {
        v.cancelled = true;
        v?.job?.cancel();
        arr.splice(index, 1);
      }
    });
    StorageSubsystem.delete("TaskConfig", `${key}_${name}`);
  }
}

export default new InstanceControlSubsystem();
