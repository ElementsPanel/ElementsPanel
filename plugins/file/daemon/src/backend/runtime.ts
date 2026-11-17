import type { DaemonPluginContext } from "../../../../../core/daemon/src/plugin";

/** Resolve shared services through context to avoid bundling duplicate host singletons. */
let context: DaemonPluginContext | undefined;

export function setPluginContext(value: DaemonPluginContext) {
  context = value;
}

export function core(): DaemonPluginContext {
  if (!context) throw new Error("The file plugin has not been initialized yet.");
  return context;
}

type PluginLogger = DaemonPluginContext["logger"];

/** Use a quiet logger after disposal so upload cleanup can finish. */
const SILENT = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  success() {},
  extend: () => SILENT
} as unknown as PluginLogger;

export const logger = (): PluginLogger => core().logger ?? SILENT;
export const settings = () => core().settings;
export const protocol = () => core().protocol;
export const archive = () => core().archive;
export const transfer = () => core().transfer;
export const $t = (key: string, options?: any): string =>
  (core().get("i18n")?.$t(key, options) ?? key) as unknown as string;

/** Resolve the optional instance service lazily to avoid startup order and Cordis injection warnings. */
export const instances = () => {
  const service = core().get("instances");
  if (!service) throw new Error("Instance access requires the daemon instance plugin.");
  return service;
};

export const fileTasks = { count: 0 };
