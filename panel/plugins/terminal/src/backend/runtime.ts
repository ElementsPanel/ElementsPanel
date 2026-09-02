import type { PanelPluginContext } from "../../../../src/app/plugin";

let context: PanelPluginContext | undefined;

export function setPluginContext(value: PanelPluginContext) {
  context = value;
}

export function core(): PanelPluginContext {
  if (!context) throw new Error("The terminal plugin has not been initialized yet.");
  return context;
}

export const koa = () => core().koa;
export const middleware = () => core().middleware;
export const roles = () => core().roles;
export const remote = () => core().remote;
export const $t = (key: string, options?: any): string =>
  core().i18n.$t(key, options) as unknown as string;
