import { v4 } from "uuid";
import { $t, koa, middleware, remote, roles } from "./runtime";
import type { TerminalSettings } from "../../../../shared/terminal_settings";

function timeUuid() {
  return v4().replace(/-/g, "") + Date.now();
}

export function registerTerminalRoutes(getSettings: () => TerminalSettings) {
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
        if (!remoteService)
          throw new Error(
            $t("TXT_CODE_COMMON_COULD_NOT_FIND_REMOTE_WITH_GIVEN_DAEMON_ID") +
              ` Daemon ID: ${daemonId}`
          );
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
          remoteMappings: remoteService.config.getConvertedRemoteMappings(),
          terminalSettings: getSettings()
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
        let size = getSettings().historyLimitKB * 1024;
        if (ctx.query.size !== undefined) {
          const requested = Array.isArray(ctx.query.size) ? ctx.query.size[0] : ctx.query.size;
          const match = /^(\d+)(kb)?$/i.exec(String(requested));
          if (!match || !Number.isSafeInteger(Number(match[1]))) {
            ctx.status = 400;
            return;
          }
          size = Math.min(size, Number(match[1]) * (match[2] ? 1024 : 1));
        }
        if (size === 0) {
          ctx.body = "";
          return;
        }
        const remoteService = remote().services.getInstance(daemonId);
        const result = await new (remote().Request)(remoteService).request("instance/outputlog", {
          instanceUuid,
          size
        });
        // Older daemons may ignore `size`; still enforce the configured byte limit.
        const buffer = Buffer.from(result, "utf8");
        let start = Math.max(0, buffer.length - size);
        while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) start++;
        ctx.body = buffer.subarray(start).toString("utf8");
      } catch (err) {
        ctx.body = err;
      }
    }
  );
}
