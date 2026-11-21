import type {
  NpmRuntimeUpdateService,
  NpmUpdateBatchOptions,
  NpmUpdateBatchResult,
  PluginChangeResult,
  PluginSettingsPage
} from "mcsmanager-common";
import type Router from "@koa/router";
import { Context } from "cordis";
import type i18next from "i18next";
import type Koa from "koa";
import type { Server } from "socket.io";
import type { GlobalVariable } from "mcsmanager-common";
import type { IRemoteService, RemoteMappingEntry } from "./packets";
import type { ROLE } from "../../../../../plugins/runtime/panel/src/backend/roles";
import type validator from "../../../../../plugins/runtime/panel/src/backend/middleware/validator";
import type { OperationLoggerItem, OperationLoggerItemPayload } from "../../types/operation_logger";
import type {
  AuthStats,
  GuardedRoute,
  RequestGuard,
  RequestIdentity,
  UserAccessPolicy,
  UserRecords
} from "./guard";
import type { systemConfig } from "../../../../../plugins/runtime/panel/src/backend/setting";
import type { LoadedPanelPlugin, PanelFrontendPluginEntry, PanelPluginRecord } from "./loader";

/**
 * Plugin service contracts. Cordis owns registered effects, loggers and timers.
 * Use type-only contract imports to avoid cycles. Foundation plugins provide shared services.
 */
export const ctx = new Context();

/** What a declared setting renders as. `link` reads and writes nothing. */
export type PanelSettingFieldType =
  | "string"
  | "color"
  /** Multi-line string. */
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "list"
  | "link";

export interface PanelSettingOption {
  value: string | number | boolean;
  label: string;
}

/** Backend-declared settings fields with translated labels, shared by panel and daemon forms. */
export interface PanelSettingField {
  page?: PluginSettingsPage;
  /** The key in `read()`'s result and `write()`'s argument. Absent for `link`. */
  key?: string;
  type: PanelSettingFieldType;
  title: string;
  description?: string;
  placeholder?: string;
  unit?: string;
  /** `number`: inclusive bounds, enforced by the form and by `write()`. */
  min?: number;
  max?: number;
  /** `number`: optionally render as a slider. */
  control?: "slider";
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
  /** `list`: an editable array of objects, each rendered using these fields. */
  fields?: PanelSettingField[];
  maxItems?: number;
  itemTitleKey?: string;
  listEditor?: "inline" | "dialog";
  addLabel?: string;
  editLabel?: string;
  removeLabel?: string;
  required?: boolean;
}

/** Resolve fields per request so their translated labels follow the active language. */
export interface PanelSettingsDeclaration {
  page?(): PluginSettingsPage;
  /** Changes to this form require a process restart. */
  restartRequired?: boolean;
  fields(): PanelSettingField[];
  defaults?(): Record<string, unknown>;
  reset?(): void | Promise<void>;
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
  defaults(): NonNullable<typeof systemConfig>;
  save(): Promise<void>;
}

/** Entity and file persistence supplied by `plugins/storage`. */
export interface PanelStorageService {
  readonly TYPE: { readonly FILE: 0; readonly REDIS: 1 };
  getStorage(): {
    store(category: string, uuid: string, object: any): Promise<void>;
    load(category: string, classz: any, uuid: string): Promise<any>;
    list(category: string): Promise<string[]>;
    delete(category: string, uuid: string): Promise<void>;
  };
  setStorageType(type: number): void;
  initialize(url: string): Promise<void>;
  readDir(category: string): string[];
  readFile(name: string): string;
  writeFile(name: string, data: string): void;
}

/** Register backend-declared settings for the generic panel and daemon form. */
export interface PanelSettingsFormService {
  /** Declares the calling plugin's form. An effect: it leaves with the plugin. */
  declare(declaration: PanelSettingsDeclaration): () => void;
  /** The ids that declared a form, in declaration order. */
  declared(): string[];
  canReset(id: string): boolean;
  /** One plugin's fields and values, or `null` when it declared nothing. */
  read(id: string): Promise<PanelSettingsSchema | null>;
  /** Hands `values` to that plugin's own `write()`. */
  write(id: string, values: Record<string, unknown>): Promise<PluginChangeResult>;
  reset(id: string): Promise<PluginChangeResult>;
}

/** Translation, and the way a plugin contributes its own strings. */
export interface PanelI18nService {
  readonly $t: typeof i18next.t;
  readonly i18next: typeof i18next;
  /**
   * Merge the plugin's translations, keyed by locale (`en_us`, `zh_cn`, ...).
   * Removed again when the plugin unloads, so its strings arrive and leave with
   * it instead of living in the foundational `plugins/i18n` catalogue.
   */
  define(messages: Record<string, Record<string, unknown>>): () => void;
}

/**
 * Koa service provided by the server plugin. Middleware and routers are scoped to their
 * registering plugins.
 */
export interface PanelKoaService {
  readonly app: Koa;
  /** Adds a middleware, ahead of feature-plugin routers. */
  use(middleware: Koa.Middleware): () => void;
  /** Creates a router owned by the calling plugin and mounts it. */
  router(prefix?: string): Router;
}

/**
 * The panel's browser-facing Socket.IO server. It shares the HTTP listener and
 * its path prefix; plugins attach their own authentication middleware and rooms.
 */
export interface PanelWebsocketService {
  readonly io: Server;
}

