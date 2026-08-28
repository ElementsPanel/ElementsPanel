import type { PanelPluginContext } from "../../../../src/app/plugins";

/**
 * The panel core is bundled into `app.js`, so this plugin cannot import its
 * singletons directly — doing so would compile a second copy of the storage
 * subsystem, the system config and the i18n instance. Everything the plugin
 * needs is injected once by `setup()` and read through the accessors below.
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
export const systemConfig = () => core().config;
export const logger = () => core().logger;
export const operationLogger = () => core().services.operationLogger;
export const $t = (key: string, options?: any): string =>
  core().i18n.$t(key, options) as unknown as string;
export const i18next = () => core().i18n.i18next;
export const globalVariable = () => core().common.GlobalVariable;
export const statsKeys = () => core().common.authStatsKeys;
export const ROLE = () => core().roles;
