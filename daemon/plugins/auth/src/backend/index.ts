import { timingSafeEqual } from "node:crypto";
import type RouterContext from "../../../../src/entity/ctx";
import type { DaemonPluginContext } from "../../../../src/plugin";
import { localeMessages } from "../i18n";

// The daemon's identity check.
//
// Everything about deciding *who* may talk to this daemon lives here: the
// top-level protocol middleware that gates every event, the key comparison the
// panel authenticates with, the optional panel IP whitelist and the timeout that
// hangs up on a connection that never authenticates.
//
// The daemon core keeps no "is auth enabled" branch anywhere — it simply has no
// opinion on who is calling. Removing this plugin therefore leaves the daemon
// answering every event to anyone who can reach the port, which is the same trade
// the panel makes with `plugins/user`.
//
// The session type is this plugin's own: `service/mission_passport.ts` keeps the
// stream login and the upload passports, because those are the core's.

/** How long a connection may stay unauthenticated before it is hung up on. */
const AUTH_TIMEOUT = 6000;

/** What this plugin marks a session it has authenticated with. */
const LOGIN_BY_TOP_LEVEL = "TOP_LEVEL";

export const inject = ["protocol", "i18n", "settings"];

export function apply(ctx: DaemonPluginContext) {
  ctx.i18n.define(localeMessages);

  const $t = ctx.i18n.$t;
  const protocol = ctx.protocol;

  const isAuthenticated = (routerCtx: RouterContext) =>
    routerCtx.session.key === ctx.settings.config.key &&
    routerCtx.session.type === LOGIN_BY_TOP_LEVEL &&
    routerCtx.session.login &&
    routerCtx.session.id;

  // Top-level authority authentication middleware. It is registered before the
  // server listens, and it is the only protocol middleware, so it runs first for
  // every event on every socket.
  protocol.use(async (routePath, routerCtx, _data, next) => {
    const socket = routerCtx.socket;

    // release all data flow controllers
    if (routePath.startsWith("stream")) return next();

    // Except for the auth controller, which is publicly accessible, other
    // business controllers must be authorized before they can be accessed
    if (routePath === "auth") return await next();
    if (!routerCtx.session) {
      throw new Error("Session does not exist in authentication middleware.");
    }
    if (isAuthenticated(routerCtx)) return await next();

    ctx.logger.warn(
      $t("TXT_CODE_auth_router.notAccess", {
        id: socket.id,
        address: socket.handshake.address,
        event: routePath
      })
    );
    return protocol.error(routerCtx, "error", protocol.IGNORE, { disablePrint: true });
  });

  // The authentication controller itself.
  protocol.on("auth", (routerCtx, data) => {
    try {
      let ip = routerCtx.socket.handshake.address;
      // extract IPv4 address from IPv6 format
      if (ip.startsWith("::ffff:")) ip = ip.substring(7);

      const config = ctx.settings.config;
      if (
        (!config.whiteListPanelIp || config.whiteListPanelIps.includes(ip)) &&
        timingSafeEqual(
          Uint8Array.from(String(data ?? "")),
          Uint8Array.from(String(config.key ?? ""))
        )
      ) {
        // The authentication is passed, and the registered session is a trusted
        // session.
        ctx.logger.info(
          $t("TXT_CODE_auth_router.access", {
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

  // Hang up on a connection that never authenticates. `ctx.setTimeout` is
  // cancelled when the plugin unloads, so a pending timer leaves with it.
  protocol.on("connection", (routerCtx) => {
    const session = routerCtx.session;
    ctx.setTimeout(() => {
      if (!session.login) {
        routerCtx.socket.disconnect();
        ctx.logger.info(
          $t("TXT_CODE_auth_router.disconnect", {
            id: routerCtx.socket.id,
            address: routerCtx.socket.handshake.address
          })
        );
      }
    }, AUTH_TIMEOUT);
  });
}
