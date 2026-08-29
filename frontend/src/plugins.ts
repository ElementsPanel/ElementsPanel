import { ref, shallowReactive, type App, type Component } from "vue";
import type { Pinia } from "pinia";
import type { RouteRecordName, RouteRecordRaw, Router } from "vue-router";
import {
  LAYOUT_CARD_TYPES,
  PLUGIN_LAYOUT_CARD_POOL_FACTORIES,
  type LayoutCardPoolItemFactory
} from "./config";
import { router } from "./config/router";
import { getI18nInstance } from "./lang/i18n";
import {
  getPanelFrontendService,
  panelFrontendServiceRegistrations as serviceRegistrations
} from "./pluginServices";
import { panelPluginModules } from "virtual:panel-plugins";

export { getPanelFrontendService } from "./pluginServices";

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
  registerLayoutCardPoolItem: (createItem: LayoutCardPoolItemFactory) => void;
  registerLocaleMessages: (locale: string, messages: Record<string, unknown>) => void;
  registerAppMenu: (menu: PanelFrontendAppMenu) => void;
  registerLoginAction: (action: PanelFrontendLoginAction) => void;
  registerDesktopApp: (desktopApp: PanelFrontendDesktopApp) => void;
  registerInstanceAction: (action: PanelFrontendInstanceAction) => void;
  registerScheduleAction: (action: PanelFrontendScheduleAction) => void;
  registerTerminalAction: (action: PanelFrontendTerminalAction) => void;
  /**
   * Mount a component for the lifetime of the app, alongside the panel's own
   * dialog providers. Use for global overlays that have no route or card.
   */
  registerGlobalComponent: (component: Component) => void;
  /** Register a runtime service that other plugins or the panel can consume. */
  registerService: (name: string, service: unknown) => void;
  /** Read a service exposed by another loaded plugin. */
  getService: <T = unknown>(name: string) => T | undefined;
}

export interface PanelFrontendAppMenuItem {
  value: string | number;
  title: string | (() => string);
}

export interface PanelFrontendAppMenu {
  title: string | (() => string);
  leftSideTitle?: string | (() => string);
  iconText?: string;
  icon?: Component;
  click: (...args: any[]) => unknown;
  conditions?: boolean | (() => boolean);
  onlyPC?: boolean;
  onlyHeader?: boolean;
  customClass?: string[];
  menus?: PanelFrontendAppMenuItem[];
}

export interface PanelFrontendLoginAction {
  title: string | (() => string);
  icon?: Component;
  click: () => unknown;
  condition?: boolean | (() => boolean);
}

export interface PanelFrontendPluginConfiguration {
  component: Component;
}

export interface PanelFrontendDesktopApp {
  id: string;
  label: string | (() => string);
  icon: Component | string;
  color?: string;
  route?: string;
  component?: Component;
  condition?: boolean | (() => boolean);
  initialWidth?: number;
  initialHeight?: number;
}

export interface PanelFrontendInstanceActionContext {
  mode: "normal" | "desktop";
  instanceId: string;
  daemonId: string;
  instanceInfo: unknown;
  daemon?: unknown;
  isGlobalTerminal: boolean;
}

export interface PanelFrontendInstanceAction {
  id: string;
  title: string | (() => string);
  icon: Component;
  normalComponent?: Component;
  desktopComponent?: Component;
  condition?: (context: PanelFrontendInstanceActionContext) => boolean;
  desktopInitialWidth?: number;
  desktopInitialHeight?: number;
}

export interface PanelFrontendScheduleAction {
  type: string;
  title: string | (() => string);
  inputPlaceholder?: string | (() => string);
  condition?: () => boolean;
}

/**
 * State a terminal action's `click` and `condition` are given. It mirrors what
 * the terminal itself knows about the instance in front of the user, so a
 * plugin button behaves the same in the normal terminal and in a Desktop
 * console window.
 */
export interface PanelFrontendTerminalActionContext {
  mode: "normal" | "desktop";
  instanceId: string;
  daemonId: string;
  instanceInfo: unknown;
  isStopped: boolean;
  isRunning: boolean;
  isGlobalTerminal: boolean;
  isDockerMode: boolean;
  clearTerminal: () => void;
}

