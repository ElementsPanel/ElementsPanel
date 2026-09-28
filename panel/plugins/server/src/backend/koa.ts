import Router from "@koa/router";
import { Service, type Context } from "cordis";
import { remove } from "cosmokit";
import compose from "koa-compose";
import type Koa from "koa";
import type { PanelKoaService } from "../../../../src/app/plugin";

/**
 * Plugin-owned Koa wiring.
 *
 * `app.use()` cannot be undone, so this plugin mounts two permanent middlewares
 * onto its own application — one for plugin middleware, one for plugin routers —
 * and this service adds to the lists behind them. That is what makes a plugin's
 * routes disappear when it unloads: each plugin gets its own `Router` instead of
 * sharing a mutable one.
 *
 * Middleware runs before routers. Every router is contributed by a feature
 * plugin and removed with that plugin's scope.
 *
 * The service is registered from inside `apply()`, so it belongs to this
 * plugin's scope: unloading the server takes `ctx.koa` with it, and every plugin
 * that injected it is disposed in turn.
 */
export class KoaService extends Service implements PanelKoaService {
  private readonly middlewares: Koa.Middleware[] = [];
  private readonly routers: Koa.Middleware[] = [];

  constructor(ctx: Context, public readonly app: Koa) {
    super(ctx, "koa", true);
    // Composed per request rather than once: the arrays change as plugins load
    // and unload, and a request must see the set mounted at that moment.
    app.use((requestCtx, next) => compose([...this.middlewares])(requestCtx, next));
    app.use((requestCtx, next) => compose([...this.routers])(requestCtx, next));
  }

  use(middleware: Koa.Middleware) {
    return this.ctx.effect(() => {
      this.middlewares.push(middleware);
      return () => remove(this.middlewares, middleware);
    });
  }

  router(prefix?: string) {
    const router = new Router(prefix ? { prefix } : undefined);
    // Routes are declared after this returns, so the dispatcher is built lazily
    // and only once, on the first request that reaches it.
    let dispatch: Koa.Middleware | undefined;
    const layer: Koa.Middleware = (requestCtx, next) => {
      // `routes()` carries the router's own parameter context, which Koa accepts
      // but its middleware type does not describe.
      const dispatchNow = (dispatch ??= compose([
        router.routes(),
        router.allowedMethods()
      ] as Koa.Middleware[]));
      return dispatchNow(requestCtx, next);
    };
    this.ctx.effect(() => {
      this.routers.push(layer);
      return () => remove(this.routers, layer);
    });
    return router;
  }
}
