/** Cordis 3 starts async disposers without awaiting them. Track them per host. */
export function trackPluginDisposal(ctx: any) {
  const pending = new Set<Promise<unknown>>();
  const failures: unknown[] = [];
  const tracked = new WeakSet<Function>();
  const scopes = new WeakSet<object>();
  const observe = (scope: any) => {
    if (scopes.has(scope)) return;
    scopes.add(scope);
    const reset = scope.reset;
    scope.reset = function () {
      this.disposables = this.disposables.map((dispose: Function) => {
        if (tracked.has(dispose)) return dispose;
        const wrapper = (...args: unknown[]) => {
          let result: unknown;
          try {
            result = dispose(...args);
          } catch (error) {
            failures.push(error);
            throw error;
          }
          if (result && typeof (result as Promise<unknown>).then === "function") {
            const task = Promise.resolve(result)
              .catch((error) => {
                failures.push(error);
              })
              .finally(() => pending.delete(task));
            pending.add(task);
          }
          return result;
        };
        // Cordis marks persistent disposers with a symbol; preserve its semantics.
        for (const key of Object.getOwnPropertySymbols(dispose))
          Object.defineProperty(wrapper, key, Object.getOwnPropertyDescriptor(dispose, key)!);
        tracked.add(wrapper);
        return wrapper;
      });
      return reset.call(this);
    };
  };
  ctx.on("internal/runtime", observe);
  ctx.on("internal/fork", observe);
  return async () => {
    do {
      await ctx.events.flush();
      await Promise.all([...pending]);
    } while (pending.size);
    if (failures.length) {
      const errors = failures.splice(0);
      throw new Error(`Plugin cleanup failed: ${errors.map(String).join("; ")}`);
    }
  };
}
