import fs from "fs-extra";
import Koa from "koa";
import Router from "@koa/router";
import path from "path";
import { pathToFileURL } from "url";
import { globalConfiguration } from "../entity/config";
import InstanceSubsystem from "./system_instance";
import * as protocol from "./protocol";
import { routerApp } from "./router";
import logger from "./log";

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
  registerRouter: (router: Router) => void;
  registerRoute: (path: string, method: string, handler: Koa.Middleware) => void;
  registerProtocolHandler: (event: string, handler: (ctx: any, data: any) => void) => void;
  registerProtocolMiddleware: (
    handler: (event: string, ctx: any, data: any, next: Function) => void
  ) => void;
  registerMiddleware: (middleware: Koa.Middleware) => void;
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
