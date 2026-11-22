const BACKEND_PLUGIN_SERVICE_PREFIX = "elementspanel.plugin:";

type BackendInjection = string[] | Record<string, { required: boolean }>;

function backendDependencies(value: readonly string[]): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))]
    : [];
}

/** Track backend plugin dependencies through Cordis-scoped readiness services. */
export function withBackendPluginDependencies<
  T extends {
    inject?: BackendInjection;
    apply(ctx: any, config?: unknown): void | Promise<void>;
  }
>(plugin: T, id: string, dependencies: readonly string[] = []) {
  const services: Record<string, { required: boolean }> = {};
  if (Array.isArray(plugin.inject)) {
    for (const name of plugin.inject) services[name] = { required: true };
  } else {
    Object.assign(services, plugin.inject);
  }
  for (const dependency of backendDependencies(dependencies))
    services[BACKEND_PLUGIN_SERVICE_PREFIX + dependency] = { required: true };
  return {
    ...plugin,
    inject: services,
    apply(ctx: any, config?: unknown) {
      let disposed = false;
      ctx.on("dispose", () => {
        disposed = true;
      });
      const ready = () => {
        if (!disposed) ctx.set(BACKEND_PLUGIN_SERVICE_PREFIX + id, true);
      };
      const result = plugin.apply(ctx, config);
      if (result && typeof result.then === "function")
        return Promise.resolve(result).then((value) => {
          ready();
          return value;
        });
      ready();
      return result;
    }
  };
}

/** Prefer declared plugin ids over lower-level missing service names. */
export function missingBackendPluginDependencies(
  ctx: { get(name: string): unknown },
  dependencies: readonly string[] = [],
  inject: Record<string, { required: boolean }> = {}
): string[] {
  const missing = backendDependencies(dependencies).filter(
    (id) => !ctx.get(BACKEND_PLUGIN_SERVICE_PREFIX + id)
  );
  if (missing.length) return [...new Set(missing)];
  return [
    ...new Set(
      Object.entries(inject)
        .filter(([name, entry]) => entry.required && !ctx.get(name))
        .map(([name]) =>
          name.startsWith(BACKEND_PLUGIN_SERVICE_PREFIX)
            ? name.slice(BACKEND_PLUGIN_SERVICE_PREFIX.length)
            : name
        )
    )
  ];
}

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