/** A button a plugin adds to the terminal's instance-operations row. */
export interface PanelFrontendTerminalAction {
  id: string;
  title: string | (() => string);
  icon: Component;
  /** Matches the core buttons: "default" | "danger". */
  type?: string;
  class?: string;
  noConfirm?: boolean;
  props?: Record<string, unknown>;
  click: (context: PanelFrontendTerminalActionContext) => unknown;
  condition?: (context: PanelFrontendTerminalActionContext) => boolean;
}

export interface PanelFrontendPluginDefinition {
  routes?: RouteRecordRaw[];
  components?: Record<string, Component>;
  layoutCards?: Record<string, Component>;
  layoutCardPoolItems?: LayoutCardPoolItemFactory[];
  localeMessages?: Record<string, Record<string, unknown>>;
  appMenus?: PanelFrontendAppMenu[];
  loginActions?: PanelFrontendLoginAction[];
  desktopApps?: PanelFrontendDesktopApp[];
  instanceActions?: PanelFrontendInstanceAction[];
  scheduleActions?: PanelFrontendScheduleAction[];
  terminalActions?: PanelFrontendTerminalAction[];
  globalComponents?: Component[];
  configuration?: PanelFrontendPluginConfiguration;
  setup?: (context: PanelFrontendPluginContext) => unknown;
  ready?: (context: PanelFrontendPluginContext) => unknown;
  dispose?: (context: PanelFrontendPluginContext) => unknown;
}

interface PanelFrontendPluginSource {
  metadata: PanelFrontendPluginMetadata;
  directory: string;
  assetDirectory: string;
  entry?: string;
  styles?: string[];
  load: (cacheKey?: string) => Promise<Record<string, unknown>>;
}

export interface LoadedPanelFrontendPlugin {
  metadata: PanelFrontendPluginMetadata;
  directory: string;
  module: Record<string, unknown>;
  context?: PanelFrontendPluginContext;
  error?: Error;
  ready: boolean;
  configuration?: PanelFrontendPluginConfiguration;
}

interface InternalLoadedPanelFrontendPlugin extends LoadedPanelFrontendPlugin {
  source: PanelFrontendPluginSource;
  cleanups: Array<() => void | Promise<void>>;
  routeNames: Set<RouteRecordName>;
  routePaths: Set<string>;
}

interface LocaleRegistration {
  owner: InternalLoadedPanelFrontendPlugin;
  locale: string;
  messages: Record<string, unknown>;
}

interface ComponentRegistration {
  owner: InternalLoadedPanelFrontendPlugin;
  component: Component;
}

interface ComponentRegistrationState {
  original?: Component;
  registrations: ComponentRegistration[];
}

interface DesktopAppRegistration {
  owner: InternalLoadedPanelFrontendPlugin;
  desktopApp: PanelFrontendDesktopApp;
}

interface InstanceActionRegistration {
  owner: InternalLoadedPanelFrontendPlugin;
  action: PanelFrontendInstanceAction;
}

interface ScheduleActionRegistration {
  owner: InternalLoadedPanelFrontendPlugin;
  action: PanelFrontendScheduleAction;
}

interface TerminalActionRegistration {
  owner: InternalLoadedPanelFrontendPlugin;
  action: PanelFrontendTerminalAction;
}

interface GlobalComponentRegistration {
  owner: InternalLoadedPanelFrontendPlugin;
  component: Component;
}

interface PanelFrontendPluginRuntime {
  load: (id: string) => Promise<LoadedPanelFrontendPlugin>;
  unload: (id: string) => Promise<boolean>;
  reload: (id: string) => Promise<LoadedPanelFrontendPlugin>;
  refresh: () => Promise<readonly PanelFrontendPluginMetadata[]>;
  loaded: () => readonly LoadedPanelFrontendPlugin[];
}

declare global {
  interface Window {
    ElementsPanelPlugins?: PanelFrontendPluginRuntime;
  }
}

