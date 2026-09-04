import type Router from "@koa/router";
import { Context } from "cordis";
import type i18next from "i18next";
import type Koa from "koa";
import type { GlobalVariable } from "mcsmanager-common";
import type Storage from "../common/storage/sys_storage";
import type { IRemoteService, RemoteMappingEntry } from "../entity/entity_interface";
import type { ROLE } from "../entity/user";
import type { $t } from "../i18n";
import type instanceAccess from "../middleware/instance_access";
import type { speedLimit } from "../middleware/limit";
import type { requestConcurrencyLimiter } from "../middleware/limit";
import type permission from "../middleware/permission";
import type validator from "../middleware/validator";
import type { OperationLoggerItem, OperationLoggerItemPayload } from "../../types/operation_logger";
import type {
  AuthStats,
  RequestGuard,
  RequestIdentity,
  UserAccessPolicy,
  UserRecords
} from "../service/request_guard";
import type { systemConfig } from "../setting";
import type {
  LoadedPanelPlugin,
  PanelFrontendPluginEntry,
  PanelPluginRecord
} from "./loader";

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
 * runtime values are provided by the `plugins/runtime` foundation.
 */
export const ctx = new Context();

/** What a declared setting renders as. `link` reads and writes nothing. */
export type PanelSettingFieldType =
  | "string"
  /** Multi-line string. */
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "link";

export interface PanelSettingOption {
  value: string | number | boolean;
  label: string;
}

/**
 * One row of a plugin's configuration form, described rather than drawn.
 *
 * Labels are plain strings, already translated: the daemon's plugins are
 * rendered by this same form, and the browser has no copy of a daemon plugin's
 * catalogue. Whoever declares the field resolves it.
 */
export interface PanelSettingField {
  /** The key in `read()`'s result and `write()`'s argument. Absent for `link`. */
  key?: string;
  type: PanelSettingFieldType;
  title: string;
  description?: string;
  placeholder?: string;
  /** `number`: inclusive bounds, enforced by the form and by `write()`. */
  min?: number;
  max?: number;
  /** `select`: the allowed values. */
  options?: PanelSettingOption[];
  /** `string`: render as a password input. */
  secret?: boolean;
  /** `string`: offer the installed file manager's upload dialog. */
  fileUpload?: boolean;
  /**
   * Shown only while every listed condition holds. A condition is either a field
   * name, true when that field is truthy, or `"name=value"`, true when that
   * field's value stringifies to `value`.
   */
  visibleWhen?: string | string[];
  /** `link`: a frontend route the form offers as a button. */
  route?: string;
}

/**
 * A plugin's configuration, as its backend declares it.
 *
 * `fields` is a function so that it is resolved per request: a plugin's titles
 * come from its own catalogue, and the panel's language can change while it runs.
 */
export interface PanelSettingsDeclaration {
  fields(): PanelSettingField[];
  read(): Record<string, unknown> | Promise<Record<string, unknown>>;
  write(values: Record<string, unknown>): void | Promise<void>;
}

/** One plugin's form and its current values, as the page fetches them. */
export interface PanelSettingsSchema {
  id: string;
  fields: PanelSettingField[];
  values: Record<string, unknown>;
}

/** Panel settings, plus the call that persists them. */
export interface PanelSettingsService {
  readonly config: NonNullable<typeof systemConfig>;
  save(): void;
}

/** Shared frontend layout persistence used by the console and feature plugins. */
export interface PanelLayoutService {
  get(): string;
  set(config: IPageLayoutConfig[]): void;
  reset(): void;
}

/**
 * The register of plugin configuration forms.
 *
 * A plugin describes its settings here instead of shipping a component for them,
 * which is what lets one generic form render a panel plugin's configuration and a
 * daemon plugin's alike — the browser has no copy of a daemon plugin at all.
 */
