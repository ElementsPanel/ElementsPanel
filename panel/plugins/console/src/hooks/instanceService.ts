import { usePluginService, type FrontendInstanceService } from "@/plugin/context";

export type InstanceHooks = FrontendInstanceService["hooks"];

export function instanceHooks(): InstanceHooks {
  const instance = usePluginService<FrontendInstanceService>("instance");
  if (!instance) throw new Error('Panel frontend plugin "instance" is not loaded.');
  return instance.hooks;
}

/** Resolve on every call, including after the provider has been reloaded. */
export const instanceHook = <K extends keyof InstanceHooks>(name: K) =>
  ((...args: any[]) => (instanceHooks()[name] as Function)(...args)) as InstanceHooks[K];

/** Compatibility views over plugin-owned data, without importing its implementation. */
export function instanceData<K extends keyof InstanceHooks>(
  name: K,
  fallback: object
): InstanceHooks[K] {
  const current = () =>
    usePluginService<FrontendInstanceService>("instance")?.hooks[name] ?? fallback;
  return new Proxy(fallback, {
    get: (_, key) => Reflect.get(current() as object, key),
    has: (_, key) => Reflect.has(current() as object, key),
    ownKeys: () => Reflect.ownKeys(current() as object),
    getOwnPropertyDescriptor: (target, key) => {
      const base = Reflect.getOwnPropertyDescriptor(target, key);
      if (base && !base.configurable) return base;
      const descriptor = Reflect.getOwnPropertyDescriptor(current() as object, key);
      return descriptor && { ...descriptor, configurable: true };
    }
  }) as InstanceHooks[K];
}
