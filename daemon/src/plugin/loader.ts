import { Logger, type ForkScope } from "cordis";
import fs from "fs-extra";
import {
  pluginDirectoryRevision,
  applyPluginOverrides,
  writePluginOverride,
  validatePluginCompatibility,
  validatePluginSettings,
  createPluginQueue,
  trackPluginDisposal,
  type PluginState,
  type PluginChangeResult,
  discoverExternalPluginRoots,
  discoverPluginsFromRoots,
  sortPlugins,
  type DiscoverPluginsOptions,
  type DiscoveredPlugin,
  type PluginManifest
} from "mcsmanager-common";
import path from "path";
import { pathToFileURL } from "url";
import { ctx, type DaemonPluginContext, type DaemonSettingsSchema } from "./context";

/**
 * Turns the plugin directories into cordis plugins.
 *
 * Discovery is shared with the panel (`mcsmanager-common`); everything past it is
 * cordis: each plugin module is handed to `ctx.plugin()`, which resolves its
 * `inject` list, calls `apply()` with a scope of its own, and undoes every effect
 * that scope registered when it is disposed. A plugin that throws is isolated by
 * cordis and reported through `ctx.logger`, so the daemon keeps running.
 */

const logger = new Logger("plugin");
const change = createPluginQueue();
const settle = trackPluginDisposal(ctx);
const unloading = new Set<string>();
const codeRevisions = new Map<string, string>();

const BUILT_IN_PLUGINS_DIRECTORY = () => path.resolve(process.cwd(), "plugins");
/**
 * Plugins installed from the plugin market, kept apart from the built-in tree and
 * git-ignored. New installations use data/plugins; this root remains readable.
 */
const MARKET_PLUGINS_DIRECTORY = () => path.resolve(process.cwd(), "market_plugins");
const ENTRY_FIELDS = ["daemon", "backend", "main", "entry"];
const ENTRY_CANDIDATES = [
  "src/index.js",
  "src/index.cjs",
  "src/index.mjs",
  "src/daemon.js",
  "src/daemon.cjs",
  "src/daemon.mjs"
];
const FOUNDATION_PLUGIN_IDS = new Set(["i18n", "storage", "runtime"]);

/** A daemon plugin module, as its backend entry exports it. */
export interface DaemonPluginModule {
  /** Services the plugin cannot work without. cordis waits for them to appear. */
  inject?: string[] | Record<string, { required: boolean }>;
  apply(ctx: DaemonPluginContext, config?: unknown): void | Promise<void>;
}

export interface DaemonPluginEntry {
  manifest: PluginManifest;
  directory: string;
  folder: string;
  entry?: string;
  backendRevision?: string;
  restartRequired?: boolean;
  fork?: ForkScope;
  error?: Error;
}

const loaded: DaemonPluginEntry[] = [];

function discoverDaemonPlugins(options: DiscoverPluginsOptions) {
  const roots = [
    { directory: BUILT_IN_PLUGINS_DIRECTORY() },
    { directory: path.resolve(process.cwd(), "data", "plugins"), overrideManaged: true },
    { directory: MARKET_PLUGINS_DIRECTORY() }
  ];
  if (process.env.NODE_ENV === "development") {
    roots.push(...discoverExternalPluginRoots(path.resolve(process.cwd(), ".."), "daemon"));
  }
  return applyPluginOverrides(
    discoverPluginsFromRoots(roots, { ...options, includeDisabled: true })
  ).filter((plugin) => options.includeDisabled || plugin.manifest.enabled !== false);
}

/** Exposes the loader's own registry without pulling it into a plugin bundle. */
function ensureDaemonPluginService() {
  if (ctx.get("plugins")) return;
  ctx.provide("plugins", undefined, true);
  ctx.set("plugins", {
    get loaded() {
      return getLoadedDaemonPlugins();
    },
    inventory: getDaemonPluginInventory,
    setEnabled: setDaemonPluginEnabled,
    configure: configureDaemonPlugin,
    configuration: (id: string): DaemonSettingsSchema => {
      const manifest = findPlugin(id).manifest;
      return {
        id,
        fields: (Array.isArray(manifest.configFields)
          ? manifest.configFields
          : []) as DaemonSettingsSchema["fields"],
        values: (manifest.config || {}) as Record<string, unknown>
      };
    },
    runExclusive: change,
    reload: reloadDaemonPlugins
  });
}

/**
 * The plugin object a module exports, whether as named exports or as `default`.
 *
 * Only an object counts: every function has `Function.prototype.apply`, so a
 * module whose default export is a function would otherwise be mistaken for a
 * plugin and then called with the context as `this`.
 */