export interface PanelSettingsFormService {
  /** Declares the calling plugin's form. An effect: it leaves with the plugin. */
  declare(declaration: PanelSettingsDeclaration): () => void;
  /** The ids that declared a form, in declaration order. */
  declared(): string[];
  /** One plugin's fields and values, or `null` when it declared nothing. */
  read(id: string): Promise<PanelSettingsSchema | null>;
  /** Hands `values` to that plugin's own `write()`. */
  write(id: string, values: Record<string, unknown>): Promise<void>;
}

/** Translation, and the way a plugin contributes its own strings. */
export interface PanelI18nService {
  readonly $t: typeof $t;
  readonly i18next: typeof i18next;
  /**
   * Merge the plugin's translations, keyed by locale (`en_us`, `zh_cn`, ...).
   * Removed again when the plugin unloads, so its strings arrive and leave with
   * it instead of living in the foundational `plugins/i18n` catalogue.
   */
  define(messages: Record<string, Record<string, unknown>>): () => void;
}

/**
 * The panel's Koa application. `use()` and `router()` are scoped to the calling
 * plugin: both are removed when it unloads, which is why the web server mounts
 * one composed stack for each of them when it starts rather than calling
 * `app.use()` per registration.
 *
 * Provided by `plugins/server`, which owns the application itself.
 */
export interface PanelKoaService {
  readonly app: Koa;
  /** Adds a middleware, ahead of feature-plugin routers. */
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
  readonly requestConcurrencyLimiter: typeof requestConcurrencyLimiter;
}

/** The stored configuration of one daemon node, as the panel reads it. */
export interface PanelRemoteNodeConfig {
  ip: string;
  port: number;
  prefix: string;
  remarks: string;
  apiKey: string;
  brand: string;
  remoteMappings: RemoteMappingEntry[];
  /** `ip:port`. */
  readonly addr: string;
  /** The prefix, trimmed and without a trailing slash. */
  readonly canonicalPrefix: string;
  /** `addr` plus `canonicalPrefix` — what a client is told to connect to. */
  readonly fullAddr: string;
  /** The mappings in the `{ addr, prefix }` shape responses use. */
  getConvertedRemoteMappings(): Array<{
    from: { addr: string; prefix: string };
    to: { addr: string; prefix: string };
  }>;
}

/** One daemon node: its identity, its connection state and its socket. */
export interface PanelRemoteNode {
  readonly uuid: string;
  /** Whether the daemon is connected *and* authenticated. */
  readonly available: boolean;
  readonly config: PanelRemoteNodeConfig;
  connect(): void;
  disconnect(): void;
  refreshReconnect(): void;
  setLanguage(language?: string): Promise<unknown>;
}

/** The set of daemon nodes this panel knows about. */
export interface PanelRemoteSubsystem {
  readonly services: ReadonlyMap<string, PanelRemoteNode>;
  getInstance(uuid: string): PanelRemoteNode | undefined;
  count(): { available: number; total: number };
  changeDaemonLanguage(language: string): void;
  registerRemoteService(config: IRemoteService): Promise<PanelRemoteNode>;
  deleteRemoteService(uuid: string): Promise<void>;
  edit(uuid: string, config: IRemoteService): Promise<void>;
  newInstance(config: IRemoteService): Promise<PanelRemoteNode>;
  initConnectLocalhost(key?: string): Promise<PanelRemoteNode | undefined>;
}

/** One request/response round trip to a daemon over its socket. */
export interface PanelRemoteRequest {
  request<T = any>(event: string, data?: any, timeout?: number, force?: boolean): Promise<T>;
}

/**
 * The daemon nodes: the subsystem that tracks them and the request helper.
 *
 * **Provided by `plugins/node`.** The core declares only the shape it needs and
 * resolves it at use time through `service/remote_access.ts`, so removing that
 * plugin removes the panel's ability to reach a daemon rather than breaking the
 * build.
 */
export interface PanelRemoteService {
  readonly services: PanelRemoteSubsystem;
  readonly Request: new (service?: PanelRemoteNode) => PanelRemoteRequest;
  /** The error a timed-out request throws, so a caller can recognise it. */
  readonly RequestTimeoutError: new (msg: string) => Error;
}

