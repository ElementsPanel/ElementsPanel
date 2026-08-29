import fs from "fs-extra";
import i18next from "i18next";
import Koa from "koa";
import Router from "@koa/router";
import path from "path";
import { pathToFileURL } from "url";
import { LOCAL_PRESET_LANG_PATH, SEVEN_ZIP_PATH, ZIP_TIMEOUT_SECONDS } from "../const";
import { decompressWithProgress } from "../common/compress";
import { globalConfiguration } from "../entity/config";
import Instance from "../entity/instance/instance";
import InstanceConfig from "../entity/instance/Instance_config";
import InstanceCommand from "../entity/commands/base/command";
import { getCommonHeaders } from "../common/network";
import { $t } from "../i18n";
import { GitignoreMatcher } from "../common/gitignore_matcher";
import InstanceSubsystem from "./system_instance";
import { getFileManager } from "./file_router_service";
import { InstanceUpdateAction } from "./instance_update_action";
import * as protocol from "./protocol";
import { routerApp } from "./router";
import logger from "./log";
import { AsyncTask, TaskCenter } from "./async_task_service";
import type { IAsyncTask } from "./async_task_service";
import { check7zipStatus } from "./seven_zip_service";
import {
  clearDaemonPluginRegistrations,
  registerDaemonAsyncTask,
  registerDaemonFeature,
  registerDaemonPresetCommand,
  registerDaemonScheduleAction
} from "./plugin_registry";
import type {
  DaemonAsyncTaskRegistration,
  DaemonPresetCommandFactory,
  DaemonScheduleActionHandler
} from "./plugin_registry";
import type { IPresetCommand } from "../entity/commands/dispatcher";

export interface DaemonPluginMetadata {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  main?: string;
  daemon?: string;
  backend?: string;
  entry?: string;
  [key: string]: unknown;
}

export interface DaemonPluginContext {
  app: Koa;
  router: Router;
  routerApp: typeof routerApp;
  protocol: typeof protocol;
  config: typeof globalConfiguration.config;
  instances: typeof InstanceSubsystem;
  Instance: typeof Instance;
  asyncTask: {
    AsyncTask: typeof AsyncTask;
    TaskCenter: typeof TaskCenter;
  };
  backup: {
    GitignoreMatcher: typeof GitignoreMatcher;
    decompressWithProgress: typeof decompressWithProgress;
    check7zipStatus: typeof import("./seven_zip_service").check7zipStatus;
    sevenZipPath: string;
    zipTimeoutSeconds: number;
  };
  /** What a market-package install needs from the core. */
  install: {
    InstanceConfig: typeof InstanceConfig;
    InstanceCommand: typeof InstanceCommand;
    InstanceUpdateAction: typeof InstanceUpdateAction;
    getFileManager: typeof getFileManager;
    getCommonHeaders: typeof getCommonHeaders;
  };
  translate: typeof $t;
  registerRouter: (router: Router) => void;
  registerRoute: (path: string, method: string, handler: Koa.Middleware) => void;
  registerProtocolHandler: (event: string, handler: (ctx: any, data: any) => void) => void;
  registerProtocolMiddleware: (
    handler: (event: string, ctx: any, data: any, next: Function) => void
  ) => void;
  registerMiddleware: (middleware: Koa.Middleware) => void;
  registerAsyncTask: (
    taskName: string,
    registration: DaemonAsyncTaskRegistration
  ) => void;
  registerScheduleAction: (actionType: string, handler: DaemonScheduleActionHandler) => void;
  registerFeature: (feature: string) => void;
  /**
   * Supply the command behind one instance preset. Applied by
   * `FunctionDispatcher` after the core's own defaults, so a plugin can provide
   * a preset the core has none for (`install`) or replace one it does.
   */
  registerPresetCommand: (
    preset: IPresetCommand,
    createCommand: DaemonPresetCommandFactory
  ) => void;
  /**
   * Merge the plugin's own translations into the daemon i18n instance, keyed by
   * locale (`en_us`, `zh_cn`, ...). A plugin that owns strings ships them in
   * `src/i18n` instead of the shared `languages` catalogue, so installing or
   * removing the plugin takes them with it.
   */
  registerLocaleMessages: (messages: Record<string, Record<string, unknown>>) => void;
  /** Persist the daemon configuration after mutating `config`. */
  saveConfig: () => void;
  /** Switch the daemon language and drop the bootstrap language preset file. */
  setLanguage: (language: string) => void;
  metadata: DaemonPluginMetadata;
  directory: string;
  logger: typeof logger;
}