function toModule(value: any, id: string): DaemonPluginModule | undefined {
  for (const candidate of [value, value?.default]) {
    if (typeof candidate !== "object" || candidate === null) continue;
    if (typeof candidate.apply === "function") return candidate;
  }
  logger.warn(`Daemon plugin "${id}" must export an apply() function.`);
  return undefined;
}

async function loadModule(entry: string): Promise<unknown> {
  try {
    // eval keeps webpack from trying to bundle files supplied at runtime.
    const runtimeRequire = eval("require") as NodeRequire;
    if (process.env.NODE_ENV === "development" && /\.[cm]?tsx?$/.test(entry)) {
      runtimeRequire("ts-node/register/transpile-only");
    }
    return runtimeRequire(entry);
  } catch (error: any) {
    if (error?.code !== "ERR_REQUIRE_ESM") throw error;
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string
    ) => Promise<unknown>;
    return dynamicImport(pathToFileURL(entry).href);
  }
}

/**
 * Drops a plugin's entry module from the require cache, so the next `require()`
 * of it runs the file that is on disk rather than the copy an earlier run left
 * behind.
 */
function forgetCachedModule(entry?: string) {
  if (!entry) return;
  // eval keeps webpack from trying to bundle files supplied at runtime.
  const runtimeRequire = eval("require") as NodeRequire;
  delete runtimeRequire.cache[entry];
}

/** Requires one plugin's entry module and hands it to cordis. */
async function installPlugin(plugin: DiscoveredPlugin): Promise<DaemonPluginEntry> {
  const record: DaemonPluginEntry = { ...plugin };
  if (!plugin.entry) {
    logger.warn(`Daemon plugin "${plugin.manifest.id}" has no entry module.`);
    return record;
  }
  try {
    record.backendRevision = pluginDirectoryRevision(path.dirname(plugin.entry));
    validatePluginCompatibility(plugin.manifest.elements);
    const previousRevision = codeRevisions.get(plugin.manifest.id);
    if (previousRevision && previousRevision !== record.backendRevision) {
      record.restartRequired = true;
      return record;
    }
    codeRevisions.set(plugin.manifest.id, record.backendRevision!);
    const module = toModule(await loadModule(plugin.entry), plugin.manifest.id);
    if (!module) throw new Error(`Plugin "${plugin.manifest.id}" must export apply().`);
    // Plugins are applied one at a time, in `priority` order, and an `async
    // apply()` is awaited before the next plugin starts, so a plugin can rely
    // on what an earlier one set up.
    //
    // cordis catches a synchronous throw from `apply()` and cancels the scope
    // itself, so the wrapper keeps a copy of it: without that, a plugin that
    // failed on its first line would still be reported as loaded.
    let applied: unknown;
    let thrown: unknown;
    // The manifest id is the plugin's name, so `ctx.name` — which is what
    // appears in its log lines — always matches `plugin.json`.
    record.fork = ctx.plugin(
      {
        ...module,
        name: plugin.manifest.id,
        apply: (...args) => {
          try {
            return (applied = module.apply(...args));
          } catch (error) {
            thrown = error;
            throw error;
          }
        }
      },
      plugin.manifest.config
    );
    if (thrown) throw thrown;
    await applied;
    logger.info(`Daemon plugin loaded: ${plugin.manifest.id}`);
  } catch (error: any) {
    // Failure is atomic: whatever the plugin managed to register before it
    // threw goes with its scope, so a half-loaded plugin never stays behind.
    record.error = error instanceof Error ? error : new Error(String(error));
    record.fork?.dispose();
    record.fork = undefined;
    logger.error(`Daemon plugin failed to load: ${plugin.manifest.id}`, error);
  }
  return record;
}

/** Discovers, requires and installs every enabled plugin, in manifest order. */
export async function loadDaemonPlugins(): Promise<readonly DaemonPluginEntry[]> {
  ensureDaemonPluginService();
  const discovered = discoverDaemonPlugins({
    entryFields: ENTRY_FIELDS,
    entryCandidates: ENTRY_CANDIDATES,
    onWarning: (message, error) => logger.warn(message, error)
  });
  for (const plugin of discovered) {
    if (loaded.some((record) => record.manifest.id === plugin.manifest.id)) continue;
    loaded.push(await installPlugin(plugin));
  }
  sortPlugins(loaded);
  return loaded;
}

/**
 * Re-scans the plugin directories and reconciles them with what is running: a
 * plugin that has appeared since startup is installed, and one whose directory
 * is gone — or whose manifest now says `enabled: false` — is disposed.
 *
 * Development only. Loading a plugin into a running process is never fully
 * reversible: whatever it captured outside its own scope stays behind, and the
 * daemon binds its protocol handlers onto each socket as that socket connects
 * (`plugin/context.ts`), so a plugin that has just appeared is invisible to a
 * connection that is already open. That makes this the convenience it was
 * written for — a plugin installed from the market in a source checkout — and
 * nothing a production daemon should be asked to do.
 */
