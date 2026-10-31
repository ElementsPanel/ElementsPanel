import { Logger, type ForkScope } from "cordis";
import {
  packagePluginRoots,
  installNpmPlugin,
  uninstallNpmPlugin,
  isEssentialNpmPlugin,
  forgetPluginModules,
  loadPluginModule,
  pluginBackendRevision,
  resolvePluginEntry,
  watchNpmPlugins,
  applyPluginOverrides,
  writePluginOverride,
  readPluginOverrides,
  validatePluginCompatibility,
  validatePluginSettings,
  createPluginQueue,
  trackPluginDisposal,
  type PluginState,
  type PluginChangeResult,
  discoverPluginsFromRoots,
  sortPlugins,
  type DiscoverPluginsOptions,
  type DiscoveredPlugin,
  type PluginManifest
} from "mcsmanager-common";
import path from "path";
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
let watching = false;
const reloadGates = new Set<Promise<void>>();

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
const RESTART_CONFIG_PLUGIN_IDS = new Set([...FOUNDATION_PLUGIN_IDS, "server", "config"]);

/** A daemon plugin module, as its backend entry exports it. */
export interface DaemonPluginModule {
  /** Services the plugin cannot work without. cordis waits for them to appear. */
  inject?: string[] | Record<string, { required: boolean }>;
  apply(ctx: DaemonPluginContext, config?: unknown): void | Promise<void>;
}

