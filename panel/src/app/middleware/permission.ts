import Koa from "koa";
import { $t } from "../i18n";
import { getPanelAuthProvider, type IPermissionCfg } from "../service/auth_provider";

// Failed callback
export function verificationFailed(ctx: Koa.ParameterizedContext) {
  ctx.status = 403;
  ctx.body = `${$t("TXT_CODE_permission.forbidden")}`;
}

export type { IPermissionCfg };

// Routers build their middleware at module load time, long before plugins are
// loaded, so this factory resolves the provider per request instead. With no
// provider registered the panel is unauthenticated and every request passes.
const middlewareCache = new WeakMap<object, Map<string, Koa.Middleware>>();

function resolveMiddleware(parameter: IPermissionCfg): Koa.Middleware | undefined {
  const provider = getPanelAuthProvider();
  if (!provider) return undefined;
  let cache = middlewareCache.get(provider);
  if (!cache) {
    cache = new Map();
    middlewareCache.set(provider, cache);
  }
  const key = `${parameter.token}:${parameter.level}:${parameter.speedLimit}`;
  let middleware = cache.get(key);
  if (!middleware) {
    middleware = provider.permission(parameter);
    cache.set(key, middleware);
  }
  return middleware;
}

// Basic user permission middleware
export default (parameter: IPermissionCfg) => {
  return async (ctx: Koa.ParameterizedContext, next: Koa.Next) => {
    const middleware = resolveMiddleware(parameter);
    if (!middleware) return await next();
    return await middleware(ctx, next);
  };
};
