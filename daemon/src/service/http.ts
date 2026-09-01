import type Koa from "koa";
import koaRouter from "../routers/http_router";

/**
 * The daemon's own HTTP routes. They go on last, after every plugin's middleware
 * and routers — the Koa application itself, and everything in front of these, is
 * `plugins/server`.
 */
export function mountCoreRouter(koaApp: Koa) {
  koaApp.use(koaRouter.routes()).use(koaRouter.allowedMethods());
}
