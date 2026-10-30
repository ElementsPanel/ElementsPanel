import { v4 } from "uuid";
import { $t, koa, middleware, remote, roles } from "./runtime";

function timeUuid() {
  return v4().replace(/-/g, "") + Date.now();
}

export function registerTerminalRoutes() {
  const router = koa().router("/api/protected_instance");
  const permission = middleware().permission;
  const validator = middleware().validator;
  const ROLE = roles();

  router.use(middleware().instanceAccess);

  router.post(
    "/stream_channel",
    permission({ level: ROLE.USER }),
    validator({ query: { daemonId: String, uuid: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const remoteService = remote().services.getInstance(daemonId);
        if (!remoteService) throw new Error($t("TXT_CODE_dd559000") + ` Daemon ID: ${daemonId}`);
        const password = timeUuid();
        await new (remote().Request)(remoteService).request("passport/register", {
          name: "stream_channel",
          password,
          parameter: { instanceUuid }
        });
        ctx.body = {
          password,
          addr: remoteService.config.addr,
          prefix: remoteService.config.prefix,
          remoteMappings: remoteService.config.getConvertedRemoteMappings()
        };
      } catch (err) {
        ctx.body = err;
      }
    }
  );

  router.get(
    "/outputlog",
    permission({ level: ROLE.USER, speedLimit: false }),
    validator({ query: { daemonId: String, uuid: String } }),
    async (ctx) => {
      try {
        const daemonId = String(ctx.query.daemonId);
        const instanceUuid = String(ctx.query.uuid);
        const remoteService = remote().services.getInstance(daemonId);
        let result = await new (remote().Request)(remoteService).request("instance/outputlog", {
          instanceUuid
        });
        if (ctx.query.size) {
          let sizeStr = ctx.query.size;
          if (sizeStr instanceof Array) sizeStr = sizeStr[0];
          let size = parseInt(String(sizeStr));
          if (String(sizeStr).toLowerCase().endsWith("kb")) size *= 1024;
          if (result.length > size) result = result.slice(-size);
        }
        ctx.body = result;
      } catch (err) {
        ctx.body = err;
      }
    }
  );
}
