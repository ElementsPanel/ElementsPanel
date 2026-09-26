import { ctx } from "./context";
import {
  bootstrapPanelFrontendPlugin,
  auditFrontendPlugins,
  getPluginDiagnostics,
  getLoadedPlugins,
  loadPlugin,
  refreshPlugins,
  reloadPlugin,
  unloadPlugin,
  watchPluginChanges
} from "./loader";

declare global {
  interface Window {
    ElementsPanelPlugins?: {
      load: typeof loadPlugin;
      unload: typeof unloadPlugin;
      reload: typeof reloadPlugin;
      refresh: typeof refreshPlugins;
      loaded: typeof getLoadedPlugins;
      diagnostics: typeof getPluginDiagnostics;
      audit: typeof auditFrontendPlugins;
    };
  }
}

export async function setupPanelFrontendPlugins() {
  ctx.provide("plugins", undefined, true);
  ctx.set("plugins", {
    get loaded() {
      return getLoadedPlugins();
    },
    get diagnostics() {
      return getPluginDiagnostics();
    },
    load: loadPlugin,
    unload: unloadPlugin,
    reload: reloadPlugin,
    refresh: refreshPlugins,
    audit: auditFrontendPlugins
  });

  await bootstrapPanelFrontendPlugin("runtime");
  await bootstrapPanelFrontendPlugin("i18n");
  await bootstrapPanelFrontendPlugin("console");
  await refreshPlugins();
  auditFrontendPlugins();

  window.ElementsPanelPlugins = {
    load: loadPlugin,
    unload: unloadPlugin,
    reload: reloadPlugin,
    refresh: refreshPlugins,
    loaded: getLoadedPlugins,
    diagnostics: getPluginDiagnostics,
    audit: auditFrontendPlugins
  };
  await ctx.parallel("plugins/loaded");
  await ctx.start();
  ctx.effect(watchPluginChanges);
}
