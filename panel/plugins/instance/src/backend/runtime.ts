import type { PanelPluginContext } from "../../../../src/app/plugin";
import { v4 } from "uuid";

let context: PanelPluginContext | undefined;

export function setPluginContext(value: PanelPluginContext) {
  context = value;
}

export function core(): PanelPluginContext {
  if (!context) throw new Error("The instance plugin has not been initialized yet.");
  return context;
}

export const koa = () => core().koa;
export const middleware = () => core().middleware;
export const roles = () => core().roles;
export const identity = () => {
  const service = core().identity;
  return {
    ...service,
    identify: service.of,
    accessPolicy: () => service.accessPolicy
  };
};
export const operations = () => core().operations;
export const remote = () => core().remote;
export const $t = (key: string, options?: any): string =>
  core().i18n.$t(key, options) as unknown as string;

export const FILENAME_BLACKLIST = ["\\", "/", ".", "'", '"', "?", "*", "<", ">"];
export const timeUuid = () => v4().replace(/-/g, "") + Date.now();
