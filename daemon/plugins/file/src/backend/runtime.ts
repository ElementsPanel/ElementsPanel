import type { DaemonPluginContext } from "../../../../src/plugin";

/**
 * This plugin's private handle on its cordis context.
 *
 * The daemon core is bundled into `app.js`, so a plugin cannot import its
 * singletons. The only channel is the context `apply()` receives, and this
 * plugin is six modules deep — a `FileManager` throws translated errors, a
 * `FileWriter` logs from inside a stream callback — so threading a parameter
 * through all of them would say nothing the accessors below do not.
 *
 * A plugin with only a handful of such call sites should pass `ctx` as an
 * argument instead; see `plugins/market`.
 */
let context: DaemonPluginContext | undefined;

export function setPluginContext(value: DaemonPluginContext) {
  context = value;
}

export function core(): DaemonPluginContext {
  if (!context) throw new Error("The file plugin has not been initialized yet.");
  return context;
}

type PluginLogger = DaemonPluginContext["logger"];

/**
 * `ctx.logger` is bound to this plugin's own cordis scope, so it is gone once
 * that scope is disposed — and the disposer stops every upload, a path that
 * logs. Shutting down must not fail on a log line.
 */
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

/**
 * The file plugin can load before the instance plugin. `get()` avoids Cordis'
 * undeclared-property warning while keeping the existing lazy dependency.
 */
export const instances = () => {
  const service = core().get("instances");
  if (!service) throw new Error("Instance access requires the daemon instance plugin.");
  return service;
};

/**
 * How many file tasks are running across the whole daemon. It used to be
 * `globalEnv` in the core's configuration module, read by nothing but the file
 * routes, so it lives with them now.
 */
export const fileTasks = { count: 0 };
