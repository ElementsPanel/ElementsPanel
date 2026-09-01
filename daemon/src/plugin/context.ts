import { Context } from "cordis";
import type Koa from "koa";
import type Router from "@koa/router";
import type { Server as SocketIOServer } from "socket.io";
import type { GitignoreMatcher } from "../common/gitignore_matcher";
import type { decompressWithProgress } from "../common/compress";
import type { getCommonHeaders } from "../common/network";
import type { globalConfiguration } from "../entity/config";
import type Instance from "../entity/instance/instance";
import type InstanceConfig from "../entity/instance/Instance_config";
import type InstanceCommand from "../entity/commands/base/command";
import type { IPresetCommand } from "../entity/commands/dispatcher";
import type RouterContext from "../entity/ctx";
import type { $t } from "../i18n";
import type {
  uploadFileCheckMiddleware,
  uploadSpeedLimitMiddleware
} from "../middlewares/precheck";
import type { AsyncTask, IAsyncTask, TaskCenter } from "../service/async_task_service";
import type { getFileManager } from "../service/file_router_service";
import type { InstanceUpdateAction } from "../service/instance_update_action";
import type * as protocol from "../service/protocol";
import type { check7zipStatus } from "../service/seven_zip_service";
import type InstanceSubsystem from "../service/system_instance";
import type { DaemonPluginEntry, DaemonPluginRecord } from "./loader";

/**
 * The daemon's cordis container, and the complete list of what a plugin can see.
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

/** Daemon configuration, plus the calls that persist and re-language it. */
export interface DaemonSettingsService {
  readonly config: typeof globalConfiguration.config;
  save(): void;
  /** Switch the daemon language and drop the bootstrap language preset file. */
  setLanguage(language: string): void;
}

export interface DaemonI18nService {
  readonly $t: typeof $t;
  /** Merge the plugin's translations, keyed by locale. Removed on unload. */
  define(messages: Record<string, Record<string, unknown>>): () => void;
}

/**
 * The daemon's Koa application, for the few plugins that serve HTTP directly.
 * `use()` and `router()` are scoped to the calling plugin.
 *
 * Provided by `plugins/server`, which owns the application itself.
 */
export interface DaemonKoaService {
  readonly app: Koa;
  use(middleware: Koa.Middleware): () => void;
  router(prefix?: string): Router;
}

/**
 * The Socket.io server the panel connects to. Provided by `plugins/server`; the
 * core attaches its own connection handling to it, and a plugin that needs to
 * reach every connected client directly can do the same.
 */
export interface DaemonWebsocketService {
  readonly io: SocketIOServer;
}

/**
 * The base Koa middleware the web server mounts ahead of the body parser.
 *
 * Both consult the upload subsystem — the passports that authorize an upload and
 * the configured rate limit — so the core owns them and hands them over, rather
 * than the server plugin reaching into that subsystem itself.
 */
export interface DaemonMiddlewareService {
  readonly uploadFileCheck: typeof uploadFileCheckMiddleware;
  readonly uploadSpeedLimit: typeof uploadSpeedLimitMiddleware;
}

/**
 * The Socket.io protocol the panel talks to this daemon over.
 *
 * `on()` and `use()` are scoped to the calling plugin, but note that
 * `service/router.ts` snapshots the handler list per connection: a handler
 * registered after a client connected is invisible to that client's socket.
 * Plugins load before the server starts listening, so this only limits
 * hot-reloading a plugin on a running daemon.
 */
export interface DaemonProtocolService {
  on(event: string, handler: (ctx: RouterContext, data: any) => void): () => void;
  use(
    handler: (event: string, ctx: RouterContext, data: any, next: Function) => void
  ): () => void;
  readonly response: typeof protocol.response;
  readonly responseError: typeof protocol.responseError;
  readonly error: typeof protocol.error;
  readonly msg: typeof protocol.msg;
  readonly ROLE: typeof protocol.ROLE;
}

/** The instances this daemon runs, and the pieces needed to build a new one. */
export interface DaemonInstancesService {
  readonly subsystem: typeof InstanceSubsystem;
  readonly Instance: typeof Instance;
  readonly Config: typeof InstanceConfig;
  readonly Command: typeof InstanceCommand;
  readonly UpdateAction: typeof InstanceUpdateAction;
  readonly fileManager: typeof getFileManager;
  readonly headers: typeof getCommonHeaders;
}

