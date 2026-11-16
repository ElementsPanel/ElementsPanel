import Router from "@koa/router";
import { Service, type Context } from "cordis";
import { remove } from "cosmokit";
import compose from "koa-compose";
import type Koa from "koa";
import type { PanelKoaService } from "../../../../../core/panel/src/app/plugin";

/**
 * Mount permanent dispatchers over mutable middleware and router lists.
 * Scope each registration to its caller so unloading a plugin removes its handlers. Middleware
 * runs before routers.
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
