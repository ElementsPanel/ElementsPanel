import { Context } from "koa";
import { $t } from "../i18n";
import { singletonMemoryRedis } from "../service/mini_redis";
import { getRequestGuard } from "../service/request_guard";
import { execWithMutexId } from "../utils/sync";

const SPEED_LIMIT_KEY = "SpeedLimit";

// Per-caller rate limiting. The identity comes from whichever guard is
// installed; unguarded panels have a single anonymous, elevated caller.
export function speedLimit(seconds: number, errMsg?: string) {
  return async (ctx: Context, next: Function) => {
    const requestPath = ctx.URL.pathname;
    const identity = getRequestGuard().identify(ctx);

    if (identity.elevated) {
      return await next();
    }

    const speedCheckKey = `${SPEED_LIMIT_KEY}:${identity.uuid || "_anonymous_"}:${requestPath}`;
    const isExist = singletonMemoryRedis.get<boolean>(speedCheckKey);

    if (isExist) {
      ctx.status = 500;
      ctx.body =
        errMsg ||
        $t("TXT_CODE_c093bec9", {
          seconds: singletonMemoryRedis.ttl(speedCheckKey)
        });
      return;
    }

    singletonMemoryRedis.set(speedCheckKey, true, seconds);
    return await next();
  };
}

export function requestConcurrencyLimiter(url: string) {
  return async (ctx: Context, next: Function) => {
    const userId = getRequestGuard().identify(ctx).uuid || "_anonymous_";
    const key = `UserConcurrencyLimiter:${userId}:${url}`;
    return await execWithMutexId(key, async () => {
      return await next();
    });
  };
}
