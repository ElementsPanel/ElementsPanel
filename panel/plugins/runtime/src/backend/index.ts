import type Koa from "koa";
import { GlobalVariable } from "mcsmanager-common";
import { ROLE } from "../../../../src/app/entity/user";
import validator from "../../../../src/app/middleware/validator";
import { singletonMemoryRedis } from "../../../../src/app/service/mini_redis";
import { execWithMutexId } from "../../../../src/app/utils/sync";
import type {
  AuthStats,
  GuardedRoute,
  RequestGuard,
  RequestIdentity,
  UserAccessPolicy
} from "../../../../src/app/service/request_guard";
import versionAdapter from "../../../../src/app/service/version_adapter";
import { initSystemConfig, saveSystemConfig, systemConfig } from "../../../../src/app/setting";
import { getVersion, initVersionManager } from "../../../../src/app/version";
import type { PanelPluginContext } from "../../../../src/app/plugin";

const ANONYMOUS: RequestIdentity = {
  uuid: "",
  userName: "",
  role: ROLE.ADMIN,
  elevated: true
};

const NO_STATS: AuthStats = { logined: 0, illegalAccess: 0, banips: 0, loginFailed: 0 };
const UNGUARDED_ACCESS: UserAccessPolicy = {
  allowChangeCmd: false,
  canFileManager: true,
  allowJavaManager: true
};

const UNGUARDED: RequestGuard = {
  guardRoute: () => async (_requestCtx, next) => await next(),
  identify: () => ANONYMOUS,
  canAccessInstance: () => true,
  canUpload: () => true,
  accessPolicy: () => UNGUARDED_ACCESS,
  stats: () => NO_STATS
};

/**
 * The panel runtime follows the storage and translation foundations. It owns
 * startup configuration and the shared primitives that feature plugins consume; the
 * application entry point only orchestrates plugin loading and shutdown.
 */
export const inject = ["i18n", "storage"];

export async function apply(ctx: PanelPluginContext) {
  await initSystemConfig(ctx.storage);
  const config = systemConfig;
  if (!config) throw new Error("Panel configuration failed to initialize.");

  if (config.redisUrl?.length) {
    await ctx.storage.initialize(config.redisUrl);
  }

  initVersionManager();
  versionAdapter.detectConfig(ctx.storage);

  // Middleware and identity are resolved through this context at request time.
  // Importing the core middleware modules here would bundle a second copy of
  // the panel context into this plugin, so a user guard installed by the host
  // would never be visible to those copies.
  const getGuard = () => ctx.get("guard") ?? UNGUARDED;
  const permission = (route: GuardedRoute): Koa.Middleware => {
    let owner: RequestGuard | undefined;
    let middleware: Koa.Middleware | undefined;
    return async (requestCtx, next) => {
      const guard = getGuard();
      if (guard !== owner || !middleware) {
        owner = guard;
        middleware = guard.guardRoute(route);
      }
      return middleware(requestCtx, next);
    };
  };

  const instanceAccess: Koa.Middleware = async (requestCtx, next) => {
    const instanceUuid = String(requestCtx.query.uuid);
    const daemonId = String(requestCtx.query.daemonId);
    if (getGuard().canAccessInstance(requestCtx, daemonId, instanceUuid)) {
      await next();
      return;
    }
    requestCtx.status = 403;
    requestCtx.body = String(ctx.i18n.$t("TXT_CODE_permission.forbiddenInstance"));
  };

  const speedLimit = (seconds: number, errMsg?: string): Koa.Middleware => {
    return async (requestCtx, next) => {
      const identity = getGuard().identify(requestCtx);
      if (identity.elevated) return await next();

      const requestPath = requestCtx.URL.pathname;
      const speedCheckKey = `SpeedLimit:${identity.uuid || "_anonymous_"}:${requestPath}`;
      if (singletonMemoryRedis.get<boolean>(speedCheckKey)) {
        requestCtx.status = 500;
        requestCtx.body =
          errMsg ||
          String(
            ctx.i18n.$t("TXT_CODE_c093bec9", {
              seconds: singletonMemoryRedis.ttl(speedCheckKey)
            })
          );
        return;
      }

      singletonMemoryRedis.set(speedCheckKey, true, seconds);
      return await next();
    };
  };

  const requestConcurrencyLimiter = (url: string): Koa.Middleware => {
    return async (requestCtx, next) => {
      const userId = getGuard().identify(requestCtx).uuid || "_anonymous_";
      return await execWithMutexId(`UserConcurrencyLimiter:${userId}:${url}`, async () => {
        return await next();
      });
    };
  };

  ctx.set("settings", { config, save: () => void saveSystemConfig(ctx.storage, config) });
  ctx.set("middleware", {
    permission,
    validator,
    instanceAccess,
    speedLimit,
    requestConcurrencyLimiter
  });
  ctx.set("roles", ROLE);
  ctx.set("identity", {
    of: (requestCtx: Koa.ParameterizedContext) => getGuard().identify(requestCtx),
    canAccessInstance: (
      requestCtx: Koa.ParameterizedContext,
      daemonId: string,
      instanceUuid: string
    ) => getGuard().canAccessInstance(requestCtx, daemonId, instanceUuid),
    get accessPolicy() {
      return getGuard().accessPolicy();
    },
    get users() {
      return getGuard().users;
    },
    get stats() {
      return getGuard().stats();
    }
  });
  ctx.set("globals", GlobalVariable);
  const version = getVersion();
  console.log(`
 _____ _                   _       _____             _
|   __| |___ _____ ___ ___| |_ ___|  _  |___ ___ ___| |
|   __| | -_|     | -_|   |  _|_ -|   __| .'|   | -_| |
|_____|_|___|_|_|_|___|_|_|_| |___|__|  |__,|_|_|___|_|

 + Copyright ${new Date().getFullYear()} ElementsPanel
 + Based on MCSManager
 + Version ${version}
`);

  // Configuration migrations performed by feature plugins are persisted once
  // all plugin scopes have had a chance to update the shared object.
  ctx.on("ready", () => void saveSystemConfig(ctx.storage, config));
}
