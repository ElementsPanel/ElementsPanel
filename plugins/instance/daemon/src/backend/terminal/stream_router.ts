import fs from "fs-extra";
import path from "path";
import type RouterContext from "../../../../../server/daemon/src/backend/context";
import type { DaemonPluginContext } from "../../../../../../core/daemon/src/plugin";
import { readOutputLogTail } from "./output_log";

const LOGIN_FROM_STREAM = "STREAM";

function checkStreamLogin(ctx: RouterContext) {
  return (
    ctx.session.stream &&
    ctx.session?.stream?.check === true &&
    ctx.session.type === LOGIN_FROM_STREAM
  );
}

export function registerTerminalEvents(ctx: DaemonPluginContext, service = ctx.instances) {
  const protocol = ctx.protocol;
  const instances = service.subsystem;
  const $t = ctx.i18n.$t;

  protocol.use(async (routePath, routerCtx, _data, next) => {
    if (routePath === "stream/auth") return next();
    if (routePath.startsWith("stream")) {
      if (checkStreamLogin(routerCtx)) return await next();
      return protocol.error(routerCtx, "error", protocol.IGNORE, { disablePrint: true });
    }
    return await next();
  });

  protocol.on("stream/auth", (routerCtx, data) => {
    try {
      const password = data.password;
      const mission = ctx.transfer.passports.getMission(password, "stream_channel");
      if (!mission) throw new Error($t("TXT_CODE_STREAM_ROUTER_TASK_NOT_EXIST"));
      const instance = instances.getInstance(mission.parameter.instanceUuid);
      if (!instance) throw new Error($t("TXT_CODE_STREAM_ROUTER_INSTANCE_NOT_EXIST"));
      routerCtx.session.id = routerCtx.socket.id;
      routerCtx.session.login = true;
      routerCtx.session.type = LOGIN_FROM_STREAM;
      routerCtx.session.stream = { check: true, instanceUuid: instance.instanceUuid };
      instances.forward(instance.instanceUuid, routerCtx.socket);
      routerCtx.socket.on("disconnect", () => {
        instances.stopForward(instance.instanceUuid, routerCtx.socket);
      });
      protocol.response(routerCtx, true);
    } catch (error: any) {
      protocol.responseError(routerCtx, error, { disablePrint: true });
    }
  });

  protocol.on("stream/detail", async (routerCtx) => {
    try {
      const instance = instances.getInstance(routerCtx.session?.stream?.instanceUuid);
      if (!instance) throw new Error($t("TXT_CODE_COMMON_THE_TARGET_INSTANCE_DOES_NOT_EXIST"));
      protocol.response(routerCtx, {
        instanceUuid: instance.instanceUuid,
        started: instance.startCount,
        autoRestarted: instance.autoRestartCount,
        status: instance.status(),
        config: instance.config,
        info: instance.info,
        watcher: instance.watchers.size
      });
    } catch (error: any) {
      protocol.responseError(routerCtx, error);
    }
  });

  protocol.on("stream/input", async (routerCtx, data) => {
    try {
      const instance = instances.getInstance(routerCtx.session?.stream?.instanceUuid);
      await instance?.execPreset("command", data.command);
    } catch {
      // Ignore stale-instance errors on high-frequency stream events.
    }
  });

  protocol.on("stream/write", async (routerCtx, data) => {
    try {
      const instance = instances.getInstance(routerCtx.session?.stream?.instanceUuid);
      if (instance?.process) instance.process.write(data.input);
    } catch {
      // Ignore stale-instance errors on high-frequency stream events.
    }
  });

  protocol.on("stream/resize", async (routerCtx, data) => {
    try {
      const instance = instances.getInstance(routerCtx.session?.stream?.instanceUuid);
      instance?.watchers.set(routerCtx.socket.id, {
        terminalSize: { w: Number(data.w) || 0, h: Number(data.h) || 0 }
      });
      if (instance) await instance.execPreset("resize");
    } catch {
      // Ignore stale-instance errors on high-frequency stream events.
    }
  });

  protocol.on("instance/outputlog", async (routerCtx, data) => {
    const instanceUuid = data.instanceUuid;
    try {
      const filePath = path.join(instances.LOG_DIR, `${instanceUuid}.log`);
      if (fs.existsSync(filePath)) {
        const text = await readOutputLogTail(filePath, data.size);
        return protocol.response(routerCtx, text);
      }
      protocol.responseError(
        routerCtx,
        new Error($t("TXT_CODE_INSTANCE_ROUTER_TERMINAL_LOG_NOT_EXIST")),
        {
          disablePrint: true
        }
      );
    } catch (error: any) {
      protocol.responseError(routerCtx, error);
    }
  });
}