const loadedPlugins = shallowReactive<InternalLoadedPanelFrontendPlugin[]>([]);
const appMenus = shallowReactive<PanelFrontendAppMenu[]>([]);
const loginActions = shallowReactive<PanelFrontendLoginAction[]>([]);
const desktopAppRegistrations = shallowReactive<DesktopAppRegistration[]>([]);
const instanceActionRegistrations = shallowReactive<InstanceActionRegistration[]>([]);
const scheduleActionRegistrations = shallowReactive<ScheduleActionRegistration[]>([]);
const terminalActionRegistrations = shallowReactive<TerminalActionRegistration[]>([]);
const globalComponentRegistrations = shallowReactive<GlobalComponentRegistration[]>([]);
const routeRevision = ref(0);
const pluginSources = new Map<string, PanelFrontendPluginSource>();
const localeBaseMessages = new Map<string, Record<string, unknown>>();
const localeRegistrations: LocaleRegistration[] = [];
const componentRegistrations = new Map<string, ComponentRegistrationState>();
const layoutCardRegistrations = new Map<string, ComponentRegistrationState>();

let runtimeApp: App | undefined;
let runtimePinia: Pinia | undefined;
let pluginsReady = false;
let beforeUnloadRegistered = false;

function cloneMessages<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function getDefinition(module: any): PanelFrontendPluginDefinition {
  if (module?.default && typeof module.default === "object") {
    return { ...module.default, ...module };
  }
  if (typeof module?.default === "function" && typeof module.setup !== "function") {
    return { ...module, setup: module.default };
  }
  return module || {};
}

function normalizeMetadata(value: Record<string, unknown>): PanelFrontendPluginMetadata | null {
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!id) return null;
  return { ...value, id } as PanelFrontendPluginMetadata;
}

function toPluginUrl(value: string, manifestUrl: URL): string {
  return new URL(value, manifestUrl).href;
}

async function loadStyles(source: PanelFrontendPluginSource) {
  const links: HTMLLinkElement[] = [];
  try {
    await Promise.all(
      (source.styles || []).map(
        (href) =>
          new Promise<void>((resolve, reject) => {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = href;
            link.dataset.panelPlugin = source.metadata.id;
            link.addEventListener("load", () => resolve(), { once: true });
            link.addEventListener(
              "error",
              () => reject(new Error(`Failed to load panel plugin stylesheet: ${href}`)),
              { once: true }
            );
            document.head.appendChild(link);
            links.push(link);
          })
      )
    );
  } catch (error) {
    links.forEach((link) => link.remove());
    throw error;
  }
  return () => links.forEach((link) => link.remove());
}

function removePluginStyles(source: PanelFrontendPluginSource) {
  document
    .querySelectorAll<HTMLStyleElement>(
      `style[data-panel-plugin=${JSON.stringify(source.metadata.id)}]`
    )
    .forEach((style) => style.remove());
  for (const href of source.styles || []) {
    const normalizedHref = new URL(href, document.baseURI).href;
    document.querySelectorAll<HTMLLinkElement>("link[rel='stylesheet']").forEach((link) => {
      try {
        if (new URL(link.href, document.baseURI).href === normalizedHref) link.remove();
      } catch {
        // Ignore malformed third-party stylesheet URLs.
      }
    });
  }
}

