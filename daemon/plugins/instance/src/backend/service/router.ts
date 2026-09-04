import { protocol } from "../runtime";

/** Compatibility facade for the legacy routers. Each registration is scoped to
 * the instance plugin through the daemon protocol service. */
export const routerApp = {
  disposers: new Set<() => void>(),
  on(event: string, handler: (ctx: any, data: any) => void) {
    const dispose = protocol().on(event, handler);
    this.disposers.add(dispose);
    return dispose;
  },
  off(event: string, handler: (ctx: any, data: any) => void) {
    void event;
    void handler;
    return undefined;
  },
  use(handler: (event: string, ctx: any, data: any, next: Function) => void) {
    const dispose = protocol().use(handler);
    this.disposers.add(dispose);
    return dispose;
  },
  dispose() {
    for (const dispose of this.disposers) dispose();
    this.disposers.clear();
  }
};
