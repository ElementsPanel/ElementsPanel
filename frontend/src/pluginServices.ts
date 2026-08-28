import { shallowReactive } from "vue";

// Standalone registry for services exposed by panel frontend plugins.
//
// This module must stay free of panel imports. Panel code that only needs to
// resolve a plugin service (e.g. `services/apis/node.ts`) would otherwise have
// to import `@/plugins`, which pulls the whole card/route registry and every
// widget into the app entry graph and creates an import cycle with
// `@/lang/i18n`.

export interface PanelFrontendServiceRegistration {
  owner: unknown;
  service: unknown;
}

// Reactive so that `computed()` over a service — such as the Desktop plugin's
// login window or `useAppStateStore().authEnabled` — re-evaluates when a plugin
// is loaded, unloaded or reloaded at runtime.
export const panelFrontendServiceRegistrations = shallowReactive(
  new Map<string, PanelFrontendServiceRegistration>()
);

/**
 * Resolve a service exposed by a loaded panel plugin. Services are removed when
 * their owning plugin is unloaded, so callers should resolve them at use time.
 */
export function getPanelFrontendService<T = unknown>(name: string): T | undefined {
  return panelFrontendServiceRegistrations.get(name.trim())?.service as T | undefined;
}