async function fetchProductionPluginSources(): Promise<PanelFrontendPluginSource[]> {
  const manifestUrl = new URL("plugins/manifest.json", document.baseURI);
  const response = await fetch(manifestUrl.href, { cache: "no-store" });
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Failed to load panel plugin manifest: HTTP ${response.status}`);
  }
  const responseBody = await response.json();
  // Older panel builds may still pass the manifest through the standard API
  // envelope. Accept both the raw array and `{ data: [...] }` forms.
  const manifest = Array.isArray(responseBody) ? responseBody : responseBody?.data;
  if (!Array.isArray(manifest)) throw new Error("Invalid panel plugin manifest.");

  const sources: PanelFrontendPluginSource[] = [];
  for (const item of manifest) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const metadata = normalizeMetadata((item as any).metadata || item);
    const entry = typeof (item as any).entry === "string" ? (item as any).entry : "";
    if (!metadata || metadata.enabled === false || !entry) continue;
    const entryUrl = toPluginUrl(entry, manifestUrl);
    const styles = Array.isArray((item as any).styles)
      ? (item as any).styles
          .filter((style: unknown): style is string => typeof style === "string")
          .map((style: string) => toPluginUrl(style, manifestUrl))
      : [];
    sources.push({
      metadata,
      directory:
        typeof (item as any).directory === "string" ? (item as any).directory : metadata.id,
      assetDirectory:
        typeof (item as any).assetDirectory === "string"
          ? (item as any).assetDirectory
          : metadata.id,
      entry: entryUrl,
      styles,
      load: async (cacheKey) => {
        const url = new URL(entryUrl);
        if (cacheKey) url.searchParams.set("panel_plugin_reload", cacheKey);
        return import(/* @vite-ignore */ url.href) as Promise<Record<string, unknown>>;
      }
    });
  }
  return sources;
}

async function discoverPluginSources() {
  const sources = import.meta.env.DEV
    ? (panelPluginModules as PanelFrontendPluginSource[])
    : await fetchProductionPluginSources();
  const uniqueSources = new Map<string, PanelFrontendPluginSource>();
  for (const source of sources) {
    const metadata = normalizeMetadata(source.metadata);
    if (!metadata || metadata.enabled === false || uniqueSources.has(metadata.id)) continue;
    uniqueSources.set(metadata.id, { ...source, metadata });
  }
  return [...uniqueSources.values()].sort(
    (a, b) =>
      (Number(a.metadata.priority) || 0) - (Number(b.metadata.priority) || 0) ||
      a.metadata.id.localeCompare(b.metadata.id)
  );
}

function removeItem<T>(items: T[], item: T) {
  const index = items.indexOf(item);
  if (index >= 0) items.splice(index, 1);
}

function reapplyLocale(locale: string) {
  const i18n = getI18nInstance();
  const baseMessages = cloneMessages(localeBaseMessages.get(locale) || {});
  (i18n.global as any).setLocaleMessage(locale, baseMessages);
  localeRegistrations
    .filter((registration) => registration.locale === locale)
    .forEach((registration) => {
      (i18n.global as any).mergeLocaleMessage(locale, cloneMessages(registration.messages));
    });
}

function registerLocaleMessages(
  plugin: InternalLoadedPanelFrontendPlugin,
  locale: string,
  messages: Record<string, unknown>
) {
  if (!localeBaseMessages.has(locale)) {
    localeBaseMessages.set(
      locale,
      cloneMessages((getI18nInstance().global as any).getLocaleMessage(locale) || {})
    );
  }
  const registration = { owner: plugin, locale, messages: cloneMessages(messages) };
  localeRegistrations.push(registration);
  reapplyLocale(locale);
  plugin.cleanups.push(() => {
    removeItem(localeRegistrations, registration);
    reapplyLocale(locale);
  });
}

function applyComponentRegistration(
  app: App,
  name: string,
  states: Map<string, ComponentRegistrationState>
) {
  const state = states.get(name);
  if (!state) return;
  const latest = state.registrations[state.registrations.length - 1]?.component;
  if (latest) {
    app.component(name, latest);
  } else if (state.original) {
    app.component(name, state.original);
    states.delete(name);
  } else {
    delete app._context.components[name];
    states.delete(name);
  }
}

function registerComponent(
  plugin: InternalLoadedPanelFrontendPlugin,
  name: string,
  component: Component
) {
  const app = plugin.context!.app;
  let state = componentRegistrations.get(name);
  if (!state) {
    state = { original: app.component(name), registrations: [] };
    componentRegistrations.set(name, state);
  }
  const registration = { owner: plugin, component };
  state.registrations.push(registration);
  applyComponentRegistration(app, name, componentRegistrations);
  plugin.cleanups.push(() => {
    const current = componentRegistrations.get(name);
    if (!current) return;
    removeItem(current.registrations, registration);
    applyComponentRegistration(app, name, componentRegistrations);
  });
}

function applyLayoutCardRegistration(name: string) {
  const state = layoutCardRegistrations.get(name);
  if (!state) return;
  const latest = state.registrations[state.registrations.length - 1]?.component;
  if (latest) {
    LAYOUT_CARD_TYPES[name] = latest;
  } else if (state.original) {
    LAYOUT_CARD_TYPES[name] = state.original;
    layoutCardRegistrations.delete(name);
  } else {
    delete LAYOUT_CARD_TYPES[name];
    layoutCardRegistrations.delete(name);
  }
}

function registerLayoutCard(
  plugin: InternalLoadedPanelFrontendPlugin,
  name: string,
  component: Component
) {
  let state = layoutCardRegistrations.get(name);
  if (!state) {
    state = { original: LAYOUT_CARD_TYPES[name], registrations: [] };
    layoutCardRegistrations.set(name, state);
  }
  const registration = { owner: plugin, component };
  state.registrations.push(registration);
  applyLayoutCardRegistration(name);
  plugin.cleanups.push(() => {
    const current = layoutCardRegistrations.get(name);
    if (!current) return;
    removeItem(current.registrations, registration);
    applyLayoutCardRegistration(name);
  });
  registerComponent(plugin, name, component);
}

function registerDesktopApp(
  plugin: InternalLoadedPanelFrontendPlugin,
  desktopApp: PanelFrontendDesktopApp
) {
  const id = desktopApp.id.trim();
  if (!id) throw new Error(`Panel frontend plugin "${plugin.metadata.id}" has an invalid desktop app id.`);
  if (desktopAppRegistrations.some((registration) => registration.desktopApp.id === id)) {
    throw new Error(`Panel frontend desktop app id is already registered: ${id}`);
  }
  if (!desktopApp.component && !desktopApp.route) {
    throw new Error(
      `Panel frontend plugin "${plugin.metadata.id}" desktop app "${id}" requires a component or route.`
    );
  }
  const registration = { owner: plugin, desktopApp: { ...desktopApp, id } };
  desktopAppRegistrations.push(registration);
  plugin.cleanups.push(() => removeItem(desktopAppRegistrations, registration));
}

function registerInstanceAction(
  plugin: InternalLoadedPanelFrontendPlugin,
  action: PanelFrontendInstanceAction
) {
  const id = action.id.trim();
  if (!id) {
    throw new Error(`Panel frontend plugin "${plugin.metadata.id}" has an invalid instance action id.`);
  }
  if (instanceActionRegistrations.some((registration) => registration.action.id === id)) {
    throw new Error(`Panel frontend instance action id is already registered: ${id}`);
  }
  if (!action.normalComponent && !action.desktopComponent) {
    throw new Error(
      `Panel frontend plugin "${plugin.metadata.id}" instance action "${id}" requires a normal or desktop component.`
    );
  }
  const registration = { owner: plugin, action: { ...action, id } };
  instanceActionRegistrations.push(registration);
  plugin.cleanups.push(() => removeItem(instanceActionRegistrations, registration));
}

function registerScheduleAction(
  plugin: InternalLoadedPanelFrontendPlugin,
  action: PanelFrontendScheduleAction
) {
  const type = action.type.trim();
  if (!type) {
    throw new Error(`Panel frontend plugin "${plugin.metadata.id}" has an invalid schedule action type.`);
  }
  if (scheduleActionRegistrations.some((registration) => registration.action.type === type)) {
    throw new Error(`Panel frontend schedule action type is already registered: ${type}`);
  }
  const registration = { owner: plugin, action: { ...action, type } };
  scheduleActionRegistrations.push(registration);
  plugin.cleanups.push(() => removeItem(scheduleActionRegistrations, registration));
}

function registerTerminalAction(
  plugin: InternalLoadedPanelFrontendPlugin,
  action: PanelFrontendTerminalAction
) {
  const id = action.id.trim();
  if (!id) {
    throw new Error(`Panel frontend plugin "${plugin.metadata.id}" has an invalid terminal action id.`);
  }
  if (terminalActionRegistrations.some((registration) => registration.action.id === id)) {
    throw new Error(`Panel frontend terminal action id is already registered: ${id}`);
  }
  const registration = { owner: plugin, action: { ...action, id } };
  terminalActionRegistrations.push(registration);
  plugin.cleanups.push(() => removeItem(terminalActionRegistrations, registration));
}

function registerService(
  plugin: InternalLoadedPanelFrontendPlugin,
  name: string,
  service: unknown
) {
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error(`Panel frontend plugin "${plugin.metadata.id}" registered an empty service name.`);
  }
  const existing = serviceRegistrations.get(normalizedName);
  if (existing && existing.owner !== plugin) {
    throw new Error(`Panel frontend service name is already registered: ${normalizedName}`);
  }
  serviceRegistrations.set(normalizedName, { owner: plugin, service });
  plugin.cleanups.push(() => {
    const current = serviceRegistrations.get(normalizedName);
    if (current?.owner === plugin) serviceRegistrations.delete(normalizedName);
  });
}

function registerRoute(plugin: InternalLoadedPanelFrontendPlugin, route: RouteRecordRaw) {
  const existingRoutes = new Set(router.getRoutes());
  const removeRoute = router.addRoute(route);
  routeRevision.value += 1;
  const addedRoutes = router.getRoutes().filter((record) => !existingRoutes.has(record));
  addedRoutes.forEach((record) => {
    plugin.routePaths.add(record.path);
    if (record.name !== undefined) plugin.routeNames.add(record.name);
  });
  plugin.cleanups.push(() => {
    removeRoute();
    routeRevision.value += 1;
  });
}

function createContext(plugin: InternalLoadedPanelFrontendPlugin): PanelFrontendPluginContext {
  if (!runtimeApp || !runtimePinia) throw new Error("Panel plugin runtime has not been initialized.");
  const context: PanelFrontendPluginContext = {
    app: runtimeApp,
    pinia: runtimePinia,
    router,
    i18n: getI18nInstance(),
    metadata: plugin.metadata,
    directory: plugin.directory,
    registerRoute: (route) => registerRoute(plugin, route),
    registerComponent: (name, component) => registerComponent(plugin, name, component),
    registerLayoutCard: (name, component) => registerLayoutCard(plugin, name, component),
    registerLayoutCardPoolItem: (createItem) => {
      PLUGIN_LAYOUT_CARD_POOL_FACTORIES.push(createItem);
      plugin.cleanups.push(() => removeItem(PLUGIN_LAYOUT_CARD_POOL_FACTORIES, createItem));
    },
    registerLocaleMessages: (locale, messages) => registerLocaleMessages(plugin, locale, messages),
    registerAppMenu: (menu) => {
      appMenus.push(menu);
      plugin.cleanups.push(() => removeItem(appMenus, menu));
    },
    registerLoginAction: (action) => {
      loginActions.push(action);
      plugin.cleanups.push(() => removeItem(loginActions, action));
    },
    registerDesktopApp: (desktopApp) => registerDesktopApp(plugin, desktopApp),
    registerInstanceAction: (action) => registerInstanceAction(plugin, action),
    registerScheduleAction: (action) => registerScheduleAction(plugin, action),
    registerTerminalAction: (action) => registerTerminalAction(plugin, action),
    registerGlobalComponent: (component) => {
      const registration = { owner: plugin, component };
      globalComponentRegistrations.push(registration);
      plugin.cleanups.push(() => removeItem(globalComponentRegistrations, registration));
    },
    registerService: (name, service) => registerService(plugin, name, service),
    getService: <T = unknown>(name: string) => getPanelFrontendService<T>(name)
  };
  return context;
}

async function runHook(plugin: InternalLoadedPanelFrontendPlugin, hook: "ready" | "dispose") {
  if (plugin.error || !plugin.context) return;
  const callback = getDefinition(plugin.module)[hook];
  if (typeof callback !== "function") return;
  try {
    await callback(plugin.context);
  } catch (error) {
    console.error(`Panel frontend plugin hook failed: ${plugin.metadata.id}.${hook}`, error);
  }
}

async function cleanupPlugin(plugin: InternalLoadedPanelFrontendPlugin) {
  for (const cleanup of [...plugin.cleanups].reverse()) {
    try {
      await cleanup();
    } catch (error) {
      console.error(`Panel frontend plugin cleanup failed: ${plugin.metadata.id}`, error);
    }
  }
  removePluginStyles(plugin.source);
  plugin.cleanups.length = 0;
}

function isCurrentPluginRoute(plugin: InternalLoadedPanelFrontendPlugin) {
  return router.currentRoute.value.matched.some(
    (record) =>
      plugin.routePaths.has(record.path) ||
      (record.name !== undefined && plugin.routeNames.has(record.name))
  );
}

async function installPluginSource(source: PanelFrontendPluginSource, cacheKey?: string) {
  const existing = loadedPlugins.find((plugin) => plugin.metadata.id === source.metadata.id);
  if (existing) return existing;

  const plugin = shallowReactive<InternalLoadedPanelFrontendPlugin>({
    source,
    metadata: source.metadata,
    directory: source.directory,
    module: {},
    cleanups: [],
    routeNames: new Set(),
    routePaths: new Set(),
    ready: false
  });
  loadedPlugins.push(plugin);
  try {
    if (!import.meta.env.DEV) plugin.cleanups.push(await loadStyles(source));
    plugin.module = await source.load(cacheKey);
    plugin.context = createContext(plugin);
    const definition = getDefinition(plugin.module);
    if (definition.configuration?.component) {
      plugin.configuration = definition.configuration;
    }
    definition.routes?.forEach(plugin.context.registerRoute);
    Object.entries(definition.components || {}).forEach(([name, component]) => {
      plugin.context!.registerComponent(name, component);
    });
    Object.entries(definition.layoutCards || {}).forEach(([name, component]) => {
      plugin.context!.registerLayoutCard(name, component);
    });
    definition.layoutCardPoolItems?.forEach(plugin.context.registerLayoutCardPoolItem);
    Object.entries(definition.localeMessages || {}).forEach(([locale, messages]) => {
      plugin.context!.registerLocaleMessages(locale, messages);
    });
    definition.appMenus?.forEach(plugin.context.registerAppMenu);
    definition.loginActions?.forEach(plugin.context.registerLoginAction);
    definition.desktopApps?.forEach(plugin.context.registerDesktopApp);
    definition.instanceActions?.forEach(plugin.context.registerInstanceAction);
    definition.scheduleActions?.forEach(plugin.context.registerScheduleAction);
    definition.terminalActions?.forEach(plugin.context.registerTerminalAction);
    definition.globalComponents?.forEach(plugin.context.registerGlobalComponent);
    if (typeof definition.setup === "function") {
      const setupCleanup = await definition.setup(plugin.context);
      if (typeof setupCleanup === "function") plugin.cleanups.push(setupCleanup as () => void);
    }
    if (pluginsReady) {
      await runHook(plugin, "ready");
      plugin.ready = true;
    }
    console.info(`Panel frontend plugin loaded: ${plugin.metadata.id}`);
  } catch (error: any) {
    plugin.error = error instanceof Error ? error : new Error(String(error));
    await cleanupPlugin(plugin);
    console.error(`Panel frontend plugin failed to load: ${plugin.metadata.id}`, error);
  }
  return plugin;
}

export async function refreshPanelFrontendPlugins() {
  const sources = await discoverPluginSources();
  const nextSources = new Map(sources.map((source) => [source.metadata.id, source]));
  pluginSources.clear();
  nextSources.forEach((source, id) => pluginSources.set(id, source));
  if (runtimeApp && runtimePinia) {
    for (const plugin of [...loadedPlugins].reverse()) {
      if (!nextSources.has(plugin.metadata.id)) {
        await unloadPanelFrontendPlugin(plugin.metadata.id);
      }
    }
    for (const source of sources) {
      if (!loadedPlugins.some((plugin) => plugin.metadata.id === source.metadata.id)) {
        await installPluginSource(source);
      }
    }
  }
  return sources.map((source) => source.metadata) as readonly PanelFrontendPluginMetadata[];
}

export async function loadPanelFrontendPlugin(id: string): Promise<LoadedPanelFrontendPlugin> {
  if (!runtimeApp || !runtimePinia) throw new Error("Panel plugin runtime has not been initialized.");
  let source = pluginSources.get(id);
  if (!source && !import.meta.env.DEV) {
    await refreshPanelFrontendPlugins();
    source = pluginSources.get(id);
  }
  if (!source) throw new Error(`Panel frontend plugin not found: ${id}`);
  return installPluginSource(source);
}

export async function unloadPanelFrontendPlugin(id: string): Promise<boolean> {
  const plugin = loadedPlugins.find((candidate) => candidate.metadata.id === id);
  if (!plugin) return false;
  if (isCurrentPluginRoute(plugin)) await router.replace("/404");
  await runHook(plugin, "dispose");
  await cleanupPlugin(plugin);
  removeItem(loadedPlugins, plugin);
  console.info(`Panel frontend plugin unloaded: ${plugin.metadata.id}`);
  return true;
}

export async function reloadPanelFrontendPlugin(id: string): Promise<LoadedPanelFrontendPlugin> {
  await unloadPanelFrontendPlugin(id);
  if (!import.meta.env.DEV) {
    const sources = await discoverPluginSources();
    pluginSources.clear();
    sources.forEach((source) => pluginSources.set(source.metadata.id, source));
  }
  const source = pluginSources.get(id);
  if (!source) throw new Error(`Panel frontend plugin not found: ${id}`);
  return installPluginSource(source, `${Date.now()}`);
}

export async function setupPanelFrontendPlugins(app: App, pinia: Pinia) {
  runtimeApp = app;
  runtimePinia = pinia;
  pluginsReady = false;
  for (const plugin of [...loadedPlugins].reverse()) {
    await unloadPanelFrontendPlugin(plugin.metadata.id);
  }
  appMenus.length = 0;
  loginActions.length = 0;
  desktopAppRegistrations.length = 0;
  instanceActionRegistrations.length = 0;
  scheduleActionRegistrations.length = 0;
  terminalActionRegistrations.length = 0;
  globalComponentRegistrations.length = 0;
  serviceRegistrations.clear();
  await refreshPanelFrontendPlugins();

  window.ElementsPanelPlugins = {
    load: loadPanelFrontendPlugin,
    unload: unloadPanelFrontendPlugin,
    reload: reloadPanelFrontendPlugin,
    refresh: refreshPanelFrontendPlugins,
    loaded: getLoadedPanelFrontendPlugins
  };

  if (!beforeUnloadRegistered) {
    beforeUnloadRegistered = true;
    window.addEventListener(
      "beforeunload",
      () => {
        for (const plugin of [...loadedPlugins].reverse()) void runHook(plugin, "dispose");
      },
      { once: true }
    );
  }
}

export async function runPanelFrontendPluginHook(hook: "ready" | "dispose") {
  if (hook === "ready") pluginsReady = true;
  const plugins = hook === "dispose" ? [...loadedPlugins].reverse() : [...loadedPlugins];
  for (const plugin of plugins) {
    await runHook(plugin, hook);
    if (hook === "ready" && !plugin.error) plugin.ready = true;
  }
}

export function getLoadedPanelFrontendPlugins(): readonly LoadedPanelFrontendPlugin[] {
  return loadedPlugins;
}

export function getPanelFrontendAppMenus(): readonly PanelFrontendAppMenu[] {
  return appMenus;
}

export function getPanelFrontendRouteRevision(): number {
  return routeRevision.value;
}

export function isPanelFrontendPluginRoute(path: string): boolean {
  return loadedPlugins.some((plugin) => plugin.routePaths.has(path));
}

export function getPanelFrontendLoginActions(): readonly PanelFrontendLoginAction[] {
  return loginActions;
}

export function getPanelFrontendGlobalComponents(): readonly Component[] {
  return globalComponentRegistrations.map((registration) => registration.component);
}

export function getPanelFrontendDesktopApps(): readonly PanelFrontendDesktopApp[] {
  const desktopApps = new Map<string, PanelFrontendDesktopApp>();
  for (const registration of desktopAppRegistrations) {
    desktopApps.set(registration.desktopApp.id, registration.desktopApp);
  }
  return [...desktopApps.values()];
}

export function getPanelFrontendInstanceActions(): readonly PanelFrontendInstanceAction[] {
  return instanceActionRegistrations.map((registration) => registration.action);
}

export function getPanelFrontendScheduleActions(): readonly PanelFrontendScheduleAction[] {
  return scheduleActionRegistrations.map((registration) => registration.action);
}

export function getPanelFrontendTerminalActions(): readonly PanelFrontendTerminalAction[] {
  return terminalActionRegistrations.map((registration) => registration.action);
}

/**
 * Turn the registered terminal actions into the button descriptors both
 * terminals already render. Keeping the adapter here means the two call sites
 * stay identical and neither has to know how a registration is shaped.
 */
export function buildPanelFrontendTerminalButtons(
  context: PanelFrontendTerminalActionContext
) {
  return getPanelFrontendTerminalActions().map((action) => ({
    title: typeof action.title === "function" ? action.title() : action.title,
    icon: action.icon,
    type: action.type ?? "default",
    class: action.class,
    noConfirm: action.noConfirm ?? true,
    props: action.props ?? {},
    click: () => action.click(context),
    condition: () => (action.condition ? action.condition(context) : true)
  }));
}