export interface LoadedDaemonPlugin {
  metadata: DaemonPluginMetadata;
  directory: string;
  entry: string;
  module: unknown;
  context?: DaemonPluginContext;
  error?: Error;
}

const metadataFiles = ["plugin.json", "manifest.json", "package.json"];
const entryCandidates = [
  "src/index.js",
  "src/index.cjs",
  "src/index.mjs",
  "src/daemon.js",
  "src/daemon.cjs",
  "src/daemon.mjs"
];

let loadedPlugins: LoadedDaemonPlugin[] = [];
let pluginsDisposed = false;

function readMetadata(directory: string): DaemonPluginMetadata | null {
  for (const file of metadataFiles) {
    const filePath = path.join(directory, file);
    if (!fs.existsSync(filePath)) continue;
    try {
      const value = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown> | null;
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const id =
        typeof value.id === "string"
          ? value.id
          : typeof value.name === "string"
          ? value.name
          : path.basename(directory);
      if (!id.trim()) return null;
      return { ...value, id: id.trim() } as DaemonPluginMetadata;
    } catch (error) {
      logger.warn(`Failed to read daemon plugin metadata: ${filePath}`, error);
      return null;
    }
  }
  return null;
}

function resolveEntry(directory: string, metadata: DaemonPluginMetadata): string | null {
  const configured = [metadata.daemon, metadata.backend, metadata.main, metadata.entry].find(
    (entry): entry is string => typeof entry === "string" && entry.length > 0
  );
  const candidates = configured ? [configured] : entryCandidates;
  for (const candidate of candidates) {
    const entry = path.resolve(directory, candidate);
    if (entry.startsWith(`${path.resolve(directory)}${path.sep}`) && fs.existsSync(entry))
      return entry;
  }
  return null;
}

async function loadModule(entry: string): Promise<unknown> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    return runtimeRequire(entry);
  } catch (error: any) {
    if (error?.code !== "ERR_REQUIRE_ESM") throw error;
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string
    ) => Promise<unknown>;
    return dynamicImport(pathToFileURL(entry).href);
  }
}

function getSetup(module: any): ((context: DaemonPluginContext) => unknown) | undefined {
  const candidate =
    module?.setup ??
    module?.install ??
    module?.default?.setup ??
    module?.default?.install ??
    module?.default ??
    module;
  return typeof candidate === "function" ? candidate : undefined;
}

