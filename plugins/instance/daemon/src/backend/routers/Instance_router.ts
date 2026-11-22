import fs from "fs-extra";
import path from "path";
import Instance from "../entity/instance/instance";
import { $t } from "../i18n";
import logger from "../service/log";
import * as protocol from "../service/protocol";
import { routerApp } from "../service/router";
import InstanceSubsystem from "../service/system_instance";

import { arrayUnique, toNumber } from "mcsmanager-common";
import ProcessInfoCommand from "../entity/commands/process_info";
import { ProcessConfig } from "../entity/instance/process_config";
import { TaskCenter } from "../service/async_task_service";
import { fileSubsystem } from "../service/file_access";
import { IInstanceDetail } from "../service/interfaces";
import { ctx as daemon } from "../plugin/context";
import { ROLE } from "../service/protocol";

routerApp.use((event, ctx, data, next) => {
  if (event === "instance/new" && data) return next();
  if (event === "instance/overview") return next();
  if (event === "instance/select") return next();
  if (event === "instance/asynchronous") return next();
  if (event === "instance/query_asynchronous") return next();
  if (event === "instance/stop_asynchronous") return next();
  if (event.startsWith("instance")) {
    if (data.instanceUuids) return next();
    const instanceUuid = data.instanceUuid;
    if (!InstanceSubsystem.exists(instanceUuid)) {
      return protocol.error(ctx, event, {
        instanceUuid: instanceUuid,
        err: `The operation failed, the instance ${instanceUuid} does not exist.`
      });
    }
  }
  next();
});

routerApp.on("instance/select", (ctx, data) => {
  const page = toNumber(data.page) ?? 1;
  const pageSize = toNumber(data.pageSize) ?? 1;
  const condition = data.condition;
  const targetTag = data.condition.tag;
  const overview: IInstanceDetail[] = [];
  const queryWrapper = InstanceSubsystem.getQueryMapWrapper();
  const allTags: string[] = [];

  let searchTags: string[] = [];
  if (targetTag instanceof Array && targetTag.length > 0) {
    searchTags = targetTag.map((v) => String(v).trim());
  }

  let result = queryWrapper.select<Instance>((v) => {
    if (v.config.tag) allTags.push(...v.config.tag);
    if (InstanceSubsystem.isGlobalInstance(v)) return false;
    if (
      condition.instanceName &&
      !v.config.nickname.toLowerCase().includes(condition.instanceName.toLowerCase())
    )
      return false;
    if (condition.status && v.instanceStatus !== Number(condition.status)) return false;

    if (searchTags.length > 0) {
      const myTags = v.config.tag || [];
      const res = myTags.filter((v) => searchTags.includes(v));
      if (res.length === 0 || res.length !== searchTags.length) return false;
    }
    return true;
  });
  result.sort((a, b) => {
    if (a.status() !== b.status()) {
      return b.status() - a.status();
    }
    return a.config.nickname >= b.config.nickname ? 1 : -1;
  });
  const pageResult = queryWrapper.page<Instance>(result, page, pageSize);
  pageResult.data.forEach((instance) => {
    overview.push({
      instanceUuid: instance.instanceUuid,
      started: instance.startCount,
      autoRestarted: instance.autoRestartCount,
      status: instance.status(),
      config: instance.config,
      info: instance.info
    });
  });

  protocol.response(ctx, {
    page: pageResult.page,
    pageSize: pageResult.pageSize,
    maxPage: pageResult.maxPage,
    allTags: arrayUnique(allTags).slice(0, 60),
    data: overview
  });
});

routerApp.on("instance/overview", (ctx) => {
  const overview: IInstanceDetail[] = [];
  InstanceSubsystem.getInstances().forEach((instance) => {
    overview.push({
      instanceUuid: instance.instanceUuid,
      started: instance.startCount,
      autoRestarted: instance.autoRestartCount,
      status: instance.status(),
      config: instance.config,
      info: instance.info
    });
  });

  protocol.msg(ctx, "instance/overview", overview);
});

routerApp.on("instance/section", (ctx, data) => {
  const instanceUuids = data.instanceUuids as string[];
  const overview: IInstanceDetail[] = [];
  InstanceSubsystem.getInstances().forEach((instance) => {
    instanceUuids.forEach((targetUuid) => {
      if (targetUuid === instance.instanceUuid) {
        overview.push({
          instanceUuid: instance.instanceUuid,
          started: instance.startCount,
          autoRestarted: instance.autoRestartCount,
          status: instance.status(),
          config: instance.config,
          info: instance.info
        });
      }
    });
  });
  protocol.msg(ctx, "instance/section", overview);
});

