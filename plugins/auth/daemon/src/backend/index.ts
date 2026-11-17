import { timingSafeEqual } from "node:crypto";
import type RouterContext from "../../../../server/daemon/src/backend/context";
import type { DaemonPluginContext } from "../../../../../core/daemon/src/plugin";
import { localeMessages } from "../i18n";

// Authenticate daemon sessions; disabling this plugin leaves protocol access unrestricted.

const AUTH_TIMEOUT = 6000;

const LOGIN_BY_TOP_LEVEL = "TOP_LEVEL";

export const inject = ["protocol", "i18n", "settings", "transfer"];

export function apply(ctx: DaemonPluginContext) {
  ctx.i18n.define(localeMessages);

  const $t = ctx.i18n.$t;
  const protocol = ctx.protocol;

  // Issue transfer passports only for authenticated panel sessions.
  const ONE_HOUR_TIME = 3600000;
  protocol.on("passport/register", (routerCtx, data) => {
    const start = Date.now();
    const end = start + ONE_HOUR_TIME;
    if (!data?.name || !data?.password) {
      throw new Error($t("TXT_CODE_PASSPORT_ROUTER_REGISTER_ERR"));
    }
    ctx.transfer.passports.registerMission(data.password, {
      name: data.name,
      parameter: { ...data.parameter, _taskOwner: data._taskOwner },
      count: data.count,
      start,
      end
    });
    protocol.response(routerCtx, true);
  });

  const isAuthenticated = (routerCtx: RouterContext) =>
    routerCtx.session.key === ctx.settings.config.key &&
    routerCtx.session.type === LOGIN_BY_TOP_LEVEL &&
    routerCtx.session.login &&
    routerCtx.session.id;

  // Register authentication before the server starts accepting events.
  protocol.use(async (routePath, routerCtx, _data, next) => {
    const socket = routerCtx.socket;

    if (routePath.startsWith("stream")) return next();

    // Allow unauthenticated access to the login event.
    if (routePath === "auth") return await next();
    if (!routerCtx.session) {
      throw new Error("Session does not exist in authentication middleware.");
    }
    if (isAuthenticated(routerCtx)) return await next();

    ctx.logger.warn(
      $t("TXT_CODE_AUTH_ROUTER_NOT_ACCESS", {
        id: socket.id,
        address: socket.handshake.address,
        event: routePath
      })
    );
    return protocol.error(routerCtx, "error", protocol.IGNORE, { disablePrint: true });
  });

  protocol.on("auth", (routerCtx, data) => {
    try {
      let ip = routerCtx.socket.handshake.address;
      // Strip the IPv4-mapped IPv6 prefix.
      if (ip.startsWith("::ffff:")) ip = ip.substring(7);

      const config = ctx.settings.config;
      const suppliedKey = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.alloc(0);
      const configuredKey = Buffer.from(String(config.key ?? ""), "utf8");
      if (
        (!config.whiteListPanelIp || config.whiteListPanelIps.includes(ip)) &&
        configuredKey.length > 0 &&
        suppliedKey.length === configuredKey.length &&
        timingSafeEqual(suppliedKey, configuredKey)
      ) {
        ctx.logger.info(
          $t("TXT_CODE_AUTH_ROUTER_ACCESS", {
            id: routerCtx.socket.id,
            address: routerCtx.socket.handshake.address
          })
        );

        routerCtx.session.key = String(data ?? "");
        routerCtx.session.login = true;
        routerCtx.session.id = routerCtx.socket.id;
        routerCtx.session.type = LOGIN_BY_TOP_LEVEL;
        routerCtx.session.stream = {};

        protocol.msg(routerCtx, "auth", true);
      } else {
        protocol.msg(routerCtx, "auth", false);
      }
    } catch (error) {
      protocol.msg(routerCtx, "auth", false);
    }
  });

  // Disconnect unauthenticated sessions; unloading cancels pending timers.
  protocol.on("connection", (routerCtx) => {
    const session = routerCtx.session;
    ctx.setTimeout(() => {
      if (!session.login) {
        routerCtx.socket.disconnect();
        ctx.logger.info(
          $t("TXT_CODE_AUTH_ROUTER_DISCONNECT", {
            id: routerCtx.socket.id,
            address: routerCtx.socket.handshake.address
          })
        );
      }
    }, AUTH_TIMEOUT);
  });
}
