import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";

/** Resolve shared services through context to avoid bundling duplicate host singletons. */
let context: PanelPluginContext | undefined;

export function setPluginContext(value: PanelPluginContext) {
  context = value;
}

export function core(): PanelPluginContext {
  if (!context) throw new Error("The node plugin has not been initialized yet.");
  return context;
}

type PluginLogger = PanelPluginContext["logger"];

/** Use a quiet logger after disposal so socket cleanup can finish. */
const SILENT = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  success() {},
  extend: () => SILENT
} as unknown as PluginLogger;

export const storage = () => core().storage;
export const systemConfig = () => core().settings.config;
export const logger = (): PluginLogger => core().logger ?? SILENT;
export const $t = (key: string, options?: any): string =>
  core().i18n.$t(key, options) as unknown as string;
export const i18next = () => core().i18n.i18next;
