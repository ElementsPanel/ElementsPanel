import Koa from "koa";
import { getRequestGuard, type GuardedRoute } from "../service/request_guard";

export type { GuardedRoute };

// Routes declare what they require; the installed guard decides what that
// means. Routers build their middleware at module load time, long before any
// plugin has loaded, so the guard is resolved per request instead.
const middlewareCache = new WeakMap<object, Map<string, Koa.Middleware>>();

function resolveMiddleware(route: GuardedRoute): Koa.Middleware {
  const guard = getRequestGuard();
  let cache = middlewareCache.get(guard);
  if (!cache) {
    cache = new Map();
    middlewareCache.set(guard, cache);
  }
  const key = `${route.token}:${route.level}:${route.speedLimit}`;
  let middleware = cache.get(key);
  if (!middleware) {
    middleware = guard.guardRoute(route);
    cache.set(key, middleware);
  }
  return middleware;
}

export default (route: GuardedRoute) => {
  return async (ctx: Koa.ParameterizedContext, next: Koa.Next) => {
    return await resolveMiddleware(route)(ctx, next);
  };
};
