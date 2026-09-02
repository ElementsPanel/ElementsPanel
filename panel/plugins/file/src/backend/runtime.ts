import type { PanelPluginContext } from "../../../../src/app/plugin";

/**
 * This plugin's private handle on its cordis context.
 *
 * The panel core is bundled into `app.js`, so a plugin cannot import its
 * singletons. The route handlers below already own the name `ctx` — Koa's — so
 * the plugin context is reached through these accessors rather than threaded in
 * as a second parameter that would have to be renamed everywhere.
 */
let context: PanelPluginContext | undefined;

export function setPluginContext(value: PanelPluginContext) {
  context = value;
}

export function core(): PanelPluginContext {
  if (!context) throw new Error("The file plugin has not been initialized yet.");
  return context;
}

export const koa = () => core().koa;
export const middleware = () => core().middleware;
export const roles = () => core().roles;
export const remote = () => core().remote;
export const identity = () => core().identity;
export const operations = () => core().operations;
export const $t = (key: string, options?: any): string =>
  core().i18n.$t(key, options) as unknown as string;
