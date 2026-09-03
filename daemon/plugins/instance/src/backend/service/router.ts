import { protocol } from "../runtime";

/** Compatibility facade for the legacy routers. Each registration is scoped to
 * the instance plugin through the daemon protocol service. */
export const routerApp = {
  on(event: string, handler: (ctx: any, data: any) => void) {
    return protocol().on(event, handler);
  },
  off(event: string, handler: (ctx: any, data: any) => void) {
    return undefined;
  },
  use(handler: (event: string, ctx: any, data: any, next: Function) => void) {
    return protocol().use(handler);
  }
};
