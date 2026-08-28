import fs from "fs-extra";
import i18next from "i18next";
import Koa from "koa";
import Router from "@koa/router";
import { GlobalVariable } from "mcsmanager-common";
import path from "path";
import { pathToFileURL } from "url";
import Storage from "./common/storage/sys_storage";
import { systemConfig } from "./setting";
import { ROLE } from "./entity/user";
import { $t } from "./i18n";
import permission from "./middleware/permission";
import validator from "./middleware/validator";
import {
  clearPanelAuthProvider,
  getPanelAuthProvider,
  setPanelAuthProvider,
  type AuthUserStore,
  type PanelAuthProvider
} from "./service/auth_provider";
import { getInstancesByUuid } from "./service/instance_service";
import { logger } from "./service/log";
import { operationLogger } from "./service/operation_logger";
import {
  BAN_IP_COUNT,
  ILLEGAL_ACCESS_KEY,
  LOGIN_COUNT,
  LOGIN_FAILED_COUNT_KEY,
  LOGIN_FAILED_KEY
} from "./service/passport_service";
import RemoteRequest from "./service/remote_command";
import SystemRemoteService from "./service/remote_service";
import * as ssoService from "./service/sso_service";

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
  /** Persistent entity storage, shared with the panel core. */
  storage: typeof Storage;
  services: {
    remote: typeof SystemRemoteService;
    /** User records, once the "user" plugin has registered its auth provider. */
    users: AuthUserStore | undefined;
    /** Sends a Socket.io request to a single daemon and awaits its response. */
    remoteRequest: typeof RemoteRequest;
    operationLogger: typeof operationLogger;
    instances: { getInstancesByUuid: typeof getInstancesByUuid };
    /** OIDC/OAuth2 plumbing driven by the panel's SSO settings. */
    sso: typeof ssoService;
  };
  middleware: {
    permission: typeof permission;
    validator: typeof validator;
  };
  /**
   * Process-wide counters shared with the core. `routers/overview_router.ts`
   * reports the auth keys that the "user" plugin increments.
   */
  common: {
    GlobalVariable: typeof GlobalVariable;
    authStatsKeys: {
      BAN_IP_COUNT: string;
      ILLEGAL_ACCESS_KEY: string;
      LOGIN_COUNT: string;
      LOGIN_FAILED_COUNT_KEY: string;
      LOGIN_FAILED_KEY: string;
    };
  };
  i18n: { $t: typeof $t; i18next: typeof i18next };
  roles: typeof ROLE;
  registerRouter: (router: Router) => void;
  registerRoute: (path: string, method: string, handler: Koa.Middleware) => void;
  registerMiddleware: (middleware: Koa.Middleware) => void;
  /**
   * Take over authentication for the whole panel. Without a registered provider
   * the panel runs unauthenticated. Cleared automatically when the plugin is
   * disposed.
   */
  registerAuthProvider: (provider: PanelAuthProvider) => void;
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
let authProviderOwner: string | undefined;

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
  authProviderOwner = undefined;
  clearPanelAuthProvider();
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
        storage: Storage,
        services: {
          remote: SystemRemoteService,
          get users() {
            return getPanelAuthProvider()?.users;
          },
          remoteRequest: RemoteRequest,
          operationLogger,
          instances: { getInstancesByUuid },
          sso: ssoService
        },
        middleware: {
          permission,
          validator
        },
        common: {
          GlobalVariable,
          authStatsKeys: {
            BAN_IP_COUNT,
            ILLEGAL_ACCESS_KEY,
            LOGIN_COUNT,
            LOGIN_FAILED_COUNT_KEY,
            LOGIN_FAILED_KEY
          }
        },
        i18n: { $t, i18next },
        roles: ROLE,
        registerAuthProvider: (authProvider) => {
          setPanelAuthProvider(authProvider);
          authProviderOwner = plugin.metadata.id;
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
      if (authProviderOwner === plugin.metadata.id) {
        authProviderOwner = undefined;
        clearPanelAuthProvider();
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
    if (hook === "dispose" && authProviderOwner === plugin.metadata.id) {
      authProviderOwner = undefined;
      clearPanelAuthProvider();
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