routerApp.on("instance/detail", async (ctx, data) => {
  try {
    const instanceUuid = data.instanceUuid;
    const instance = InstanceSubsystem.getInstance(instanceUuid);
    if (!instance) throw new Error($t("TXT_CODE_COMMON_THE_TARGET_INSTANCE_DOES_NOT_EXIST"));
    let processInfo = null;
    let space = 0;
    try {
      // Skip unreadable permission-dependent fields while returning the remaining configuration.
      processInfo = await instance.forceExec(new ProcessInfoCommand());
    } catch (err: any) {
      // Return the remaining details if process inspection fails.
    }
    protocol.msg(ctx, "instance/detail", {
      instanceUuid: instance.instanceUuid,
      started: instance.startCount,
      autoRestarted: instance.autoRestartCount,
      status: instance.status(),
      config: instance.config,
      info: instance.info,
      space,
      processInfo
    });
  } catch (err: any) {
    protocol.error(ctx, "instance/detail", { err: err.message });
  }
});

routerApp.on("instance/new", (ctx, data) => {
  const config = data;
  try {
    const newInstance = InstanceSubsystem.createInstance(config);
    protocol.msg(ctx, "instance/new", {
      instanceUuid: newInstance.instanceUuid,
      config: newInstance.config,
      nickname: newInstance.config.nickname
    });
  } catch (err: any) {
    protocol.error(ctx, "instance/new", { instanceUuid: null, err: err.message });
  }
});

routerApp.on("instance/update", (ctx, data) => {
  const instanceUuid = data.instanceUuid;
  const config = data.config;
  try {
    InstanceSubsystem.getInstance(instanceUuid)?.parameters(config);
    protocol.msg(ctx, "instance/update", { instanceUuid });
  } catch (err: any) {
    protocol.error(ctx, "instance/update", { instanceUuid: instanceUuid, err: err.message });
  }
});

routerApp.on("instance/forward", (ctx, data) => {
  const targetInstanceUuid = data.instanceUuid;
  const isforward: boolean = data.forward;
  try {
    if (isforward) {
      logger.info(
        $t("TXT_CODE_INSTANCE_ROUTER_REQUEST_IO", {
          id: ctx.socket.id,
          targetInstanceUuid: targetInstanceUuid
        })
      );
      InstanceSubsystem.forward(targetInstanceUuid, ctx.socket);
    } else {
      logger.info(
        $t("TXT_CODE_INSTANCE_ROUTER_CANCEL_IO", {
          id: ctx.socket.id,
          targetInstanceUuid: targetInstanceUuid
        })
      );
      InstanceSubsystem.stopForward(targetInstanceUuid, ctx.socket);
    }
    protocol.msg(ctx, "instance/forward", { instanceUuid: targetInstanceUuid });
  } catch (err: any) {
    protocol.error(ctx, "instance/forward", { instanceUuid: targetInstanceUuid, err: err.message });
  }
});