export async function reloadDaemonPlugins(): Promise<readonly DaemonPluginEntry[]> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Reloading plugins is only supported in a development environment.");
  }
  return change(async () => {
    ensureDaemonPluginService();
    const discovered = discoverDaemonPlugins({
      entryFields: ENTRY_FIELDS,
      entryCandidates: ENTRY_CANDIDATES,
      onWarning: (message, error) => logger.warn(message, error)
    });

    const installed = new Set(discovered.map((plugin) => plugin.manifest.id));
    for (let index = loaded.length - 1; index >= 0; index--) {
      const record = loaded[index];
      if (installed.has(record.manifest.id)) continue;
      await removeRunning(record.manifest.id);
      logger.info(`Daemon plugin unloaded: ${record.manifest.id}`);
    }

    for (const plugin of discovered) {
      if (loaded.some((record) => record.manifest.id === plugin.manifest.id)) continue;
      // A plugin installed, uninstalled and installed again would otherwise be
      // served the module its first run left behind.
      forgetCachedModule(plugin.entry);
      loaded.push(await installPlugin(plugin));
    }
    sortPlugins(loaded);
    await settle();
    return loaded;
  });
}

/** Loads one of the small foundation plugins before feature plugins start. */
export async function loadDaemonFoundationPlugin(id = "i18n") {
  ensureDaemonPluginService();
  if (!FOUNDATION_PLUGIN_IDS.has(id)) {
    throw new Error(`Daemon plugin "${id}" is not a foundational plugin.`);
  }

  const existing = loaded.find((record) => record.manifest.id === id);
  if (existing) return existing;

  const plugin = discoverDaemonPlugins({
    entryFields: ENTRY_FIELDS,
    entryCandidates: ENTRY_CANDIDATES,
    onWarning: (message, error) => logger.warn(message, error)
  }).find((candidate) => candidate.manifest.id === id);
  if (!plugin?.entry) throw new Error(`Daemon foundation plugin not found: ${id}`);

  const record = await installPlugin(plugin);
  loaded.push(record);
  sortPlugins(loaded);
  if (record.error) throw record.error;
  const capability = id === "i18n" ? "i18n" : id === "storage" ? "storage" : "settings";
  if (!record.fork || !ctx.get(capability)) {
    throw new Error(`Daemon foundation plugin failed to initialize: ${id}`);
  }
  return record;
}

export function getLoadedDaemonPlugins(): readonly DaemonPluginEntry[] {
  return loaded;
}

/** One installed plugin, as the panel's plugin manager lists it. */
export interface DaemonPluginRecord {
  state: PluginState;
  result?: PluginChangeResult;
  id: string;
  name?: string;
  version?: string;
  description?: string;
  priority?: number;
  /** Effective enablement after applying the user override. */
  enabled: boolean;
  /** Whether the manifest names an entry module at all. */
  hasEntry: boolean;
  /** Whether the plugin is running in this process right now. */
  running: boolean;
  /** Why it is not running, when it should be. */
  error?: string;
}

/**
 * Every installed plugin, disabled ones included — a disabled plugin still has
 * to be listed for the switch to turn it back on. Entry resolution is skipped on
 * purpose: the inventory describes what is installed, not what compiled.
 */
export function getDaemonPluginInventory(): DaemonPluginRecord[] {
  return discoverDaemonPlugins({
    entryFields: [],
    includeDisabled: true,
    onWarning: (message, error) => logger.warn(message, error)
  }).map((plugin) => {
    const running = loaded.find((item) => item.manifest.id === plugin.manifest.id);
    return {
      id: plugin.manifest.id,
      name: typeof plugin.manifest.name === "string" ? plugin.manifest.name : undefined,
      version: plugin.manifest.version,
      description: plugin.manifest.description,
      priority: plugin.manifest.priority,
      enabled: plugin.manifest.enabled !== false,
      hasEntry: ENTRY_FIELDS.some((field) => typeof plugin.manifest[field] === "string"),
      running: pluginState(plugin, running) === "active",
      state: pluginState(plugin, running),
      error:
        running?.error?.message ||
        running?.fork?.runtime.error?.message ||
        running?.fork?.error?.message
    };
  });
}

