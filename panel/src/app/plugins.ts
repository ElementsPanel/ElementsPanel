import fs from "fs-extra";
import Koa from "koa";
import Router from "@koa/router";
import path from "path";
import { pathToFileURL } from "url";
import { systemConfig } from "./setting";
import { ROLE } from "./entity/user";
import permission from "./middleware/permission";
import { logger } from "./service/log";
import SystemRemoteService from "./service/remote_service";
import SystemUser from "./service/user_service";

export interface PanelPluginMetadata {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  /** Entry relative to the plugin directory. Defaults to src/index.js. */
  main?: string;
  /** Alias for main, useful when sharing metadata with a daemon plugin. */
  panel?: string;
  backend?: string;
  entry?: string;
  [key: string]: unknown;
}

export interface PanelPluginContext {
  app: Koa;
  router: Router;
  config: NonNullable<typeof systemConfig>;
  services: {
    remote: typeof SystemRemoteService;
    users: typeof SystemUser;
  };
  middleware: {
    permission: typeof permission;
  };
  roles: typeof ROLE;
  registerRouter: (router: Router) => void;
  registerRoute: (path: string, method: string, handler: Koa.Middleware) => void;
  registerMiddleware: (middleware: Koa.Middleware) => void;
  metadata: PanelPluginMetadata;
  directory: string;
  logger: typeof logger;
}

export interface LoadedPanelPlugin {
  metadata: PanelPluginMetadata;
  directory: string;
  entry: string;
  module: unknown;
  context?: PanelPluginContext;
  error?: Error;
}

interface DiscoveredPanelPlugin {
  metadata: PanelPluginMetadata;
  directory: string;
  entry?: string;
}

const metadataFiles = ["plugin.json", "manifest.json", "package.json"];
const entryCandidates = [
  "src/index.js",
  "src/index.cjs",
  "src/index.mjs",
  "src/panel.js",
  "src/panel.cjs",
  "src/panel.mjs"
];

let loadedPlugins: LoadedPanelPlugin[] = [];
let pluginsDisposed = false;

function readMetadata(directory: string): PanelPluginMetadata | null {
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
      return { ...value, id: id.trim() } as PanelPluginMetadata;
    } catch (error) {
      logger.warn(`Failed to read panel plugin metadata: ${filePath}`, error);
      return null;
    }
  }
  return null;
}

function resolveEntry(directory: string, metadata: PanelPluginMetadata): string | null {
  const configured = [metadata.panel, metadata.backend, metadata.main, metadata.entry].find(
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
    // eval keeps webpack from trying to bundle files supplied at runtime.
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

function getSetup(module: any): ((context: PanelPluginContext) => unknown) | undefined {
  const candidate =
    module?.setup ??
    module?.install ??
    module?.default?.setup ??
    module?.default?.install ??
    module?.default ??
    module;
  return typeof candidate === "function" ? candidate : undefined;
}

export async function loadPanelPlugins(app: Koa): Promise<LoadedPanelPlugin[]> {
  const directory = path.resolve(process.cwd(), "plugins");
  loadedPlugins = [];
  pluginsDisposed = false;
  if (!fs.existsSync(directory)) return loadedPlugins;

  const plugins: DiscoveredPanelPlugin[] = [];
  const pluginIds = new Set<string>();
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const pluginDirectory = path.join(directory, item.name);
    const metadata = readMetadata(pluginDirectory);
    if (!metadata || metadata.enabled === false) continue;
    if (pluginIds.has(metadata.id)) {
      logger.warn(`Ignoring duplicate panel plugin id: ${metadata.id}`);
      continue;
    }
    pluginIds.add(metadata.id);
    const entry = resolveEntry(pluginDirectory, metadata);
    if (!entry) {
      if (metadata.panel || metadata.backend || metadata.main || metadata.entry) {
        logger.warn(`Panel plugin "${metadata.id}" has no valid backend entry module.`);
        continue;
      }
    }
    plugins.push({ metadata, directory: pluginDirectory, entry: entry || undefined });
  }

  plugins.sort(
    (a, b) =>
      (Number(a.metadata.priority) || 0) - (Number(b.metadata.priority) || 0) ||
      a.metadata.id.localeCompare(b.metadata.id)
  );
  const router = new Router();
  for (const plugin of plugins) {
    if (!plugin.entry) {
      loadedPlugins.push({
        metadata: plugin.metadata,
        directory: plugin.directory,
        entry: "",
        module: undefined
      });
      continue;
    }
    const loaded: LoadedPanelPlugin = { ...plugin, entry: plugin.entry, module: undefined };
    try {
      loaded.module = await loadModule(plugin.entry);
      const context: PanelPluginContext = {
        app,
        router,
        config: systemConfig!,
        services: {
          remote: SystemRemoteService,
          users: SystemUser
        },
        middleware: {
          permission
        },
        roles: ROLE,
        registerRouter: (pluginRouter) => {
          app.use(pluginRouter.routes()).use(pluginRouter.allowedMethods());
        },
        registerRoute: (routePath, method, handler) => {
          const register = (router as any)[method.toLowerCase()];
          if (typeof register !== "function")
            throw new Error(`Unsupported panel plugin route method: ${method}`);
          register.call(router, routePath, handler);
        },
        registerMiddleware: (middleware) => app.use(middleware),
        metadata: plugin.metadata,
        directory: plugin.directory,
        logger
      };
      loaded.context = context;
      const setup = getSetup(loaded.module);
      if (setup) await setup(context);
      loadedPlugins.push(loaded);
      logger.info(`Panel plugin loaded: ${plugin.metadata.id}`);
    } catch (error: any) {
      loaded.error = error instanceof Error ? error : new Error(String(error));
      loadedPlugins.push(loaded);
      logger.error(`Panel plugin failed to load: ${plugin.metadata.id}`, error);
    }
  }
  app.use(router.routes()).use(router.allowedMethods());
  return loadedPlugins;
}

export function getLoadedPanelPlugins(): readonly LoadedPanelPlugin[] {
  return loadedPlugins;
}

export async function runPanelPluginHook(hook: "ready" | "dispose"): Promise<void> {
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
      logger.error(`Panel plugin hook failed: ${plugin.metadata.id}.${hook}`, error);
    }
  }
}
