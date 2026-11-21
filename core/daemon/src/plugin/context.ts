import type {
  NpmRuntimeUpdateService,
  NpmUpdateBatchOptions,
  NpmUpdateBatchResult,
  PluginChangeResult,
  PluginSettingsPage
} from "mcsmanager-common";
import { Context } from "cordis";
import type Koa from "koa";
import type Router from "@koa/router";
import type { Server as SocketIOServer } from "socket.io";
import type { GitignoreMatcher } from "../../../../plugins/runtime/daemon/src/backend/common/gitignore_matcher";
import type {
  compress,
  decompress,
  listArchiveEntries,
  decompressWithProgress
} from "../../../../plugins/runtime/daemon/src/backend/common/compress";
import type { getCommonHeaders } from "../../../../plugins/runtime/daemon/src/backend/common/network";
import type downloadManager from "../../../../plugins/runtime/daemon/src/backend/service/download_manager";
import type { missionPassport } from "../../../../plugins/runtime/daemon/src/backend/service/mission_passport";
import type { sendFile } from "../../../../plugins/runtime/daemon/src/backend/utils/speed_limit";
import type { globalConfiguration } from "../../../../plugins/runtime/daemon/src/backend/entity/config";
type Instance = any;
type InstanceConfig = any;
type ILifeCycleTask = any;
type InstanceCommand = any;
type commandStringToArray = (text: string) => string[];
type IAsyncTask = any;
type IPresetCommand = string;
import type RouterContext from "../../../../plugins/server/daemon/src/backend/context";
import type i18next from "i18next";
import type { check7zipStatus } from "../../../../plugins/runtime/daemon/src/backend/service/seven_zip_service";
import type { DaemonPluginEntry, DaemonPluginRecord } from "./loader";
import type { InstanceInstallTaskClass } from "../../../../plugins/instance/daemon/src/backend/install_task";

/**
 * Plugin service contracts. Cordis owns registered effects, loggers and timers.
 * Use type-only contract imports to avoid cycles. Foundation plugins provide shared services.
 */
export const ctx = new Context();

/** Daemon configuration, plus the calls that persist and re-language it. */
export interface DaemonSettingsService {
  readonly config: typeof globalConfiguration.config;
  defaults(): typeof globalConfiguration.config;
  /** Version detected by the runtime foundation for this daemon process. */
  readonly version: string;
  save(): void;
  /** Switch the daemon language and drop the bootstrap language preset file. */
  setLanguage(language: string): void;
}

/** Entity and file persistence supplied by `plugins/storage`. */
export interface DaemonStorageService {
  store(category: string, uuid: string, object: any): void;
  load(category: string, classz: any, uuid: string): any;
  list(category: string): string[];
  delete(category: string, uuid: string): void;
  writeFile(name: string, data: string): void;
  readFile(name: string): string;
  readDir(dirName: string): string[];
}

/** What a declared setting renders as. `link` reads and writes nothing. */
export type DaemonSettingFieldType =
  | "string"
  | "color"
  /** Multi-line string. */
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "list"
  | "link";

export interface DaemonSettingOption {
  value: string | number | boolean;
  label: string;
}

/** Backend-declared settings fields with labels translated in the daemon's current language. */
export interface DaemonSettingField {
  page?: PluginSettingsPage;
  /** The key in `read()`'s result and `write()`'s argument. Absent for `link`. */
  key?: string;
  type: DaemonSettingFieldType;
  title: string;
  description?: string;
  placeholder?: string;
  unit?: string;
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
  fields?: DaemonSettingField[];
  maxItems?: number;
  itemTitleKey?: string;
  listEditor?: "inline" | "dialog";
  addLabel?: string;
  editLabel?: string;
  removeLabel?: string;
  required?: boolean;
}

/** Resolve fields per request so their translated labels follow the active language. */
export interface DaemonSettingsDeclaration {
  page?(): PluginSettingsPage;
  /** Changes to this form require a process restart. */
  restartRequired?: boolean;
  fields(): DaemonSettingField[];
  defaults?(): Record<string, unknown>;
  reset?(): void | Promise<void>;
  read(): Record<string, unknown> | Promise<Record<string, unknown>>;
  write(values: Record<string, unknown>): void | Promise<void>;
}

