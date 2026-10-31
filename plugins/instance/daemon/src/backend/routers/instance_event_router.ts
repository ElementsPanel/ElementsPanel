import path from "path";

import fs from "fs-extra";
import RouterContext from "../entity/ctx";
import * as protocol from "../service/protocol";
import InstanceSubsystem from "../service/system_instance";
import logger from "../service/log";

const MAX_LOG_SIZE = 512;

export function registerInstanceEvents() {
  const buffer = new Map<string, string>();
  const pending = new Map<string, Promise<void>>();
  const flush = async () => {
    buffer.forEach((buf, instanceUuid) => {
      if (!buf || !instanceUuid) return;
      buffer.delete(instanceUuid);
      const work = (pending.get(instanceUuid) ?? Promise.resolve())
        .then(async () => {
          const logFilePath = path.join(InstanceSubsystem.LOG_DIR, `${instanceUuid}.log`);
          await fs.ensureDir(InstanceSubsystem.LOG_DIR);
          try {
            const fileInfo = await fs.stat(logFilePath);
            if (fileInfo.size > 1024 * MAX_LOG_SIZE) await fs.remove(logFilePath);
          } catch (err: any) {
            if (err.code !== "ENOENT") throw err;
          }
          await fs.writeFile(logFilePath, buf, { encoding: "utf-8", flag: "a" });
        })
        .catch((error) => logger.error(`Failed to write instance ${instanceUuid} output:`, error))
        .finally(() => {
          if (pending.get(instanceUuid) === work) pending.delete(instanceUuid);
        });
      pending.set(instanceUuid, work);
    });
    await Promise.all(pending.values());
  };
  const flushTimer = setInterval(() => void flush(), 500);

  const outputLog = (instanceUuid: string, text: string) => {
    const buf = (buffer.get(instanceUuid) ?? "") + text;
    if (buf.length > 1024 * 1024) buffer.set(instanceUuid, "");
    buffer.set(instanceUuid, buf);
  };

  // Instance output stream event. The buffer controls disk write frequency.
  const onData = (instanceUuid: string, text: string) => {
    InstanceSubsystem.forEachForward(instanceUuid, (socket) => {
      protocol.msg(new RouterContext(null, socket), "instance/stdout", {
        instanceUuid,
        text
      });
    });
    outputLog(instanceUuid, text);
  };
  InstanceSubsystem.on("data", onData);

  // Instance exit event.
  const onExit = (obj: any) => {
    const eventName = obj.isCrash ? "instance/crashed" : "instance/stopped";
    InstanceSubsystem.forEachForward(obj.instanceUuid, (socket) => {
      protocol.msg(new RouterContext(null, socket), eventName, {
        instanceUuid: obj.instanceUuid,
        instanceName: obj.instanceName,
        exitCode: obj.exitCode
      });
    });
  };
  InstanceSubsystem.on("exit", onExit);

  // Instance start event.
  const onOpen = (obj: any) => {
    InstanceSubsystem.forEachForward(obj.instanceUuid, (socket) => {
      protocol.msg(new RouterContext(null, socket), "instance/opened", {
        instanceUuid: obj.instanceUuid,
        instanceName: obj.instanceName
      });
    });
  };
  InstanceSubsystem.on("open", onOpen);

  // Instance failure event (usually startup or operation failure).
  const onFailure = (obj: any) => {
    InstanceSubsystem.forEachForward(obj.instanceUuid, (socket) => {
      protocol.msg(new RouterContext(null, socket), "instance/failure", {
        instanceUuid: obj.instanceUuid,
        instanceName: obj.instanceName
      });
    });
  };
  InstanceSubsystem.on("failure", onFailure);

  // Instance auto-restart event (triggered after a crash).
  const onAutoRestarted = (obj: any) => {
    InstanceSubsystem.forEachForward(obj.instanceUuid, (socket) => {
      protocol.msg(new RouterContext(null, socket), "instance/auto_restarted", {
        instanceUuid: obj.instanceUuid,
        instanceName: obj.instanceName,
        restartCount: obj.restartCount
      });
    });
  };
  InstanceSubsystem.on("autoRestarted", onAutoRestarted);

  return async () => {
    clearInterval(flushTimer);
    InstanceSubsystem.off("data", onData);
    InstanceSubsystem.off("exit", onExit);
    InstanceSubsystem.off("open", onOpen);
    InstanceSubsystem.off("failure", onFailure);
    InstanceSubsystem.off("autoRestarted", onAutoRestarted);
    await flush();
    buffer.clear();
  };
}
