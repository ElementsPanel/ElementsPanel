import fs from "fs-extra";
import i18next from "i18next";
import Koa from "koa";
import Router from "@koa/router";
import { GlobalVariable } from "mcsmanager-common";
import path from "path";
import { pathToFileURL } from "url";
import Storage from "./common/storage/sys_storage";
import { saveSystemConfig, systemConfig } from "./setting";
import { ROLE } from "./entity/user";
import { $t } from "./i18n";
import { speedLimit } from "./middleware/limit";
import permission from "./middleware/permission";
import instanceAccess from "./middleware/instance_access";
import validator from "./middleware/validator";
import { getInstancesByUuid } from "./service/instance_service";
import { logger } from "./service/log";
import { operationLogger } from "./service/operation_logger";
import RemoteRequest from "./service/remote_command";
import SystemRemoteService from "./service/remote_service";
import {
  clearRequestGuard,
  getRequestGuard,
  setRequestGuard,
  type RequestGuard,
  type RequestIdentity,
  type UserRecords
} from "./service/request_guard";
import {
  clearInstallationState,
  setInstallationState,
  type InstallationState
} from "./service/installation_state";

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
  saveConfig: () => void;
  /** Persistent entity storage, shared with the panel core. */
  storage: typeof Storage;
  services: {
    remote: typeof SystemRemoteService;
    /** User records, once a guard plugin has registered them. */
    users: UserRecords | undefined;
    /**
     * Who is calling the current request, as reported by the installed guard.
     * Anonymous callers read back as an elevated administrator, because that is
     * what an unguarded panel means.
     */
    identify: (ctx: Koa.ParameterizedContext) => RequestIdentity;
    /** Sends a Socket.io request to a single daemon and awaits its response. */
    remoteRequest: typeof RemoteRequest;
    operationLogger: typeof operationLogger;
    instances: { getInstancesByUuid: typeof getInstancesByUuid };
  };
  middleware: {
    instanceAccess: typeof instanceAccess;
    permission: typeof permission;
    validator: typeof validator;
    /** Per-caller rate limit; elevated callers pass through. */
    speedLimit: typeof speedLimit;
  };
  /** Process-wide counters, shared with the core. */
  common: {
    GlobalVariable: typeof GlobalVariable;
  };
  i18n: { $t: typeof $t; i18next: typeof i18next };
  roles: typeof ROLE;
  registerRouter: (router: Router) => void;
  registerRoute: (path: string, method: string, handler: Koa.Middleware) => void;
  registerMiddleware: (middleware: Koa.Middleware) => void;
  /**
   * Merge the plugin's own translations into the panel i18n instance, keyed by
   * locale (`en_us`, `zh_cn`, ...). A plugin that owns strings ships them in
   * `src/i18n` instead of the shared `languages` catalogue, so installing or
   * removing the plugin takes them with it. Backend code only reloads with the
   * panel process, so the messages stay registered for its lifetime.
   */
  registerLocaleMessages: (messages: Record<string, Record<string, unknown>>) => void;
  /**
   * Take over request authorization for the whole panel: route guarding, caller
   * identity, instance ownership and upload permission. The panel core holds no
   * policy of its own, so until a plugin registers a guard every request is
   * served. Cleared automatically when the owning plugin is disposed.
   */
  registerRequestGuard: (guard: RequestGuard) => void;
  /** Supply the first-run completion state. Defaults to installed when absent. */
  registerInstallationState: (state: InstallationState) => void;
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
let guardOwner: string | undefined;
let installationStateOwner: string | undefined;

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
  guardOwner = undefined;
  installationStateOwner = undefined;
  clearRequestGuard();
  clearInstallationState();
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
        saveConfig: () => saveSystemConfig(systemConfig!),
        storage: Storage,
        services: {
          remote: SystemRemoteService,
          get users() {
            return getRequestGuard().users;
          },
          identify: (requestCtx) => getRequestGuard().identify(requestCtx),
          remoteRequest: RemoteRequest,
          operationLogger,
          instances: { getInstancesByUuid }
        },
        middleware: {
          instanceAccess,
          permission,
          validator,
          speedLimit
        },
        common: {
          GlobalVariable
        },
        i18n: { $t, i18next },
        roles: ROLE,
        registerRequestGuard: (requestGuard) => {
          setRequestGuard(requestGuard);
          guardOwner = plugin.metadata.id;
        },
        registerInstallationState: (installationState) => {
          setInstallationState(installationState);
          installationStateOwner = plugin.metadata.id;
        },
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
        registerLocaleMessages: (messages) => {
          for (const [locale, resources] of Object.entries(messages ?? {})) {
            i18next.addResourceBundle(locale, "translation", resources, true, true);
          }
        },
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
      // A plugin that failed halfway must not leave the panel enforcing an
      // auth provider it never finished wiring up.
      if (guardOwner === plugin.metadata.id) {
        guardOwner = undefined;
        clearRequestGuard();
      }
      if (installationStateOwner === plugin.metadata.id) {
        installationStateOwner = undefined;
        clearInstallationState();
      }
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
    if (hook === "dispose" && guardOwner === plugin.metadata.id) {
      guardOwner = undefined;
      clearRequestGuard();
    }
    if (hook === "dispose" && installationStateOwner === plugin.metadata.id) {
      installationStateOwner = undefined;
      clearInstallationState();
    }
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
