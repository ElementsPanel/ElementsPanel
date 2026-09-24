import { setupLogging } from "./service/log";
import { setupProcessLifecycle } from "./lifecycle";
import type Koa from "koa";
import { GlobalVariable } from "mcsmanager-common";
import { ROLE } from "./roles";
import validator from "./middleware/validator";
import { singletonMemoryRedis } from "./service/mini_redis";
import { execWithMutexId } from "./utils/sync";
import type {
  AuthStats,
  GuardedRoute,
  RequestGuard,
  RequestIdentity,
  UserAccessPolicy
} from "../../../../src/app/plugin/guard";
import { initSystemConfig, saveSystemConfig, systemConfig } from "./setting";
import { getVersion, initVersionManager } from "./version";
import type { PanelPluginContext } from "../../../../src/app/plugin";
import { OperationLogger } from "./service/operation_logger";
import { OverviewService } from "./service/overview";
import { registerOverview } from "./overview";

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

const UNAVAILABLE_GUARD: RequestGuard = {
  ...UNGUARDED,
  guardRoute: () => async (requestCtx) => {
    requestCtx.status = 503;
    requestCtx.body = "Authentication service is unavailable";
  },
  identify: () => ({ ...ANONYMOUS, role: ROLE.GUEST, elevated: false }),
  canAccessInstance: () => false,
  canUpload: () => false
};

/**
 * The panel runtime follows the storage and translation foundations. It owns
 * startup configuration and the shared primitives that feature plugins consume; the
 * application entry point only orchestrates plugin loading and shutdown.
 */
export const inject = ["i18n", "storage"];

export async function apply(ctx: PanelPluginContext) {
  ctx.on("dispose", () => singletonMemoryRedis.dispose());
  setupLogging(ctx);
  setupProcessLifecycle(ctx);
  await initSystemConfig(ctx.storage);
  const config = systemConfig;
  if (!config) throw new Error("Panel configuration failed to initialize.");

  if (config.redisUrl?.length) {
    await ctx.storage.initialize(config.redisUrl);
  }

  initVersionManager();

  // Resolve the optional guard from this live plugin context for each request.
  const getGuard = () => {
    const guard = ctx.get("guard");
    if (guard) return guard;
    // Removing authentication is supported; an enabled plugin that failed or
    // lost a dependency must never silently grant administrator access.
    const expectsGuard = ctx.get("plugins")?.loaded.some((plugin) => plugin.manifest.id === "user");
    return expectsGuard ? UNAVAILABLE_GUARD : UNGUARDED;
  };
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
        requestCtx.status = 429;
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

  ctx.set("settings", { config, save: () => saveSystemConfig(ctx.storage, config) });
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
  const operations = new OperationLogger();
  ctx.set("operations", operations);
  ctx.on("dispose", () => operations.dispose());
  ctx.plugin(OverviewService);
  ctx.inject(["koa", "overview", "middleware", "roles", "globals", "identity"], registerOverview);
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
  ctx.on("ready", () => saveSystemConfig(ctx.storage, config));
}