export interface DaemonAsyncTaskRegistration {
  type: string;
  create: (instance: Instance, parameter?: any) => IAsyncTask;
  /**
   * Set to false for a task that builds its own instance, such as creating one
   * from a market package. Those receive `undefined` as the instance.
   */
  requiresInstance?: boolean;
  /** Minimum caller role the panel must report. Unset means any role. */
  requiredRole?: number;
}

/** Long-running work the panel starts through `instance/asynchronous`. */
export interface DaemonTasksService {
  readonly AsyncTask: typeof AsyncTask;
  readonly Center: typeof TaskCenter;
  register(taskName: string, registration: DaemonAsyncTaskRegistration): () => void;
  get(taskName: string): DaemonAsyncTaskRegistration | undefined;
}

/** Builds the command backing one instance preset, per instance. */
export type DaemonPresetCommandFactory = () => InstanceCommand;

/**
 * The command behind one instance preset. `FunctionDispatcher` applies these
 * after its own defaults, so a plugin can provide a preset the core has no
 * implementation for — `install`, owned by `plugins/market` — or replace one it
 * does. Without the plugin the preset is absent and `execPreset` does nothing.
 */
export interface DaemonPresetsService {
  register(preset: IPresetCommand, factory: DaemonPresetCommandFactory): () => void;
  entries(): ReadonlyMap<IPresetCommand, DaemonPresetCommandFactory>;
}

export type DaemonScheduleActionHandler = (
  instance: Instance,
  payload: string
) => Promise<void> | void;

/** Action types a scheduled task may run. */
export interface DaemonSchedulesService {
  register(actionType: string, handler: DaemonScheduleActionHandler): () => void;
  get(actionType: string): DaemonScheduleActionHandler | undefined;
}

/** Capability flags the panel reads from `info/overview` to shape its UI. */
export interface DaemonFeaturesService {
  add(feature: string): () => void;
  has(feature: string): boolean;
}

/** Fields a plugin adds to the `info/overview` payload the panel reads. */
export type DaemonOverviewProvider = () =>
  | Record<string, unknown>
  | Promise<Record<string, unknown>>;

export interface DaemonOverviewService {
  provide(provider: DaemonOverviewProvider): () => void;
  collect(): Promise<Record<string, unknown>>;
}

/** Archive handling, shared by the backup and install plugins. */
export interface DaemonArchiveService {
  readonly GitignoreMatcher: typeof GitignoreMatcher;
  readonly decompressWithProgress: typeof decompressWithProgress;
  readonly check7zipStatus: typeof check7zipStatus;
  readonly sevenZipPath: string;
  readonly zipTimeoutSeconds: number;
}

/** What is installed, what is running, and the switch that decides. */
export interface DaemonPluginsService {
  readonly loaded: readonly DaemonPluginEntry[];
  /** Every installed plugin, disabled ones included. */
  inventory(): DaemonPluginRecord[];
  /**
   * Turns a plugin on or off: persists the switch in its `plugin.json` and
   * applies it to the running daemon. Disabling disposes the plugin's scope, so
   * its protocol handlers, tasks, timers and services go with it.
   */
  setEnabled(id: string, enabled: boolean): Promise<DaemonPluginRecord>;
}

declare module "cordis" {
  interface Context {
    settings: DaemonSettingsService;
    i18n: DaemonI18nService;
    middleware: DaemonMiddlewareService;
    protocol: DaemonProtocolService;
    instances: DaemonInstancesService;
    tasks: DaemonTasksService;
    presets: DaemonPresetsService;
    schedules: DaemonSchedulesService;
    features: DaemonFeaturesService;
    overview: DaemonOverviewService;
    archive: DaemonArchiveService;
    plugins: DaemonPluginsService;

    // Provided by `plugins/server`, the daemon's network layer. Without it the
    // daemon listens on nothing, so `inject` them rather than assuming.
    koa: DaemonKoaService;
    websocket: DaemonWebsocketService;
  }
}

/** The context a daemon plugin's `apply()` receives. */
export type DaemonPluginContext = Context;
