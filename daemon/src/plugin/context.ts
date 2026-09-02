import { Context } from "cordis";
import type Koa from "koa";
import type Router from "@koa/router";
import type { Server as SocketIOServer } from "socket.io";
import type { GitignoreMatcher } from "../common/gitignore_matcher";
import type StorageSubsystem from "../common/system_storage";
import type {
  compress,
  decompress,
  listArchiveEntries,
  decompressWithProgress
} from "../common/compress";
import type { getCommonHeaders } from "../common/network";
import type downloadManager from "../service/download_manager";
import type { missionPassport } from "../service/mission_passport";
import type { sendFile } from "../utils/speed_limit";
import type { globalConfiguration } from "../entity/config";
import type Instance from "../entity/instance/instance";
import type InstanceConfig from "../entity/instance/Instance_config";
import type InstanceCommand from "../entity/commands/base/command";
import type { commandStringToArray } from "../entity/commands/base/command_parser";
import type { IPresetCommand } from "../entity/commands/dispatcher";
import type RouterContext from "../entity/ctx";
import type { $t } from "../i18n";
import type {
  uploadFileCheckMiddleware,
  uploadSpeedLimitMiddleware
} from "../middlewares/precheck";
import type { AsyncTask, IAsyncTask, TaskCenter } from "../service/async_task_service";
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

/** Local storage shared by daemon plugins without importing daemon core. */
export type DaemonStorageService = typeof StorageSubsystem;

/** What a declared setting renders as. `link` reads and writes nothing. */
export type DaemonSettingFieldType =
  | "string"
  /** Multi-line string. */
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "link";

export interface DaemonSettingOption {
  value: string | number | boolean;
  label: string;
}

/**
 * One row of a plugin's configuration form, described rather than drawn.
 *
 * Labels are plain strings, already translated: the panel renders this form, and
 * the browser has no copy of a daemon plugin's catalogue. Whoever declares the
 * field resolves it, in whatever language the panel last pushed to this daemon.
 */
export interface DaemonSettingField {
  /** The key in `read()`'s result and `write()`'s argument. Absent for `link`. */
  key?: string;
  type: DaemonSettingFieldType;
  title: string;
  description?: string;
  placeholder?: string;
  /** `number`: inclusive bounds, enforced by the form and by `write()`. */
  min?: number;
  max?: number;
  /** `select`: the allowed values. */
  options?: DaemonSettingOption[];
  /** `string`: render as a password input. */
  secret?: boolean;
  /**
   * Shown only while every listed condition holds. A condition is either a field
   * name, true when that field is truthy, or `"name=value"`, true when that
   * field's value stringifies to `value`.
   */
  visibleWhen?: string | string[];
  /** `link`: a panel route the form offers as a button. */
  route?: string;
}

/**
 * A plugin's configuration, as its backend declares it.
 *
 * `fields` is a function so that it is resolved per request: a plugin's titles
 * come from its own catalogue, and the daemon's language changes when the panel
 * pushes a new one.
 */
export interface DaemonSettingsDeclaration {
  fields(): DaemonSettingField[];
  read(): Record<string, unknown> | Promise<Record<string, unknown>>;
  write(values: Record<string, unknown>): void | Promise<void>;
}

/** One plugin's form and its current values, as the panel fetches them. */
export interface DaemonSettingsSchema {
  id: string;
  fields: DaemonSettingField[];
  values: Record<string, unknown>;
}

/**
 * The register of plugin configuration forms.
 *
 * A daemon plugin has no browser half at all, so it cannot ship a component for
 * its settings. It describes them here instead, and the panel's plugin manager
 * renders the description with the same generic form it uses for its own plugins.
 */
export interface DaemonSettingsFormService {
  /** Declares the calling plugin's form. An effect: it leaves with the plugin. */
  declare(declaration: DaemonSettingsDeclaration): () => void;
  /** The ids that declared a form, in declaration order. */
  declared(): string[];
  /** One plugin's fields and values, or `null` when it declared nothing. */
  read(id: string): Promise<DaemonSettingsSchema | null>;
  /** Hands `values` to that plugin's own `write()`. */
  write(id: string, values: Record<string, unknown>): Promise<void>;
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
  /** Marker an error message carries to keep `error()` from printing it. */
  readonly IGNORE: string;
}

