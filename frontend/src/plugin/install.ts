import type { App } from "vue";
import type { Pinia } from "pinia";
import { ctx } from "./context";
import { getLoadedPlugins, loadPlugin, refreshPlugins, reloadPlugin, unloadPlugin } from "./loader";
import {
  ActionsService,
  DesktopService,
  I18nService,
  MenusService,
  RoutesService,
  UiService,
  VueService
} from "./services";

/**
 * The runtime API a production plugin can be enabled, disabled or replaced
 * through without rebuilding the panel. Copy or delete a plugin directory under
 * `web/plugins/`, then call `refresh()`.
 */
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

/**
 * Brings up the container and loads every installed plugin.
 *
 * Awaited before the session is restored and before the router is installed: the
 * `user` plugin owns the account API and the login route, so neither exists until
 * the plugins are in place.
 */
export async function setupPanelFrontendPlugins(app: App, pinia: Pinia) {
  ctx.plugin(VueService, { app, pinia });
  ctx.plugin(I18nService);
  ctx.plugin(RoutesService);
  ctx.plugin(UiService);
  ctx.plugin(MenusService);
  ctx.plugin(ActionsService);
  ctx.plugin(DesktopService);
  // Declared with no value and then set, so the object is stored as it is:
  // `ctx.provide(name, value)` would stamp cordis's tracker onto it and every
  // read would return a proxy. Only the `Service` classes need that tracing.
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

  await refreshPlugins();

  window.ElementsPanelPlugins = {
    load: loadPlugin,
    unload: unloadPlugin,
    reload: reloadPlugin,
    refresh: refreshPlugins,
    loaded: getLoadedPlugins
  };

  // Plugins that hold something outside the page — a socket, a poller — get one
  // chance to shut down cleanly.
  window.addEventListener("beforeunload", () => void ctx.stop(), { once: true });
}
