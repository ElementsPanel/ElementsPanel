import { Service, type Context } from "cordis";
import { IGNORE } from "../const";
import { routerApp } from "../service/router";
import * as protocol from "../service/protocol";
import type RouterContext from "../entity/ctx";
import type { DaemonProtocolService } from "./context";

/**
 * The Socket.io protocol the panel talks to this daemon over.
 *
 * Handlers and middleware are scoped to the calling plugin. Note the limitation
 * documented on `DaemonProtocolService`: `service/router.ts` copies the handler
 * list onto each socket as it connects, so a change made after a client
 * connected only reaches sockets that connect afterwards.
 */
export class ProtocolService extends Service implements DaemonProtocolService {
  readonly response = protocol.response;
  readonly responseError = protocol.responseError;
  readonly error = protocol.error;
  readonly msg = protocol.msg;
  readonly ROLE = protocol.ROLE;
  readonly IGNORE = IGNORE;

  constructor(ctx: Context) {
    super(ctx, "protocol", true);
  }

  on(event: string, handler: (routerCtx: RouterContext, data: any) => void) {
    return this.ctx.effect(() => {
      routerApp.on(event, handler);
      return () => routerApp.off(event, handler);
    });
  }

  use(handler: (event: string, routerCtx: RouterContext, data: any, next: Function) => void) {
    return this.ctx.effect(() => {
      routerApp.use(handler);
      return () => routerApp.unuse(handler);
    });
  }
}