// One RPC gets one response, after all requested operations have completed.
for (const [operation, command] of [
  ["open", "start"],
  ["stop", "stop"],
  ["restart", "restart"],
  ["kill", "kill"]
] as const) {
  const event = `instance/${operation}`;
  routerApp.on(event, async (ctx, data) => {
    const instances: { instanceUuid: string; nickname: string }[] = [];
    const errors: { instanceUuid: string; error: string }[] = [];
    try {
      if (
        !Array.isArray(data.instanceUuids) ||
        !data.instanceUuids.length ||
        data.instanceUuids.some((id: unknown) => typeof id !== "string" || !id)
      ) {
        throw new Error("Invalid instance references");
      }
      for (const instanceUuid of new Set<string>(data.instanceUuids)) {
        try {
          const instance = InstanceSubsystem.getInstance(instanceUuid);
          if (!instance) throw new Error($t("TXT_CODE_COMMON_THE_TARGET_INSTANCE_DOES_NOT_EXIST"));
          await instance.execPreset(command);
          if (command === "start") instance.autoRestartCount = 0;
          instances.push({ instanceUuid, nickname: instance.config.nickname });
        } catch (error) {
          errors.push({
            instanceUuid,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      if (errors.length) {
        throw new Error(errors.map((item) => `${item.instanceUuid}: ${item.error}`).join("\n"));
      }
      if (!data.disableResponse) {
        protocol.msg(ctx, event, { instanceUuid: instances[0]?.instanceUuid, instances });
      }
    } catch (error) {
      logger.warn(`${event} failed:`, error);
      if (!data.disableResponse) {
        protocol.error(ctx, event, {
          instanceUuid: errors[0]?.instanceUuid,
          instances,
          errors,
          err: error instanceof Error ? error.message : String(error)
        });
      }
    }
  });
}

routerApp.on("instance/command", async (ctx, data) => {
  const disableResponse = data.disableResponse;
  const instanceUuid = data.instanceUuid;
  const command = data.command || "";
  const instance = InstanceSubsystem.getInstance(instanceUuid);
  try {
    if (!instance) throw new Error($t("TXT_CODE_COMMON_THE_TARGET_INSTANCE_DOES_NOT_EXIST"));
    await instance.execPreset("command", command);
    if (!disableResponse) protocol.msg(ctx, "instance/command", { instanceUuid });
  } catch (err: any) {
    if (!disableResponse)
      protocol.error(ctx, "instance/command", { instanceUuid: instanceUuid, err: err.message });
  }
});

routerApp.on("instance/delete", async (ctx, data) => {
  const instanceUuids = data.instanceUuids;
  const deleteFile = data.deleteFile;
  const instances = [];
  const errors = [];
  for (const instanceUuid of instanceUuids) {
    try {
      const instance = InstanceSubsystem.getInstance(instanceUuid);
      if (!instance) throw new Error($t("TXT_CODE_COMMON_THE_TARGET_INSTANCE_DOES_NOT_EXIST"));
      await InstanceSubsystem.removeInstance(instanceUuid, deleteFile);
      instances.push({
        instanceUuid: instance.instanceUuid,
        nickname: instance.config.nickname
      });
    } catch (err: any) {
      errors.push({ instanceUuid, error: err.message });
      logger.warn(`Cannot delete instance ${instanceUuid}:`, err);
    }
  }
  protocol.msg(ctx, "instance/delete", {
    instanceUuids: instances.map((instance) => instance.instanceUuid),
    instances,
    errors
  });
});

routerApp.on("instance/delete-directory", async (ctx, data) => {
  const instanceUuid = data.instanceUuid;
  try {
    const instance = InstanceSubsystem.getInstance(instanceUuid);
    if (!instance) throw new Error($t("TXT_CODE_COMMON_THE_TARGET_INSTANCE_DOES_NOT_EXIST"));
    if (instanceUuid === InstanceSubsystem.GLOBAL_INSTANCE_UUID)
      throw new Error("Cannot delete the global terminal instance");
    if (instance.status() !== Instance.STATUS_STOP)
      throw new Error(
        $t("TXT_CODE_COMMON_PLEASE_MAKE_SURE_THE_INSTANCE_IS_STOPPED_BEFORE_DELETING_IT")
      );
    const directory = path.resolve(instance.absoluteCwdPath());
    if (directory === path.parse(directory).root)
      throw new Error($t("TXT_CODE_INSTANCE_FILE_ACCESS_DENIED"));
    instance.status(Instance.STATUS_BUSY);
    try {
      await fs.remove(directory);
    } finally {
      instance.status(Instance.STATUS_STOP);
    }
    protocol.msg(ctx, "instance/delete-directory", { instanceUuid, deleted: true });
  } catch (err: any) {
    logger.warn(`Cannot delete instance directory ${instanceUuid}:`, err);
    protocol.error(ctx, "instance/delete-directory", {
      instanceUuid,
      deleted: false,
      err: err.message
    });
  }
});

routerApp.on("instance/asynchronous", (ctx, data) => {
  const instanceUuid = data.instanceUuid;
  const taskName = data.taskName;
  const parameter = data.parameter;
  const instance = InstanceSubsystem.getInstance(instanceUuid);
  const role = data.role as ROLE;

  logger.info(
    $t("TXT_CODE_INSTANCE_ROUTER_PERFORM_TASKS", {
      id: ctx.socket.id,
      uuid: instanceUuid,
      taskName: taskName
    })
  );

  if (taskName === "install_instance" && instance) {
    const pending = instance.execPreset("install", parameter);
    daemon.backgroundTasks?.follow(pending);
    pending
      .then(() => {})
      .catch((err) => {
        logger.error(
          $t("TXT_CODE_INSTANCE_ROUTER_PERFORM_TASKS_ERR", {
            uuid: instance.instanceUuid,
            taskName: taskName,
            nickname: instance.config.nickname,
            err: err
          })
        );
      });
  }

  if (taskName === "update" && instance) {
    const pending = instance.execPreset("update", parameter);
    daemon.backgroundTasks?.follow(pending);
    pending
      .then(() => {})
      .catch((err) => {
        logger.error(
          $t("TXT_CODE_INSTANCE_ROUTER_PERFORM_TASKS_ERR", {
            uuid: instance.instanceUuid,
            taskName: taskName,
            nickname: instance.config.nickname,
            err: err
          })
        );
      });
  }

  // Task declarations define required roles and instance scope.
  const registeredTask = daemon.tasks.get(taskName);
  if (registeredTask) {
    if (registeredTask.requiredRole != null && role < registeredTask.requiredRole) {
      return protocol.error(ctx, "instance/asynchronous", $t("TXT_CODE_PERMISSION_FORBIDDEN"));
    }
    // Creation tasks declare requiresInstance: false and receive no existing instance.
    const needsInstance = registeredTask.requiresInstance !== false;
    if (!needsInstance || instance) {
      const runningTask = instance
        ? TaskCenter.getTasks(registeredTask.type).find(
            (task) => task.toObject().instanceUuid === instanceUuid && task.status() === 1
          )
        : undefined;
      if (runningTask) return protocol.response(ctx, runningTask.toObject());
      const task = registeredTask.create(instance as Instance, parameter);
      TaskCenter.addTask(task);
      const tasks = daemon.backgroundTasks;
      tasks?.follow(
        (task as any).wait
          ? (task as any).wait()
          : new Promise<void>((resolve, reject) => {
              task.once("stopped", resolve);
              task.once("error", reject);
            })
      );
      tasks?.progress(undefined, () => {
        void task.stop().catch((err: unknown) => logger.warn(err));
      });
      return protocol.response(ctx, task.toObject());
    }
  }

  protocol.response(ctx, true);
});

routerApp.on("instance/stop_asynchronous", (ctx, data) => {
  const instanceUuid = data.instanceUuid;
  const { taskId } = data.parameter;
  const instance = InstanceSubsystem.getInstance(instanceUuid);

  if (taskId && typeof taskId === "string") {
    const task = TaskCenter.getTask(taskId);
    if (!task) throw new Error(`Async Task ID: ${taskId} does not exist`);
    task.stop();
    return protocol.response(ctx, true);
  }

  const task = instance?.asynchronousTask;
  if (task && task.stop) {
    task
      .stop(instance)
      .then(() => {})
      .catch((_err) => {});
  } else {
    return protocol.error(
      ctx,
      "instance/stop_asynchronous",
      $t("TXT_CODE_INSTANCE_ROUTER_TASK_EMPTY")
    );
  }

  protocol.response(ctx, true);
});

routerApp.on("instance/query_asynchronous", (ctx, data) => {
  const taskId = data.parameter.taskId as string | undefined;
  const taskName = data.taskName as string;
  const type = daemon.tasks.get(taskName)?.type;
  if (!type) return protocol.response(ctx, []);
  if (!taskId) {
    const result = [];
    for (const task of TaskCenter.getTasks(type)) {
      result.push({
        taskId: task.taskId,
        status: task.status(),
        detail: task.toObject()
      });
    }
    protocol.response(ctx, result);
  } else {
    const task = TaskCenter.getTask(String(taskId));
    if (task)
      protocol.response(ctx, {
        taskId: task.taskId,
        status: task.status(),
        detail: task.toObject()
      });
  }
});

routerApp.on("instance/process_config/list", (ctx, data) => {
  const instanceUuid = data.instanceUuid;
  const files = data.files;
  const result: any[] = [];
  try {
    const instance = InstanceSubsystem.getInstance(instanceUuid);
    if (!instance) throw new Error($t("TXT_CODE_COMMON_THE_TARGET_INSTANCE_DOES_NOT_EXIST"));
    const fileManager = new (fileSubsystem().FileManager)(instance.absoluteCwdPath());
    for (const filePath of files) {
      if (fileManager.check(filePath)) {
        result.push({
          file: filePath,
          check: true
        });
      }
    }
    protocol.response(ctx, result);
  } catch (err: any) {
    protocol.responseError(ctx, err);
  }
});

routerApp.on("instance/process_config/file", (ctx, data) => {
  const instanceUuid = data.instanceUuid;
  const fileName = data.fileName;
  const config = data.config || null;
  const fileType = data.type;
  try {
    const instance = InstanceSubsystem.getInstance(instanceUuid);
    if (!instance) throw new Error($t("TXT_CODE_COMMON_THE_TARGET_INSTANCE_DOES_NOT_EXIST"));
    const fileManager = new (fileSubsystem().FileManager)(instance.absoluteCwdPath());
    if (!fileManager.check(fileName)) throw new Error($t("TXT_CODE_INSTANCE_FILE_ACCESS_DENIED"));
    const filePath = path.normalize(path.join(instance.absoluteCwdPath(), fileName));
    const processConfig = new ProcessConfig({
      fileName: fileName,
      redirect: fileName,
      path: filePath,
      type: fileType,
      info: null,
      fromLink: null
    });
    if (config) {
      processConfig.write(config);
      return protocol.response(ctx, true);
    } else {
      const json = processConfig.read();
      return protocol.response(ctx, json);
    }
  } catch (err: any) {
    protocol.responseError(ctx, err);
  }
});
