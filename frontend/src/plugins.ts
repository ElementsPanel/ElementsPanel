import type { App, Component } from "vue";
import type { Pinia } from "pinia";
import type { RouteRecordRaw, Router } from "vue-router";
import { LAYOUT_CARD_TYPES } from "./config";
import { router } from "./config/router";
import { getI18nInstance } from "./lang/i18n";
import { panelPluginModules } from "virtual:panel-plugins";

export interface PanelFrontendPluginMetadata {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  frontend?: string;
  ui?: string;
  [key: string]: unknown;
}

export interface PanelFrontendPluginContext {
  app: App;
  pinia: Pinia;
  router: Router;
  i18n: ReturnType<typeof getI18nInstance>;
  metadata: PanelFrontendPluginMetadata;
  directory: string;
  registerRoute: (route: RouteRecordRaw) => void;
  registerComponent: (name: string, component: Component) => void;
  registerLayoutCard: (name: string, component: Component) => void;
  registerLocaleMessages: (locale: string, messages: Record<string, unknown>) => void;
}

export interface PanelFrontendPluginDefinition {
  routes?: RouteRecordRaw[];
  components?: Record<string, Component>;
  layoutCards?: Record<string, Component>;
  localeMessages?: Record<string, Record<string, unknown>>;
  setup?: (context: PanelFrontendPluginContext) => unknown;
  ready?: (context: PanelFrontendPluginContext) => unknown;
  dispose?: (context: PanelFrontendPluginContext) => unknown;
}

export interface LoadedPanelFrontendPlugin {
  metadata: PanelFrontendPluginMetadata;
  directory: string;
  module: Record<string, unknown>;
  context?: PanelFrontendPluginContext;
  error?: Error;
}

const loadedPlugins: LoadedPanelFrontendPlugin[] = [];

function getDefinition(module: any): PanelFrontendPluginDefinition {
  if (module?.default && typeof module.default === "object") {
    return { ...module.default, ...module };
  }
  if (typeof module?.default === "function" && typeof module.setup !== "function") {
    return { ...module, setup: module.default };
  }
  return module || {};
}

async function runHook(plugin: LoadedPanelFrontendPlugin, hook: "ready" | "dispose") {
  if (plugin.error || !plugin.context) return;
  const callback = getDefinition(plugin.module)[hook];
  if (typeof callback !== "function") return;
  try {
    await callback(plugin.context);
  } catch (error) {
    console.error(`Panel frontend plugin hook failed: ${plugin.metadata.id}.${hook}`, error);
  }
}

export async function setupPanelFrontendPlugins(app: App, pinia: Pinia) {
  loadedPlugins.length = 0;
  for (const source of panelPluginModules) {
    const plugin: LoadedPanelFrontendPlugin = {
      metadata: source.metadata as PanelFrontendPluginMetadata,
      directory: source.directory,
      module: source.module
    };
    try {
      const context: PanelFrontendPluginContext = {
        app,
        pinia,
        router,
        i18n: getI18nInstance(),
        metadata: plugin.metadata,
        directory: plugin.directory,
        registerRoute: (route) => router.addRoute(route),
        registerComponent: (name, component) => app.component(name, component),
        registerLayoutCard: (name, component) => {
          LAYOUT_CARD_TYPES[name] = component;
          app.component(name, component);
        },
        registerLocaleMessages: (locale, messages) => {
          (getI18nInstance().global as any).mergeLocaleMessage(locale, messages);
        }
      };
      plugin.context = context;
      const definition = getDefinition(plugin.module);
      definition.routes?.forEach(context.registerRoute);
      Object.entries(definition.components || {}).forEach(([name, component]) => {
        context.registerComponent(name, component);
      });
      Object.entries(definition.layoutCards || {}).forEach(([name, component]) => {
        context.registerLayoutCard(name, component);
      });
      Object.entries(definition.localeMessages || {}).forEach(([locale, messages]) => {
        context.registerLocaleMessages(locale, messages);
      });
      if (typeof definition.setup === "function") await definition.setup(context);
      loadedPlugins.push(plugin);
      console.info(`Panel frontend plugin loaded: ${plugin.metadata.id}`);
    } catch (error: any) {
      plugin.error = error instanceof Error ? error : new Error(String(error));
      loadedPlugins.push(plugin);
      console.error(`Panel frontend plugin failed to load: ${plugin.metadata.id}`, error);
    }
  }

  window.addEventListener(
    "beforeunload",
    () => {
      for (const plugin of [...loadedPlugins].reverse()) void runHook(plugin, "dispose");
    },
    { once: true }
  );
}

export async function runPanelFrontendPluginHook(hook: "ready" | "dispose") {
  const plugins = hook === "dispose" ? [...loadedPlugins].reverse() : loadedPlugins;
  for (const plugin of plugins) await runHook(plugin, hook);
}

export function getLoadedPanelFrontendPlugins(): readonly LoadedPanelFrontendPlugin[] {
  return loadedPlugins;
}
