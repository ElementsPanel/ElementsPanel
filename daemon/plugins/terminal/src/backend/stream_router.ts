import fs from "fs-extra";
import path from "path";
import type RouterContext from "../../../../src/entity/ctx";
import type { DaemonPluginContext } from "../../../../src/plugin";

const LOGIN_FROM_STREAM = "STREAM";

function checkStreamLogin(ctx: RouterContext) {
  return (
    ctx.session.stream &&
    ctx.session?.stream?.check === true &&
    ctx.session.type === LOGIN_FROM_STREAM
  );
}

export function registerTerminalEvents(ctx: DaemonPluginContext) {
  const protocol = ctx.protocol;
  const instances = ctx.instances.subsystem;
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
      if (!mission) throw new Error($t("TXT_CODE_stream_router.taskNotExist"));
      const instance = instances.getInstance(mission.parameter.instanceUuid);
      if (!instance) throw new Error($t("TXT_CODE_stream_router.instanceNotExist"));
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
      if (!instance) throw new Error($t("TXT_CODE_3bfb9e04"));
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
      // Stream input is high frequency; a stale instance is harmless.
    }
  });

  protocol.on("stream/write", async (routerCtx, data) => {
    try {
      const instance = instances.getInstance(routerCtx.session?.stream?.instanceUuid);
      if (instance?.process) instance.process.write(data.input);
    } catch {
      // Stream input is high frequency; a stale instance is harmless.
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
      // Stream input is high frequency; a stale instance is harmless.
    }
  });

  protocol.on("instance/outputlog", async (routerCtx, data) => {
    const instanceUuid = data.instanceUuid;
    try {
      const filePath = path.join(instances.LOG_DIR, `${instanceUuid}.log`);
      if (fs.existsSync(filePath)) {
        const text = await fs.readFile(filePath, { encoding: "utf-8" });
        return protocol.response(routerCtx, text);
      }
      protocol.responseError(routerCtx, new Error($t("TXT_CODE_Instance_router.terminalLogNotExist")), {
        disablePrint: true
      });
    } catch (error: any) {
      protocol.responseError(routerCtx, error);
    }
  });
}