/** The instances this daemon runs, and the pieces needed to build a new one. */
export interface DaemonInstancesService {
  readonly subsystem: typeof InstanceSubsystem;
  readonly Instance: typeof Instance;
  readonly Config: typeof InstanceConfig;
  readonly Command: typeof InstanceCommand;
  readonly UpdateAction: typeof InstanceUpdateAction;
  readonly fileManager: (instanceUuid: string) => DaemonFileManager;
  readonly headers: typeof getCommonHeaders;
  readonly commandStringToArray: typeof commandStringToArray;
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

/** Archive handling, shared by the backup, install and file manager plugins. */
export interface DaemonArchiveService {
  readonly GitignoreMatcher: typeof GitignoreMatcher;
  readonly compress: typeof compress;
  readonly decompress: typeof decompress;
  readonly listArchiveEntries: typeof listArchiveEntries;
  readonly decompressWithProgress: typeof decompressWithProgress;
  readonly check7zipStatus: typeof check7zipStatus;
  readonly sevenZipPath: string;
  readonly zipTimeoutSeconds: number;
}

/**
 * The plumbing a file transfer needs from the core: the passports that authorize
 * one, the URL downloader instance management shares with it, the rate-limited
 * file sender and the temp-file cleanup.
 *
 * These stay in the core because other features use them too — `passport_router`
 * issues passports, `stream_router` checks them, and the Java manager and mod
 * service download by URL.
 */
export interface DaemonTransferService {
  readonly passports: typeof missionPassport;
  readonly downloads: typeof downloadManager;
  readonly sendFile: typeof sendFile;
}

/** Java runtime management supplied by `plugins/javamanager`. */
export interface DaemonJavaManagerService {
  list(): IJavaRuntime[];
  getJava(id: string): IJavaRuntime | undefined;
  exists(id: string): boolean;
  getJavaDataDir(): string;
  getJavaDownloadUrl(info: IJavaInfo & { name: string; version?: string }): Promise<string | undefined>;
  addJava(info: IJavaInfo & { name: string; version?: string }): void;
  updateJavaInfo(info: IJavaInfo & { name: string; version?: string }): void;
  getJavaRuntimeCommand(id: string): Promise<string>;
  removeJava(id: string): Promise<boolean>;
}

/** One instance's working directory, as the core and its plugins use it. */
export interface DaemonFileManager {
  check(destPath: string): boolean;
  checkPath(fileNameOrPath: string): boolean;
  toAbsolutePath(fileName?: string): string;
  readFile(fileName: string): Promise<string>;
  writeFile(fileName: string, data: string): Promise<boolean>;
  unzip(sourceZip: string, destDir: string, code?: string): Promise<boolean>;
}

/** One chunked upload in flight, as the instance overview reports it. */
export interface DaemonUploadTask {
  readonly cwd: string;
  readonly path: string;
  /** Total bytes the file will be. */
  readonly size: number;
  /** The byte ranges written so far. */
  readonly received: ReadonlyArray<{ start: number; end: number }>;
  readonly writer: { stop(): void };
}

/**
 * The daemon's file primitives.
 *
 * **Provided by `plugins/filemanager`.** The core declares only the shape its own
 * few callers need — instance creation, the Java manager, SteamCMD, the mod
 * service — and resolves it at use time through `service/file_access.ts`, so
 * removing that plugin removes the daemon's ability to touch instance files
 * rather than breaking the build.
 */
export interface DaemonFilesService {
  readonly FileManager: {
    new (topPath?: string, fileCode?: string): DaemonFileManager;
    checkFileName(fileName: string): boolean;
  };
  /** Chunked uploads in flight. */
  readonly uploads: {
    getUploads(): Map<string, DaemonUploadTask>;
    get(id: string): DaemonUploadTask | undefined;
    exit(): Promise<void>;
  };
  getFileManager(instanceUuid: string): DaemonFileManager;
  getWindowsDisks(): string[];
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
    storage: DaemonStorageService;
    settingsForm: DaemonSettingsFormService;
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
    transfer: DaemonTransferService;
    javaManager: DaemonJavaManagerService;
    plugins: DaemonPluginsService;

    // Provided by `plugins/server`, the daemon's network layer. Without it the
    // daemon listens on nothing, so `inject` them rather than assuming.
    /**
     * The file primitives. Provided by `plugins/filemanager`, which owns the
     * whole file subsystem — instance files are unreachable without it.
     */
    files: DaemonFilesService;
    koa: DaemonKoaService;
    websocket: DaemonWebsocketService;
  }
}

/** The context a daemon plugin's `apply()` receives. */
export type DaemonPluginContext = Context;