export interface DaemonPluginEntry {
  packageRoot?: string;
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
  // Only npm packages are plugins now: the published runtime resolves its own
  // dependencies, and a development checkout resolves the source packages that
  // the side package ships. Legacy data/plugins and market_plugins directories
  // are deliberately not read any more.
  return applyPluginOverrides(
    discoverPluginsFromRoots(packagePluginRoots("daemon"), {
      ...options,
      includeDisabled: true
    })
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
    install: installDaemonNpmPlugin,
    remove: removeDaemonPlugin,
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

function forgetCachedModule(entry?: string, directory?: string) {
  if (directory || entry) forgetPluginModules(directory || path.dirname(entry!));
}

/** Requires one plugin's entry module and hands it to cordis. */
async function installPlugin(plugin: DiscoveredPlugin): Promise<DaemonPluginEntry> {
  const record: DaemonPluginEntry = { ...plugin, backendRevision: "" };
  if (!plugin.entry) {
    logger.warn(`Daemon plugin "${plugin.manifest.id}" has no entry module.`);
    return record;
  }
  try {
    record.backendRevision = backendRevision(plugin);
    validatePluginCompatibility(plugin.manifest.elements);
    codeRevisions.set(plugin.manifest.id, record.backendRevision!);
    const module = toModule(
      await loadPluginModule(
        plugin.entry,
        plugin.packageRoot || plugin.directory,
        record.backendRevision!
      ),
      plugin.manifest.id
    );
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
    // appears in its log lines — always matches the package metadata.
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
  if (!watching) {
    watching = true;
    watchNpmPlugins(ctx, "daemon", reloadDaemonPlugins);
  }
  return loaded;
}

/** Reconcile npm installation changes after all effects from the previous revision are disposed. */
export function reloadDaemonPlugins(): Promise<readonly DaemonPluginEntry[]> {
  return change(reconcilePlugins);
}

function backendEntry(plugin: DiscoveredPlugin) {
  return resolvePluginEntry(plugin.directory, plugin.manifest, {
    entryFields: ENTRY_FIELDS,
    entryCandidates: ENTRY_CANDIDATES
  });
}

function backendRevision(plugin: DiscoveredPlugin) {
  const entry = backendEntry(plugin);
  return entry ? pluginBackendRevision(entry, plugin.packageRoot || plugin.directory) : "";
}

async function reconcilePlugins() {
  // Even an explicit reload queued during npm installation must wait for its
  // response, just like the reload scheduled by the installation itself.
  await Promise.all(reloadGates);
  ensureDaemonPluginService();
  const discovered = discoverDaemonPlugins({
    entryFields: ENTRY_FIELDS,
    entryCandidates: ENTRY_CANDIDATES,
    onWarning: (message, error) => logger.warn(message, error)
  });
  const next = new Map(discovered.map((plugin) => [plugin.manifest.id, plugin]));
  const codeChanged = (running: (typeof loaded)[number], plugin: DiscoveredPlugin) =>
    running.entry !== backendEntry(plugin) ||
    running.manifest.version !== plugin.manifest.version ||
    running.backendRevision !== backendRevision(plugin);
  // Foundation services own state used throughout the graph. Dispose consumers
  // before providers, then recreate every module before publishing new services.
  // This also prevents Cordis from restarting consumers during async cleanup.
  const reloadAll = loaded.some((running) => {
    const plugin = next.get(running.manifest.id);
    return plugin && isEssentialNpmPlugin(running.manifest.id) && codeChanged(running, plugin);
  });
  if (reloadAll) {
    for (const running of loaded) {
      if (isEssentialNpmPlugin(running.manifest.id) && !next.has(running.manifest.id))
        throw new Error(`Missing essential plugin during reload: ${running.manifest.id}`);
    }
    for (const plugin of discovered) {
      if (!isEssentialNpmPlugin(plugin.manifest.id)) continue;
      validatePluginCompatibility(plugin.manifest.elements);
      if (!plugin.entry) throw new Error(`Missing essential plugin entry: ${plugin.manifest.id}`);
    }
  }
  // Publish listeners only after every route and authentication plugin is back.
  const started = reloadAll && ctx.lifecycle.isActive;
  if (reloadAll) ctx.lifecycle.isActive = false;
  try {
    if (reloadAll) await ctx.parallel("plugins/reloading");
    const removed: (typeof loaded)[number][] = [];
    for (const running of [...loaded].reverse()) {
      const plugin = next.get(running.manifest.id);
      const changed =
        plugin &&
        (codeChanged(running, plugin) ||
          JSON.stringify(running.manifest.config) !== JSON.stringify(plugin.manifest.config));
      if (
        reloadAll ||
        ((!plugin || changed) && !RESTART_CONFIG_PLUGIN_IDS.has(running.manifest.id))
      ) {
        await removeRunning(running.manifest.id);
        removed.push(running);
      }
    }
    for (const running of removed)
      forgetCachedModule(running.entry, running.packageRoot || running.directory);
    // Evict the whole batch before importing anything: dependencies may be shared
    // by several plugins, including the i18next instance used by the foundations.
    const pending = discovered.filter(
      (plugin) => !loaded.some((record) => record.manifest.id === plugin.manifest.id)
    );
    for (const plugin of pending)
      forgetCachedModule(plugin.entry, plugin.packageRoot || plugin.directory);
    for (const plugin of pending) {
      loaded.push(await installPlugin(plugin));
      await settle();
    }
    sortPlugins(loaded);
    await settle();
    if (reloadAll) await ctx.parallel("plugins/reloaded");
    return loaded;
  } finally {
    if (started) await ctx.start();
  }
}

/** Install or update an npm dependency, retaining the user's enablement on upgrades. */
export function installDaemonNpmPlugin(options: {
  name: string;
  version?: string;
  pluginId?: string;
  reloadAfter?: Promise<void>;
}) {
  return change(async () => {
    const before = new Map(getDaemonPluginInventory().map((plugin) => [plugin.id, plugin]));
    const record = await installNpmPlugin({ ...options, side: "daemon" });
    const previous = before.get(record.pluginId);
    const preference = readPluginOverrides().plugins[record.pluginId]?.enabled;
    // A dual package can already be visible here after the other side installed
    // it. Explicitly installing this side enables it unless the user disabled it.
    if (!previous || (!previous.enabled && preference === undefined))
      writePluginOverride(record.pluginId, { enabled: true });
    if (options.reloadAfter && isEssentialNpmPlugin(record.pluginId)) {
      const gate = options.reloadAfter;
      reloadGates.add(gate);
      // Reserve the next queue slot now so the npm watcher cannot tear down
      // the transport before the install response leaves the daemon.
      void change(async () => {
        await gate;
        await reconcilePlugins();
      }).catch((error) => logger.error("Failed to reload installed npm plugins", error));
      void gate.finally(() => reloadGates.delete(gate)).catch(() => {});
      return {
        ...changedRecord(record.pluginId),
        result: { saved: true, application: "pending" as const }
      };
    }
    await reconcilePlugins();
    return changedRecord(record.pluginId);
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
  packageName?: string;
  name?: string;
  version?: string;
  description?: string;
  priority?: number;
  /** Effective enablement after applying the user override. */
  enabled: boolean;
  /** Declares a two-sided plugin whose other half must exist on the panel. */
  dual: boolean;
  /** Whether the manifest names an entry module at all. */
  hasEntry: boolean;
  /** Whether the plugin is running in this process right now. */
  running: boolean;
  /** Why it is not running, when it should be. */
  error?: string;
  /** Whether the daemon may remove this plugin package in the current environment. */
  removable: boolean;
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
      packageName: plugin.packageName,
      name: typeof plugin.manifest.name === "string" ? plugin.manifest.name : undefined,
      version: plugin.manifest.version,
      description: plugin.manifest.description,
      priority: plugin.manifest.priority,
      enabled: plugin.manifest.enabled !== false,
      dual: plugin.manifest.dual === true,
      hasEntry: ENTRY_FIELDS.some((field) => typeof plugin.manifest[field] === "string"),
      running: pluginState(plugin, running) === "active",
      state: pluginState(plugin, running),
      error:
        running?.error?.message ||
        running?.fork?.runtime.error?.message ||
        running?.fork?.error?.message,
      removable: !!plugin.packageRoot && !isEssentialNpmPlugin(plugin.manifest.id)
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
        forgetCachedModule(plugin.entry, plugin.packageRoot || plugin.directory);
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

/** Dispose the running scope before npm removes the dependency that owns its files. */
export function removeDaemonPlugin(id: string): Promise<void> {
  return change(async () => {
    const plugin = findPlugin(id);
    if (!plugin.packageRoot) throw new Error("Source plugins cannot be removed.");
    if (isEssentialNpmPlugin(id))
      throw new Error(`The essential plugin "${id}" cannot be uninstalled.`);
    await removeRunning(id);
    forgetCachedModule(plugin.entry, plugin.packageRoot);
    try {
      await uninstallNpmPlugin(id);
    } catch (error) {
      await reconcilePlugins();
      throw error;
    }
    codeRevisions.delete(id);
    await reconcilePlugins();
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
    running.entry !== backendEntry(plugin) ||
    running.manifest.version !== plugin.manifest.version ||
    running.backendRevision !== backendRevision(plugin) ||
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
      plugin.entry && codeRevisions.has(id) && codeRevisions.get(id) !== backendRevision(plugin);
    if (!replaced && typeof running?.fork?.runtime.schema === "function")
      running.fork.runtime.schema(config);
    if (Array.isArray(plugin.manifest.configFields))
      validatePluginSettings(plugin.manifest.configFields, config);
    writePluginOverride(id, { config });
    // Core network/storage configuration is applied on restart; never tear down the reply path.
    if (RESTART_CONFIG_PLUGIN_IDS.has(id)) {
      return {
        ...getDaemonPluginInventory().find((item) => item.id === id)!,
        result: { saved: true, application: "restart-required" }
      };
    }
    let failure: string | undefined;
    try {
      await removeRunning(id);
      forgetCachedModule(plugin.entry, plugin.packageRoot || plugin.directory);
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
