import { protocol } from "../runtime";

/** Scope legacy router registrations to the instance plugin. */
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
