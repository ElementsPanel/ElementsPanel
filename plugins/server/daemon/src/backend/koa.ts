import { Service, type Context } from "cordis";
import Router from "@koa/router";
import compose from "koa-compose";
import { remove } from "cosmokit";
import type Koa from "koa";
import type { DaemonKoaService } from "../../../../../core/daemon/src/plugin";

/** Keep dispatchers stable while plugin-scoped middleware and routers change. */
export class KoaService extends Service implements DaemonKoaService {
  private readonly middlewares: Koa.Middleware[] = [];
  private readonly routers: Koa.Middleware[] = [];

  constructor(ctx: Context, public readonly app: Koa) {
    super(ctx, "koa", true);
    // Compose middleware per request so plugin reloads take effect immediately.
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
    // Build each router dispatcher lazily on its first request.
    let dispatch: Koa.Middleware | undefined;
    const layer: Koa.Middleware = (requestCtx, next) => {
      // Koa accepts router parameter contexts that its Middleware type omits.
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
