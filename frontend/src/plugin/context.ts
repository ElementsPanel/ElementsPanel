import { Context } from "cordis";
import { shallowRef, type App, type Component } from "vue";
import type { Pinia } from "pinia";
import type { RouteRecordRaw, Router } from "vue-router";
import type { I18n } from "vue-i18n";
import type { LayoutCardPoolItemFactory } from "@/config";
import type { RemoteNodeHook } from "@/hooks/useRemoteNode";
import type { NodePluginApi } from "@/services/apis/node";
import type { UserPluginApi } from "@/services/apis/user";
import type { LoadedPanelFrontendPlugin, PanelFrontendPluginMetadata } from "./loader";

/**
 * The frontend's cordis container, and the complete list of what a plugin can
 * see.
 *
 * Every capability is a service on the context; every registration a plugin
 * makes is an effect owned by that plugin's scope, so unloading a plugin undoes
 * its routes, cards, menus, actions and translations without the plugin writing
 * any cleanup code. `ctx.logger` and the timer helpers come with cordis itself.
 *
 * Keep this module import-light. Panel code that only needs to resolve a
 * plugin-provided service — `services/apis/user.ts`, say — imports it, and
 * pulling the card and route registries in here would drag every widget into the
 * app entry graph and create an import cycle with `@/lang/i18n`.
 */
export const ctx = new Context();

/**
 * Bumped whenever any service appears or disappears. A `computed()` that reads
 * a plugin-provided service must read this first, or it will not re-evaluate
 * when the owning plugin is loaded or unloaded — cordis's registry is not a Vue
 * reactive source.
 */
export const serviceRevision = shallowRef(0);
ctx.on("internal/service", () => {
  serviceRevision.value += 1;
});

/**
 * Resolve a service a plugin may or may not provide, reactively. Returns
 * `undefined` when nothing provides it, so callers degrade instead of throwing.
 */