/** Persist the user override, then serialize disposal/activation and report both outcomes. */
export function setDaemonPluginEnabled(id: string, enabled: boolean): Promise<DaemonPluginRecord> {
  return change(async () => {
    if (typeof enabled !== "boolean") throw new Error("Invalid plugin enablement.");
    if (FOUNDATION_PLUGIN_IDS.has(id) && !enabled)
      throw new Error(`The essential plugin "${id}" cannot be disabled.`);
    const plugin = findPlugin(id);
    writePluginOverride(id, { enabled });
    let failure: string | undefined;
    try {
      const existing = loaded.find((item) => item.manifest.id === id);
      if (!enabled || existing?.error || existing?.fork?.runtime.status === 3)
        await removeRunning(id);
      if (enabled && !loaded.some((item) => item.manifest.id === id)) {
        forgetCachedModule(plugin.entry);
        loaded.push(
          await installPlugin({ ...plugin, manifest: { ...plugin.manifest, enabled: true } })
        );
        sortPlugins(loaded);
      }
      await settle();
    } catch (error) {
      failure = String(error);
    }
    return changedRecord(id, failure);
  });
}

function findPlugin(id: string) {
  const plugin = discoverDaemonPlugins({
    entryFields: ENTRY_FIELDS,
    entryCandidates: ENTRY_CANDIDATES,
    includeDisabled: true
  }).find((item) => item.manifest.id === id);
  if (!plugin) throw new Error(`Plugin not found: ${id}`);
  return plugin;
}

async function removeRunning(id: string) {
  const index = loaded.findIndex((item) => item.manifest.id === id);
  if (index < 0) return;
  const record = loaded[index];
  unloading.add(id);
  try {
    record.fork?.dispose();
    await settle();
  } finally {
    loaded.splice(loaded.indexOf(record), 1);
    unloading.delete(id);
  }
}

function pluginState(plugin: DiscoveredPlugin, running?: DaemonPluginEntry): PluginState {
  if (unloading.has(plugin.manifest.id)) return "unloading";
  if (plugin.manifest.enabled === false) return "disabled";
  if (running?.error || running?.fork?.error || running?.fork?.runtime.error) return "failed";
  if (!running || running.restartRequired) return "restart-required";
  if (!running.entry) return "active";
  if (
    running.backendRevision !== pluginDirectoryRevision(path.dirname(running.entry)) ||
    JSON.stringify(running.manifest.config) !== JSON.stringify(plugin.manifest.config)
  )
    return "restart-required";
  const fork = running.fork;
  if (!fork) return "failed";
  const state = fork.runtime.status === 2 ? fork.status : fork.runtime.status;
  return (
    (["pending", "loading", "active", "failed", "failed"] as PluginState[])[state] || "pending"
  );
}

function changedRecord(id: string, failure?: string): DaemonPluginRecord {
  const record = getDaemonPluginInventory().find((item) => item.id === id)!;
  const application =
    failure || record.state === "failed"
      ? "failed"
      : record.state === "restart-required"
      ? "restart-required"
      : ["pending", "loading", "unloading"].includes(record.state)
      ? "pending"
      : "applied";
  return { ...record, result: { saved: true, application, error: failure || record.error } };
}

/** Config replaces the package default as one user-owned layer. Validate before saving. */
export function configureDaemonPlugin(
  id: string,
  config: Record<string, unknown>
): Promise<DaemonPluginRecord> {
  return change(async () => {
    const plugin = findPlugin(id);
    if (!config || typeof config !== "object" || Array.isArray(config))
      throw new Error("Plugin config must be an object.");
    validatePluginCompatibility(plugin.manifest.elements);
    const running = loaded.find((item) => item.manifest.id === id);
    const replaced =
      plugin.entry &&
      codeRevisions.has(id) &&
      codeRevisions.get(id) !== pluginDirectoryRevision(path.dirname(plugin.entry));
    if (!replaced && typeof running?.fork?.runtime.schema === "function")
      running.fork.runtime.schema(config);
    if (Array.isArray(plugin.manifest.configFields))
      validatePluginSettings(plugin.manifest.configFields, config);
    writePluginOverride(id, { config });
    // Core network/storage configuration is applied on restart; never tear down the reply path.
    if (replaced || FOUNDATION_PLUGIN_IDS.has(id) || ["server", "config", "monitor"].includes(id)) {
      return {
        ...getDaemonPluginInventory().find((item) => item.id === id)!,
        result: { saved: true, application: "restart-required" }
      };
    }
    let failure: string | undefined;
    try {
      await removeRunning(id);
      if (plugin.manifest.enabled !== false) {
        loaded.push(await installPlugin({ ...plugin, manifest: { ...plugin.manifest, config } }));
        sortPlugins(loaded);
        await settle();
      }
    } catch (error) {
      failure = String(error);
    }
    return changedRecord(id, failure);
  });
}