/** One plugin's form and its current values, as the panel fetches them. */
export interface DaemonSettingsSchema {
  id: string;
  fields: DaemonSettingField[];
  values: Record<string, unknown>;
}

/** Register daemon settings for the panel's generic form. */
export interface DaemonSettingsFormService {
  /** Declares the calling plugin's form. An effect: it leaves with the plugin. */
  declare(declaration: DaemonSettingsDeclaration): () => void;
  /** The ids that declared a form, in declaration order. */
  declared(): string[];
  canReset(id: string): boolean;
  /** One plugin's fields and values, or `null` when it declared nothing. */
  read(id: string): Promise<DaemonSettingsSchema | null>;
  /** Hands `values` to that plugin's own `write()`. */
  write(id: string, values: Record<string, unknown>): Promise<PluginChangeResult>;
  reset(id: string): Promise<PluginChangeResult>;
}

export interface DaemonI18nService {
  readonly $t: typeof i18next.t;
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

/** Socket.IO transport provided by the server plugin for connected panel clients. */
export interface DaemonWebsocketService {
  readonly io: SocketIOServer;
}

/** Runtime upload authorization and rate-limit middleware, mounted before the body parser. */
export interface DaemonMiddlewareService {
  readonly uploadFileCheck: Koa.Middleware;
  readonly uploadSpeedLimit: Koa.Middleware;
}

/**
 * Socket.IO request protocol. Handler and middleware registrations are scoped to their calling
 * plugin.
 */
export interface DaemonProtocolService {
  on(event: string, handler: (ctx: RouterContext, data: any) => void): () => void;
  use(handler: (event: string, ctx: RouterContext, data: any, next: Function) => void): () => void;
  readonly response: (ctx: RouterContext, data: any) => void;
  readonly responseError: (
    ctx: RouterContext,
    error: Error | string,
    config?: { disablePrint: boolean }
  ) => void;
  readonly error: (
    ctx: RouterContext,
    event: string,
    error: any,
    config?: { disablePrint: boolean }
  ) => void;
  readonly msg: (ctx: RouterContext, event: string, data: any) => void;
  /** Pushes an event to every socket authenticated with the daemon key. */
  readonly broadcast: (event: string, data: any) => void;
  readonly ROLE: { ADMIN: number; USER: number; GUEST: number; BAN: number };
  /** Marker an error message carries to keep `error()` from printing it. */
  readonly IGNORE: string;
}

/** The instances this daemon runs, and the pieces needed to build a new one. */
export interface DaemonInstancesService {
  readonly subsystem: any;
  readonly Instance: any;
  readonly Config: any;
  readonly Command: any;
  readonly UpdateAction: any;
  /** Shared download, extraction, progress and cancellation lifecycle for installers. */
  readonly InstallTask: InstanceInstallTaskClass;
  readonly fileManager: (instanceUuid: string) => DaemonFileManager;
  readonly headers: typeof getCommonHeaders;
  readonly commandStringToArray: commandStringToArray;
}

/** Builds an optional lifecycle task for one instance. */
export type DaemonLifecycleTaskFactory = (instance: Instance) => ILifeCycleTask | undefined;

/** Lifecycle tasks contributed by daemon plugins and applied by the dispatcher. */
export interface DaemonLifecycleService {
  register(factory: DaemonLifecycleTaskFactory): () => void;
  entries(): readonly DaemonLifecycleTaskFactory[];
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
  readonly AsyncTask: any;
  readonly Center: {
    addTask(task: any): void;
    getTask(taskId: string, type?: string): any;
    getTasks(type?: string): any[];
  };
  register(taskName: string, registration: DaemonAsyncTaskRegistration): () => void;
  get(taskName: string): DaemonAsyncTaskRegistration | undefined;
}

/** Builds the command backing one instance preset, per instance. */
export type DaemonPresetCommandFactory = () => InstanceCommand;

/**
 * The command behind one instance preset. `FunctionDispatcher` applies these
 * after its own defaults, so a plugin can provide a preset the core has no
 * implementation for, or replace an existing preset. Without the plugin the
 * preset is absent and `execPreset` does nothing.
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
  all(): Record<string, boolean>;
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
 * Shared runtime services for transfer passports, URL downloads, rate-limited sending and
 * temporary-file cleanup.
 */
export interface DaemonTransferService {
  readonly passports: typeof missionPassport;
  readonly downloads: typeof downloadManager;
  readonly sendFile: typeof sendFile;
}

/** Java runtime management supplied by `plugins/instance`. */
export interface DaemonJavaManagerService {
  list(): IJavaRuntime[];
  getJava(id: string): IJavaRuntime | undefined;
  exists(id: string): boolean;
  getJavaDataDir(): string;
  getJavaDownloadUrl(
    info: IJavaInfo & { name: string; version?: string }
  ): Promise<string | undefined>;
  getAvailableVersions(): Promise<import("../../../common/src/java").JavaCatalog>;
  startInstall(version: string): Promise<IJavaRuntime>;
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

/** File primitives provided by the file plugin for instance management and installers. */
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
  readonly runtime?: NpmRuntimeUpdateService;
  readonly restartPending?: boolean;
  waitForDisposal(): Promise<void>;
  readonly loaded: readonly DaemonPluginEntry[];
  /** Every installed plugin, disabled ones included. */
  inventory(): DaemonPluginRecord[];
  /**
   * Turns a plugin on or off: persists the switch in data/plugin-overrides.json and
   * applies it to the running daemon. Disabling disposes the plugin's scope, so
   * its protocol handlers, tasks, timers and services go with it.
   */
  setEnabled(id: string, enabled: boolean): Promise<DaemonPluginRecord>;
  install(options: {
    name: string;
    version?: string;
    pluginId?: string;
    /** Keep the reply connection alive until the caller has sent its response. */
    reloadAfter?: Promise<void>;
  }): Promise<DaemonPluginRecord>;
  /** Install every package without reloading, then restart the entire daemon once. */
  updateBatch(options: NpmUpdateBatchOptions): Promise<NpmUpdateBatchResult>;
  /** Unloads and removes an installed daemon plugin package. */
  remove(id: string): Promise<void>;
  /** Null restores package defaults and removes the saved config override. */
  configure(id: string, config: Record<string, unknown> | null): Promise<DaemonPluginRecord>;
  configuration(id: string): DaemonSettingsSchema;
  runExclusive<T>(operation: () => Promise<T>): Promise<T>;
  /**
   * Re-scans the plugin directories: a plugin that has appeared since startup is
   * installed, updated, removed and disabled plugins are reconciled in place.
   */
  reload(): Promise<readonly DaemonPluginEntry[]>;
}

declare module "cordis" {
  interface Events {
    "process/starting"(): void | Promise<void>;
    "process/restarting"(): void | Promise<void>;
    "plugins/reloading"(): void | Promise<void>;
    /** The replacement graph is ready; restore retained owners before listeners open. */
    "plugins/reloaded"(): void | Promise<void>;
  }
  interface Context {
    // Shared services supplied by foundation plugins before feature plugins load.
    settings: DaemonSettingsService;
    storage: DaemonStorageService;
    settingsForm: DaemonSettingsFormService;
    i18n: DaemonI18nService;
    middleware: DaemonMiddlewareService;
    protocol: DaemonProtocolService;
    instances: DaemonInstancesService;
    instanceLifecycle: DaemonLifecycleService;
    tasks: DaemonTasksService;
    presets: DaemonPresetsService;
    schedules: DaemonSchedulesService;
    features: DaemonFeaturesService;
    overview: DaemonOverviewService;
    archive: DaemonArchiveService;
    transfer: DaemonTransferService;
    backgroundTasks: import("../../../../plugins/runtime/daemon/src/backend/service/background_tasks").BackgroundTasks;
    javaManager: DaemonJavaManagerService;
    plugins: DaemonPluginsService;

    // Provided by `plugins/server`, the daemon's network layer. Without it the
    // daemon listens on nothing, so `inject` them rather than assuming.
    /** File primitives provided by the file plugin. */
    files: DaemonFilesService;
    koa: DaemonKoaService;
    websocket: DaemonWebsocketService;
  }
}

/** The context a daemon plugin's `apply()` receives. */
export type DaemonPluginContext = Context;