export function usePluginService<T>(name: string): T | undefined {
  void serviceRevision.value;
  return ctx.get(name as never) as T | undefined;
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
 * the terminal itself knows about the instance in front of the user, so a plugin
 * button behaves the same in the normal terminal and in a Desktop console.
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

/** The button descriptor both terminals render. */
export interface PanelFrontendTerminalButton {
  title: string;
  icon: Component;
  type: string;
  class?: string;
  noConfirm: boolean;
  props: Record<string, unknown>;
  click: () => unknown;
  condition: () => boolean;
}

/** The Vue application a plugin registers into. Stored raw, never reactive. */
export interface FrontendVueService {
  readonly app: App;
  readonly pinia: Pinia;
  readonly router: Router;
}

export interface FrontendI18nService {
  readonly instance: I18n;
  /**
   * Merge the plugin's translations, keyed by locale (`en_us`, `zh_cn`, ...).
   * The base catalogue is snapshotted and re-applied on unload, so a plugin's
   * strings — including any that override a core string — leave with it.
   */
  define(messages: Record<string, Record<string, unknown>>): () => void;
}

export interface FrontendRoutesService {
  /** Adds a route, removed again when the calling plugin unloads. */
  add(route: RouteRecordRaw): () => void;
  /** Read inside a `computed()` that enumerates routes, to make it reactive. */
  readonly revision: number;
  /** Whether a path belongs to a plugin rather than to the core. */
  isPluginRoute(path: string): boolean;
  /** The name of the plugin that added a path, if a plugin did. */
  ownerOf(path: string): string | undefined;
}

export interface FrontendUiService {
  /** Registers a global component; a previous registration is restored on unload. */
  component(name: string, component: Component): () => void;
  /** Registers a layout card; a core card of the same name is restored on unload. */
  layoutCard(name: string, component: Component): () => void;
  /** Adds an entry to the design-mode card picker. */
  layoutCardPoolItem(createItem: LayoutCardPoolItemFactory): () => void;
  /**
   * Mounts a component for the lifetime of the plugin, alongside the panel's own
   * dialog providers. For global overlays that belong to no route or card.
   */
  globalComponent(component: Component): () => void;
  readonly globalComponents: readonly Component[];
}

export interface FrontendMenusService {
  app(menu: PanelFrontendAppMenu): () => void;
  login(action: PanelFrontendLoginAction): () => void;
  readonly appMenus: readonly PanelFrontendAppMenu[];
  readonly loginActions: readonly PanelFrontendLoginAction[];
}

export interface FrontendActionsService {
  instance(action: PanelFrontendInstanceAction): () => void;
  schedule(action: PanelFrontendScheduleAction): () => void;
  terminal(action: PanelFrontendTerminalAction): () => void;
  readonly instances: readonly PanelFrontendInstanceAction[];
  readonly schedules: readonly PanelFrontendScheduleAction[];
  readonly terminals: readonly PanelFrontendTerminalAction[];
  /**
   * The registered terminal actions as the button descriptors both terminals
   * already render, so neither call site has to know how a registration looks.
   */
  terminalButtons(state: PanelFrontendTerminalActionContext): PanelFrontendTerminalButton[];
}

export interface FrontendPluginsService {
  readonly loaded: readonly LoadedPanelFrontendPlugin[];
  load(id: string): Promise<LoadedPanelFrontendPlugin>;
  unload(id: string): Promise<boolean>;
  reload(id: string): Promise<LoadedPanelFrontendPlugin>;
  /** Re-reads the installed plugins and loads or unloads to match. */
  refresh(): Promise<readonly PanelFrontendPluginMetadata[]>;
}

/**
 * Desktop mode's application registry.
 *
 * Core-owned even though Desktop mode itself is a plugin: an application belongs
 * to whichever plugin owns the page, so the registration has to be disposed with
 * that plugin rather than with Desktop. Without `plugins/desktop` nothing renders
 * the registry and `window` is absent.
 */
export interface FrontendDesktopService {
  /** Adds an application to the Desktop, removed when the calling plugin unloads. */
  app(desktopApp: PanelFrontendDesktopApp): () => void;
  readonly apps: readonly PanelFrontendDesktopApp[];
  /** The window shell a Desktop-mode component is mounted inside. */
  readonly window: Component | undefined;
  /** Supplies that shell. Called by `plugins/desktop`. */
  provideWindow(component: Component): () => void;
}

/**
 * The file manager. Provided by `plugins/filemanager`.
 *
 * It publishes more than a page: the upload queue the settings page and the
 * create-instance form drive, the file editor the mod manager and the backup
 * plugin open, the dialogs the panel mounts on demand, and the filename helpers
 * the code editor and archive preview use. Every consumer resolves it with
 * `usePluginService` and degrades when the plugin is absent.
 */
export interface FrontendFileManagerService {
  readonly api: Record<string, unknown>;
  readonly useFileManager: (...args: any[]) => any;
  readonly getFileConfigAddr: (...args: any[]) => any;
  readonly uploadService: any;
  readonly UploadFiles: any;
  readonly getFileIcon: (fileName: string, type?: number) => string;
  readonly getFileExtName: (fileName: string) => string;
  readonly filterFileName: (fileName: string) => string;
  readonly isCompressFile: (fileName: string) => boolean;
  readonly FileEditor: Component;
  readonly ImageViewer: Component;
  readonly DesktopFileManager: Component;
  readonly DesktopFileEditor: Component;
  readonly DesktopImageViewer: Component;
  useUploadFileDialog(): Promise<string>;
  useDownloadFileDialog(): Promise<any>;
  useImageViewerDialog(
    instanceId: string,
    daemonId: string,
    fileName: string,
    frontDir: string
  ): Promise<any>;
}

/** Accounts and sessions. Provided by `plugins/user`. */
export interface FrontendUserService {
  readonly api: UserPluginApi;
  readonly desktopLoginWindow: Component;
  readonly desktopUsers: Component;
  readonly desktopUserInfo: Component;
  readonly desktopStartMenuAvatar: Component;
  readonly oobeCreateAdminAccount: Component;
}

/** The app market. Provided by `plugins/market`. */
export interface FrontendMarketService {
  readonly api: Record<string, unknown>;
  openMarketDialog(
    daemonId?: string,
    instanceId?: string,
    options?: { autoInstall?: boolean; onlyDockerTemplate?: boolean }
  ): Promise<unknown>;
  useMarketPackages(options?: Record<string, unknown>): unknown;
}

/** Node management. Provided by `plugins/node`. */
export interface FrontendNodeService {
  readonly api: NodePluginApi;
  useRemoteNode(): RemoteNodeHook;
}

declare module "cordis" {
  interface Context {
    // Core services, always present.
    vue: FrontendVueService;
    i18n: FrontendI18nService;
    routes: FrontendRoutesService;
    ui: FrontendUiService;
    menus: FrontendMenusService;
    actions: FrontendActionsService;
    plugins: FrontendPluginsService;
    desktop: FrontendDesktopService;

    // Provided by plugins. Read them with `usePluginService()` for graceful
    // degradation, or `inject` them from a plugin that cannot work without one.
    user: FrontendUserService;
    market: FrontendMarketService;
    node: FrontendNodeService;
    filemanager: FrontendFileManagerService;
  }
}

/** The context a frontend plugin's `apply()` receives. */
export type PanelFrontendPluginContext = Context;