export async function loadDaemonPlugins(app: Koa): Promise<LoadedDaemonPlugin[]> {
  const directory = path.resolve(process.cwd(), "plugins");
  loadedPlugins = [];
  pluginsDisposed = false;
  clearDaemonPluginRegistrations();
  if (!fs.existsSync(directory)) return loadedPlugins;

  const plugins: Array<{ metadata: DaemonPluginMetadata; directory: string; entry: string }> = [];
  const pluginIds = new Set<string>();
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const pluginDirectory = path.join(directory, item.name);
    const metadata = readMetadata(pluginDirectory);
    if (!metadata || metadata.enabled === false) continue;
    if (pluginIds.has(metadata.id)) {
      logger.warn(`Ignoring duplicate daemon plugin id: ${metadata.id}`);
      continue;
    }
    pluginIds.add(metadata.id);
    const entry = resolveEntry(pluginDirectory, metadata);
    if (!entry) {
      logger.warn(`Daemon plugin "${metadata.id}" has no entry module.`);
      continue;
    }
    plugins.push({ metadata, directory: pluginDirectory, entry });
  }

  plugins.sort(
    (a, b) =>
      (Number(a.metadata.priority) || 0) - (Number(b.metadata.priority) || 0) ||
      a.metadata.id.localeCompare(b.metadata.id)
  );
  const router = new Router();
  for (const plugin of plugins) {
    const loaded: LoadedDaemonPlugin = { ...plugin, module: undefined };
    try {
      loaded.module = await loadModule(plugin.entry);
      const context: DaemonPluginContext = {
        app,
        router,
        routerApp,
        protocol,
        config: globalConfiguration.config,
        instances: InstanceSubsystem,
        Instance,
        asyncTask: { AsyncTask, TaskCenter },
        backup: {
          GitignoreMatcher,
          decompressWithProgress,
          check7zipStatus,
          sevenZipPath: SEVEN_ZIP_PATH,
          zipTimeoutSeconds: ZIP_TIMEOUT_SECONDS
        },
        install: {
          InstanceConfig,
          InstanceCommand,
          InstanceUpdateAction,
          getFileManager,
          getCommonHeaders
        },
        translate: $t,
        registerRouter: (pluginRouter) => {
          app.use(pluginRouter.routes()).use(pluginRouter.allowedMethods());
        },
        registerRoute: (routePath, method, handler) => {
          const register = (router as any)[method.toLowerCase()];
          if (typeof register !== "function")
            throw new Error(`Unsupported daemon plugin route method: ${method}`);
          register.call(router, routePath, handler);
        },
        registerProtocolHandler: (event, handler) => routerApp.on(event, handler),
        registerProtocolMiddleware: (handler) => routerApp.use(handler),
        registerMiddleware: (middleware) => app.use(middleware),
        registerAsyncTask: (taskName, registration) => {
          registerDaemonAsyncTask(taskName, registration);
        },
        registerScheduleAction: (actionType, handler) => {
          registerDaemonScheduleAction(actionType, handler);
        },
        registerFeature: (feature) => {
          registerDaemonFeature(feature);
        },
        registerPresetCommand: (preset, createCommand) => {
          registerDaemonPresetCommand(preset, createCommand);
        },
        registerLocaleMessages: (messages) => {
          for (const [locale, resources] of Object.entries(messages ?? {})) {
            i18next.addResourceBundle(locale, "translation", resources, true, true);
          }
        },
        saveConfig: () => globalConfiguration.store(),
        setLanguage: (language) => {
          if (!language) return;
          logger.warn($t("TXT_CODE_66e32091"), language);
          i18next.changeLanguage(language);
          fs.remove(LOCAL_PRESET_LANG_PATH, () => {});
          globalConfiguration.config.language = language;
        },
        metadata: plugin.metadata,
        directory: plugin.directory,
        logger
      };
      loaded.context = context;
      const setup = getSetup(loaded.module);
      if (setup) await setup(context);
      loadedPlugins.push(loaded);
      logger.info(`Daemon plugin loaded: ${plugin.metadata.id}`);
    } catch (error: any) {
      loaded.error = error instanceof Error ? error : new Error(String(error));
      loadedPlugins.push(loaded);
      logger.error(`Daemon plugin failed to load: ${plugin.metadata.id}`, error);
    }
  }
  app.use(router.routes()).use(router.allowedMethods());
  return loadedPlugins;
}

export function getLoadedDaemonPlugins(): readonly LoadedDaemonPlugin[] {
  return loadedPlugins;
}

export async function runDaemonPluginHook(hook: "ready" | "dispose"): Promise<void> {
  if (hook === "dispose") {
    if (pluginsDisposed) return;
    pluginsDisposed = true;
  }
  const plugins = hook === "dispose" ? [...loadedPlugins].reverse() : loadedPlugins;
  for (const plugin of plugins) {
    if (plugin.error) continue;
    const module: any = plugin.module;
    const callback = module?.[hook] ?? module?.default?.[hook];
    if (typeof callback !== "function") continue;
    try {
      await callback(plugin.context);
    } catch (error) {
      logger.error(`Daemon plugin hook failed: ${plugin.metadata.id}.${hook}`, error);
    }
  }
}