/**
 * Identity and user capabilities reported by whichever guard is installed.
 * Always present: an unguarded panel reports one anonymous, elevated caller,
 * so no consumer has to branch on whether authentication exists.
 */
export interface PanelIdentityService {
  of(requestCtx: Koa.ParameterizedContext): RequestIdentity;
  canAccessInstance(
    requestCtx: Koa.ParameterizedContext,
    daemonId: string,
    instanceUuid: string
  ): boolean;
  readonly accessPolicy: UserAccessPolicy;
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
   * Contribute extra fields to an overview payload. The owning feature plugin
   * decides which base fields it serves; anything collected purely for display
   * lives in a plugin and disappears with it.
   */
  provide(provider: PanelOverviewProvider): () => void;
  collect(): Promise<Record<string, unknown>>;
}

/** Operation records are owned by the monitor plugin and shared by feature plugins. */
export interface PanelOperationLogger {
  log<T extends keyof OperationLoggerItemPayload>(
    type: T,
    payload: Omit<OperationLoggerItemPayload[T], "operation_id" | "operation_time" | "operation_level">,
    level?: "info" | "warning" | "error"
  ): string;
  info<T extends keyof OperationLoggerItemPayload>(
    type: T,
    payload: Omit<OperationLoggerItemPayload[T], "operation_id" | "operation_time" | "operation_level">
  ): string;
  warning<T extends keyof OperationLoggerItemPayload>(
    type: T,
    payload: Omit<OperationLoggerItemPayload[T], "operation_id" | "operation_time" | "operation_level">
  ): string;
  error<T extends keyof OperationLoggerItemPayload>(
    type: T,
    payload: Omit<OperationLoggerItemPayload[T], "operation_id" | "operation_time" | "operation_level">
  ): string;
  get(limit?: number): Promise<OperationLoggerItem[]>;
  getByInstance(instanceId: string, daemonId: string, limit?: number): Promise<OperationLoggerItem[]>;
}

/** What is installed and what is loaded, plus the switch that decides. */
export interface PanelPluginsService {
  readonly loaded: readonly LoadedPanelPlugin[];
  /** The manifest the browser fetches to discover frontend entries. */
  frontendManifest(): PanelFrontendPluginEntry[];
  /** Every installed plugin, disabled ones included. */
  inventory(): PanelPluginRecord[];
  /**
   * Turns a plugin on or off: persists the switch in its `plugin.json` and
   * applies it to the running panel. Disabling disposes the backend scope, so
   * its routes, middleware, timers and services go with it.
   */
  setEnabled(id: string, enabled: boolean): Promise<PanelPluginRecord>;
}

declare module "cordis" {
  interface Context {
    // Shared services supplied by the runtime foundation before feature plugins load.
    settings: PanelSettingsService;
    storage: typeof Storage;
    i18n: PanelI18nService;
    middleware: PanelMiddlewareService;
    roles: typeof ROLE;
    identity: PanelIdentityService;
    // Feature services are provided by their owning plugins.
    layout: PanelLayoutService;
    settingsForm: PanelSettingsFormService;
    operations: PanelOperationLogger;
    /** User-instance lookup provided by the panel `instance` plugin. */
    instances: {
      getByUuid(uuid: string, targetDaemonId?: string, advanced?: boolean): Promise<any>;
    };
    globals: typeof GlobalVariable;
    overview: PanelOverviewService;
    plugins: PanelPluginsService;

    // Provided by plugins. Read them through the core accessor that falls back
    // to a default, or `inject` them from a plugin that cannot work without one.
    /**
     * The Koa application every route in the panel is mounted on. Provided by
     * `plugins/server`, the web server — without it the panel listens on
     * nothing, so almost every plugin injects it.
     */
    koa: PanelKoaService;
    /**
     * The daemon nodes. Provided by `plugins/node`, which owns the subsystem —
     * the panel reaches no daemon without it.
     */
    remote: PanelRemoteService;
    /** Request authorization for the whole panel. Provided by `plugins/user`. */
    guard: RequestGuard;
  }
}

/** The context a panel plugin's `apply()` receives. */
export type PanelPluginContext = Context;
