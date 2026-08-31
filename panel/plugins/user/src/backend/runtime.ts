import type { PanelPluginContext } from "../../../../src/app/plugin";

/**
 * This plugin's private handle on its cordis context.
 *
 * The panel core is bundled into `app.js`, so a plugin cannot import its
 * singletons: doing so would compile a second copy of the storage subsystem, the
 * system config and the i18n instance. The only channel is the context
 * `apply()` receives, and this plugin has fourteen modules that need something
 * from it — threading a parameter through all of them would say nothing the
 * accessors below do not.
 *
 * A plugin with only a handful of such call sites should pass `ctx` as an
 * argument instead; see `plugins/market`.
 */
let context: PanelPluginContext | undefined;

export function setPluginContext(value: PanelPluginContext) {
  context = value;
}

export function core(): PanelPluginContext {
  if (!context) throw new Error("The user plugin has not been initialized yet.");
  return context;
}

export const storage = () => core().storage;
export const systemConfig = () => core().settings.config;
export const logger = () => core().logger;
export const operationLogger = () => core().operations;
export const $t = (key: string, options?: any): string =>
  core().i18n.$t(key, options) as unknown as string;
export const i18next = () => core().i18n.i18next;
export const globalVariable = () => core().globals;
export const ROLE = () => core().roles;
