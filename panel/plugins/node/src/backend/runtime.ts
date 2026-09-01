import type { PanelPluginContext } from "../../../../src/app/plugin";

/**
 * This plugin's private handle on its cordis context.
 *
 * The panel core is bundled into `app.js`, so a plugin cannot import its
 * singletons: doing so would compile a second copy of the storage subsystem, the
 * system config and the i18n instance. The only channel is the context
 * `apply()` receives, and the remote-node subsystem below is four modules deep —
 * a `RemoteService` logs from inside a socket callback, far from `apply()`.
 *
 * A plugin with only a handful of such call sites should pass `ctx` as an
 * argument instead; see `plugins/market`.
 */
let context: PanelPluginContext | undefined;

export function setPluginContext(value: PanelPluginContext) {
  context = value;
}

export function core(): PanelPluginContext {
  if (!context) throw new Error("The node plugin has not been initialized yet.");
  return context;
}

type PluginLogger = PanelPluginContext["logger"];

/**
 * `ctx.logger` is bound to the plugin's own cordis scope, so it is gone the
 * moment that scope is disposed — and this plugin's disposer runs *then*, closing
 * every daemon socket, which is a code path that logs. Shutting the panel down
 * must not fail on a log line, and there is nothing left to log with, so it goes
 * nowhere instead.
 */
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