/** The shared request middleware. Policy comes from the installed guard. */
export interface PanelMiddlewareService {
  permission(route: GuardedRoute): Koa.Middleware;
  readonly validator: typeof validator;
  readonly instanceAccess: Koa.Middleware;
  /** Per-caller rate limit; elevated callers pass through. */
  speedLimit(seconds: number, errMsg?: string): Koa.Middleware;
  requestConcurrencyLimiter(url: string): Koa.Middleware;
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

/** Node connections and request forwarding provided by the node plugin. */
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

/** Runtime-owned operation records shared by feature plugins. */
export interface PanelOperationLogger {
  log<T extends keyof OperationLoggerItemPayload>(
    type: T,
    payload: Omit<
      OperationLoggerItemPayload[T],
      "operation_id" | "operation_time" | "operation_level"
    >,
    level?: "info" | "warning" | "error"
  ): string;
  info<T extends keyof OperationLoggerItemPayload>(
    type: T,
    payload: Omit<
      OperationLoggerItemPayload[T],
      "operation_id" | "operation_time" | "operation_level"
    >
  ): string;
  warning<T extends keyof OperationLoggerItemPayload>(
    type: T,
    payload: Omit<
      OperationLoggerItemPayload[T],
      "operation_id" | "operation_time" | "operation_level"
    >
  ): string;
  error<T extends keyof OperationLoggerItemPayload>(
    type: T,
    payload: Omit<
      OperationLoggerItemPayload[T],
      "operation_id" | "operation_time" | "operation_level"
    >
  ): string;
  get(limit?: number): Promise<OperationLoggerItem[]>;
  getByInstance(
    instanceId: string,
    daemonId: string,
    limit?: number
  ): Promise<OperationLoggerItem[]>;
}

/** What is installed and what is loaded, plus the switch that decides. */
export interface PanelPluginsService {
  readonly runtime?: NpmRuntimeUpdateService;
  readonly restartPending?: boolean;
  waitForDisposal(): Promise<void>;
  /** Keep in-flight market operations alive when a shared npm dependency changes. */
  deferRestartUntil(response: Promise<void>): void;
  readonly loaded: readonly LoadedPanelPlugin[];
  /** The manifest the browser fetches to discover frontend entries. */
  frontendManifest(): PanelFrontendPluginEntry[];
  /** Every installed plugin, disabled ones included. */
  inventory(): PanelPluginRecord[];
  /**
   * Turns a plugin on or off: persists the switch in data/plugin-overrides.json and
   * applies it to the running panel. Disabling disposes the backend scope, so
   * its routes, middleware, timers and services go with it.
   */
  setEnabled(id: string, enabled: boolean): Promise<PanelPluginRecord>;
  install(options: {
    name: string;
    version?: string;
    pluginId?: string;
    /** Delay a required process restart until the HTTP response is flushed. */
    reloadAfter?: Promise<void>;
  }): Promise<PanelPluginRecord>;
  /** Install every package without reloading, then restart the entire panel once. */
  updateBatch(options: NpmUpdateBatchOptions): Promise<NpmUpdateBatchResult>;
  /** Unloads and removes an installed panel plugin package. */
  remove(id: string): Promise<void>;
  /** Null restores package defaults and removes the saved config override. */
  configure(id: string, config: Record<string, unknown> | null): Promise<PanelPluginRecord>;
  configuration(id: string): PanelSettingsSchema;
  runExclusive<T>(operation: () => Promise<T>): Promise<T>;
  /**
   * Re-scans the plugin directories: a plugin that has appeared since startup is
   * installed, updated, removed and disabled plugins are reconciled in place.
   */
  reload(): Promise<readonly LoadedPanelPlugin[]>;
}

declare module "cordis" {
  interface Events {
    "process/restarting"(): void | Promise<void>;
    "plugins/reloading"(): void | Promise<void>;
  }
  interface Context {
    // Shared services supplied by foundation plugins before feature plugins load.
    settings: PanelSettingsService;
    storage: PanelStorageService;
    i18n: PanelI18nService;
    middleware: PanelMiddlewareService;
    roles: typeof ROLE;
    identity: PanelIdentityService;
    // Feature services are provided by their owning plugins.
    settingsForm: PanelSettingsFormService;
    operations: PanelOperationLogger;
    /** Instance details, without account data, provided by the `instance` plugin. */
    instances: {
      getDetails(instances: readonly { instanceUuid: string; daemonId: string }[]): Promise<any[]>;
      /** @deprecated Resolve profiles through the account service instead. */
      getByUuid(uuid: string, targetDaemonId?: string, advanced?: boolean): Promise<any>;
    };
    globals: typeof GlobalVariable;
    overview: PanelOverviewService;
    plugins: PanelPluginsService;

    // Provided by plugins. Resolve optional services with `get()` or declare an `inject` dependency.
    /** Koa application provided by the server plugin. Declare an injection before using it. */
    koa: PanelKoaService;
    /** Browser-facing Socket.IO transport, provided by `plugins/server`. */
    websocket: PanelWebsocketService;
    /** Daemon access provided by the node plugin. */
    remote: PanelRemoteService;
    /** Request authorization for the whole panel. Provided by `plugins/user`. */
    guard: RequestGuard;
  }
}

/** The context a panel plugin's `apply()` receives. */
export type PanelPluginContext = Context;
