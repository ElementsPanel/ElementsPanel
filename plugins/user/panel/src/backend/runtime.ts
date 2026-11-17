import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";

/** Resolve shared services through context to avoid bundling duplicate host singletons. */
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
