import { ctx } from "./context";
import {
  bootstrapPanelFrontendPlugin,
  getLoadedPlugins,
  loadPlugin,
  refreshPlugins,
  reloadPlugin,
  unloadPlugin
} from "./loader";

declare global {
  interface Window {
    ElementsPanelPlugins?: {
      load: typeof loadPlugin;
      unload: typeof unloadPlugin;
      reload: typeof reloadPlugin;
      refresh: typeof refreshPlugins;
      loaded: typeof getLoadedPlugins;
    };
  }
}

export async function setupPanelFrontendPlugins() {
  ctx.provide("plugins", undefined, true);
  ctx.set("plugins", {
    get loaded() {
      return getLoadedPlugins();
    },
    load: loadPlugin,
    unload: unloadPlugin,
    reload: reloadPlugin,
    refresh: refreshPlugins
  });

  await bootstrapPanelFrontendPlugin("runtime");
  await bootstrapPanelFrontendPlugin("i18n");
  await bootstrapPanelFrontendPlugin("console");
  await refreshPlugins();

  window.ElementsPanelPlugins = {
    load: loadPlugin,
    unload: unloadPlugin,
    reload: reloadPlugin,
    refresh: refreshPlugins,
    loaded: getLoadedPlugins
  };
  await ctx.parallel("plugins/loaded");
  await ctx.start();
}
