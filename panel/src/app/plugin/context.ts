import { Context } from "cordis";
import type Koa from "koa";
import type Router from "@koa/router";
import type i18next from "i18next";
import type { GlobalVariable } from "mcsmanager-common";
import type Storage from "../common/storage/sys_storage";
import type { ROLE } from "../entity/user";
import type { $t } from "../i18n";
import type { speedLimit } from "../middleware/limit";
import type permission from "../middleware/permission";
import type instanceAccess from "../middleware/instance_access";
import type validator from "../middleware/validator";
import type { getInstancesByUuid } from "../service/instance_service";
import type { operationLogger } from "../service/operation_logger";
import type RemoteRequest from "../service/remote_command";
import type SystemRemoteService from "../service/remote_service";
import type { AuthStats, RequestGuard, RequestIdentity, UserRecords } from "../service/request_guard";
import type { systemConfig } from "../setting";
import type { LoadedPanelPlugin, PanelFrontendPluginEntry } from "./loader";

/**
 * The panel's cordis container, and the complete list of what a plugin can see.
 *
 * Every capability is a service on the context; every registration a plugin
 * makes is an effect owned by that plugin's scope, so unloading a plugin undoes
 * its contributions and no plugin ever writes cleanup code. `ctx.logger` and the
 * timer helpers (`ctx.setTimeout`, `ctx.setInterval`, `ctx.sleep`,
 * `ctx.throttle`, `ctx.debounce`) come with cordis itself.
 *
 * The declarations below are the API documentation: only `import type` here, so
 * this module stays a leaf that core code can import without a cycle. The
 * runtime values are wired in `./install.ts`.
 */
export const ctx = new Context();

/** Panel settings, plus the call that persists them. */
export interface PanelSettingsService {
  readonly config: NonNullable<typeof systemConfig>;
  save(): void;
}

/** Translation, and the way a plugin contributes its own strings. */
export interface PanelI18nService {
  readonly $t: typeof $t;
  readonly i18next: typeof i18next;
  /**
   * Merge the plugin's translations, keyed by locale (`en_us`, `zh_cn`, ...).
   * Removed again when the plugin unloads, so its strings arrive and leave with
   * it instead of living in the shared `languages` catalogue.
   */
  define(messages: Record<string, Record<string, unknown>>): () => void;
}

/**
 * The panel's Koa application. `use()` and `router()` are scoped to the calling
 * plugin: both are removed when it unloads, which is why the core mounts one
 * composed stack for each of them at startup rather than calling `app.use()` per
 * registration.
 */
export interface PanelKoaService {
  readonly app: Koa;
  /** Adds a middleware, ahead of the core routers. */
  use(middleware: Koa.Middleware): () => void;
  /** Creates a router owned by the calling plugin and mounts it. */
  router(prefix?: string): Router;
}

/** The shared request middleware. Policy comes from the installed guard. */
export interface PanelMiddlewareService {
  readonly permission: typeof permission;
  readonly validator: typeof validator;
  readonly instanceAccess: typeof instanceAccess;
  /** Per-caller rate limit; elevated callers pass through. */
  readonly speedLimit: typeof speedLimit;
}

/** The daemon nodes: the subsystem that tracks them and the request helper. */
export interface PanelRemoteService {
  readonly services: typeof SystemRemoteService;
  readonly Request: typeof RemoteRequest;
}

/**
 * Who is calling, as reported by whichever guard is installed. Always present:
 * an unguarded panel reports one anonymous, elevated caller, so no consumer has
 * to branch on whether authentication exists.
 */
export interface PanelIdentityService {
  of(requestCtx: Koa.ParameterizedContext): RequestIdentity;
  /** Account records, present only while a guard plugin provides them. */
  readonly users: UserRecords | undefined;
  readonly stats: AuthStats;
}

/** Fields a plugin adds to `GET /api/overview`. */
export type PanelOverviewProvider = () =>
  | Record<string, unknown>
  | Promise<Record<string, unknown>>;

export interface PanelOverviewService {
  /**
   * Contribute extra fields to `GET /api/overview`. The core reports only what
   * the whole panel reads that route for; anything collected purely to be
   * displayed lives in a plugin and disappears with it.
   */
  provide(provider: PanelOverviewProvider): () => void;
  collect(): Promise<Record<string, unknown>>;
}

/** What is loaded, for the panel's own reporting and for the frontend manifest. */
export interface PanelPluginsService {
  readonly loaded: readonly LoadedPanelPlugin[];
  /** The manifest the browser fetches to discover frontend entries. */
  frontendManifest(): PanelFrontendPluginEntry[];
}

/** First-run completion, reported as `isInstall` by `/api/auth/status`. */
export interface PanelInstallationService {
  isInstalled(): boolean;
}

declare module "cordis" {
  interface Context {
    // Core services, always present.
    settings: PanelSettingsService;
    storage: typeof Storage;
    i18n: PanelI18nService;
    koa: PanelKoaService;
    middleware: PanelMiddlewareService;
    roles: typeof ROLE;
    remote: PanelRemoteService;
    identity: PanelIdentityService;
    operations: typeof operationLogger;
    instances: { getByUuid: typeof getInstancesByUuid };
    globals: typeof GlobalVariable;
    overview: PanelOverviewService;
    plugins: PanelPluginsService;

    // Provided by plugins. Read them through the core accessor that falls back
    // to a default, or `inject` them from a plugin that cannot work without one.
    /** Request authorization for the whole panel. Provided by `plugins/user`. */
    guard: RequestGuard;
    /** First-run state. Provided by `plugins/oobe`. */
    installation: PanelInstallationService;
  }
}

/** The context a panel plugin's `apply()` receives. */
export type PanelPluginContext = Context;
