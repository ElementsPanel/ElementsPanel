import fs from "fs-extra";
import path from "path";
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
  pluginDirectoryRevision,
  createFrontendPluginMetadata,
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
import { Logger, type ForkScope } from "cordis";
import { ctx, type PanelPluginContext, type PanelSettingsSchema } from "./context";

/**
 * Turns the plugin directories into cordis plugins.
 *
 * Discovery is shared with the daemon and the frontend build
 * (`mcsmanager-common`); everything past it is cordis: each plugin module is
 * handed to `ctx.plugin()`, which resolves its `inject` list, calls `apply()`
 * with a scope of its own, and undoes every effect that scope registered when it
 * is disposed. A plugin that throws is isolated by cordis and reported through
 * `ctx.logger`, so the panel keeps running.
 */

const logger = new Logger("plugin");
const change = createPluginQueue();
const settle = trackPluginDisposal(ctx);
const unloading = new Set<string>();
const codeRevisions = new Map<string, string>();
let watching = false;

const ENTRY_FIELDS = ["panel", "backend", "main", "entry"];
const ENTRY_CANDIDATES = [
  "src/index.js",
  "src/index.cjs",
  "src/index.mjs",
  "src/panel.js",
  "src/panel.cjs",
  "src/panel.mjs"
];
const FOUNDATION_PLUGIN_IDS = new Set(["i18n", "storage", "runtime"]);
const ESSENTIAL_PLUGIN_IDS = new Set(["i18n", "storage", "runtime", "console"]);
const RESTART_CONFIG_PLUGIN_IDS = new Set([...ESSENTIAL_PLUGIN_IDS, "server", "config"]);

/** A panel plugin module, as its backend entry exports it. */
export interface PanelPluginModule {
  /** Services the plugin cannot work without. cordis waits for them to appear. */
  inject?: string[] | Record<string, { required: boolean }>;
  apply(ctx: PanelPluginContext, config?: unknown): void | Promise<void>;
}

export interface LoadedPanelPlugin {
  packageRoot?: string;
  manifest: PluginManifest;
  directory: string;
  folder: string;
  /** Absent for a plugin that only contributes a frontend. */
  entry?: string;
  backendRevision?: string;
  restartRequired?: boolean;
  fork?: ForkScope;
  error?: Error;
}

/** One entry of `/plugins/manifest.json`, as the browser consumes it. */
export interface PanelFrontendPluginEntry {
  metadata: ReturnType<typeof createFrontendPluginMetadata>;
  directory: string;
  assetDirectory: string;
  entry: string;
  styles: string[];
  revision: string;
  /** Filesystem location; stripped from HTTP responses. */
  frontendDirectory: string;
}

const loaded: LoadedPanelPlugin[] = [];
const frontendManifestWarnings = new Set<string>();

function warnFrontendManifest(message: string, error?: unknown) {
  const detail = error instanceof Error ? `${error.name}:${error.message}` : String(error || "");
  const signature = `${message}\0${detail}`;
  if (frontendManifestWarnings.has(signature)) return;
  frontendManifestWarnings.add(signature);
  if (error === undefined) logger.warn(message);
  else logger.warn(message, error);
}

function discoverPanelPlugins(options: DiscoverPluginsOptions) {
  // Only npm packages are plugins now: the published runtime resolves its own
  // dependencies, and a development checkout resolves the source packages that
  // the side package ships. Legacy data/plugins and market_plugins directories
  // are deliberately not read any more.
  return applyPluginOverrides(
    discoverPluginsFromRoots(packagePluginRoots("panel"), {
      ...options,
      includeDisabled: true
    })
  ).filter((plugin) => options.includeDisabled || plugin.manifest.enabled !== false);
}

/** Exposes the loader's own registry without pulling it into a plugin bundle. */
function ensurePanelPluginService() {
  if (ctx.get("plugins")) return;
  ctx.provide("plugins", undefined, true);
  ctx.set("plugins", {
    get loaded() {
      return getLoadedPanelPlugins();
    },
    frontendManifest: getPanelFrontendManifest,
    inventory: getPanelPluginInventory,
    setEnabled: setPanelPluginEnabled,
    install: installPanelNpmPlugin,
    remove: removePanelPlugin,
    configure: configurePanelPlugin,
    configuration: (id: string): PanelSettingsSchema => {
      const manifest = findPlugin(id).manifest;
      return {
        id,
        fields: (Array.isArray(manifest.configFields)
          ? manifest.configFields
          : []) as PanelSettingsSchema["fields"],
        values: (manifest.config || {}) as Record<string, unknown>
      };
    },
    runExclusive: change,
    reload: reloadPanelPlugins
  });
}

/**
 * The plugin object a module exports, whether as named exports or as `default`.
 *
 * Only an object counts: every function has `Function.prototype.apply`, so a
 * module whose default export is a function would otherwise be mistaken for a
 * plugin and then called with the context as `this`.
 */
function toModule(value: any, id: string): PanelPluginModule | undefined {
  for (const candidate of [value, value?.default]) {
    if (typeof candidate !== "object" || candidate === null) continue;
    if (typeof candidate.apply === "function") return candidate;
  }
  logger.warn(`Panel plugin "${id}" must export an apply() function.`);
  return undefined;
}

function forgetCachedModule(entry?: string, directory?: string) {
  if (directory || entry) forgetPluginModules(directory || path.dirname(entry!));
}

/** Requires one plugin's backend entry and hands it to cordis. */
async function installPlugin(plugin: DiscoveredPlugin): Promise<LoadedPanelPlugin> {
  const record: LoadedPanelPlugin = { ...plugin, backendRevision: "" };
  if (!plugin.entry) return record;
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
    // Plugins are applied one at a time, in `priority` order, and an async
    // `apply()` is awaited before the next plugin starts.
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
    logger.info(`Panel plugin loaded: ${plugin.manifest.id}`);
  } catch (error: any) {
    // Failure is atomic: whatever the plugin managed to register before it threw
    // goes with its scope, so a half-loaded plugin never stays behind — a plugin
    // that had already claimed the request guard, in particular.
    record.error = error instanceof Error ? error : new Error(String(error));
    record.fork?.dispose();
    record.fork = undefined;
    logger.error(`Panel plugin failed to load: ${plugin.manifest.id}`, error);
  }
  return record;
}

/** Discovers, requires and installs every enabled plugin, in manifest order. */
export async function loadPanelPlugins(): Promise<readonly LoadedPanelPlugin[]> {
  ensurePanelPluginService();
  const discovered = discoverPanelPlugins({
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
    watchNpmPlugins(ctx, "panel", reloadPanelPlugins);
  }
  return loaded;
}

/** Reconcile npm installation changes after all effects from the previous revision are disposed. */
export function reloadPanelPlugins(): Promise<readonly LoadedPanelPlugin[]> {
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
  ensurePanelPluginService();
  const discovered = discoverPanelPlugins({
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
    return loaded;
  } finally {
    if (started) await ctx.start();
  }
}

/** Install or update an npm dependency, retaining the user's enablement on upgrades. */
export function installPanelNpmPlugin(options: {
  name: string;
  version?: string;
  pluginId?: string;
}) {
  return change(async () => {
    const before = new Map(getPanelPluginInventory().map((plugin) => [plugin.id, plugin]));
    const record = await installNpmPlugin({ ...options, side: "panel" });
    const previous = before.get(record.pluginId);
    const preference = readPluginOverrides().plugins[record.pluginId]?.enabled;
    // A dual package can already be visible here after the other side installed
    // it. Explicitly installing this side enables it unless the user disabled it.
    if (!previous || (!previous.enabled && preference === undefined))
      writePluginOverride(record.pluginId, { enabled: true });
    await reconcilePlugins();
    return changedRecord(record.pluginId);
  });
}

/** Loads one of the small foundation plugins before feature plugins start. */
export async function loadPanelFoundationPlugin(id = "i18n") {
  ensurePanelPluginService();
  if (!FOUNDATION_PLUGIN_IDS.has(id)) {
    throw new Error(`Panel plugin "${id}" is not a foundational plugin.`);
  }

  const existing = loaded.find((record) => record.manifest.id === id);
  if (existing) return existing;

  const plugin = discoverPanelPlugins({
    entryFields: ENTRY_FIELDS,
    entryCandidates: ENTRY_CANDIDATES,
    onWarning: (message, error) => logger.warn(message, error)
  }).find((candidate) => candidate.manifest.id === id);
  if (!plugin?.entry) throw new Error(`Panel foundation plugin not found: ${id}`);

  const record = await installPlugin(plugin);
  loaded.push(record);
  sortPlugins(loaded);
  if (record.error) throw record.error;
  const capability = id === "i18n" ? "i18n" : id === "storage" ? "storage" : "settings";
  if (!record.fork || !ctx.get(capability)) {
    throw new Error(`Panel foundation plugin failed to initialize: ${id}`);
  }
  return record;
}

export function getLoadedPanelPlugins(): readonly LoadedPanelPlugin[] {
  return loaded;
}

/**
 * The frontend entries the browser can load. Read from the installed plugin
 * directories rather than from what this process loaded, because a plugin may
 * ship only a frontend.
 */
export function getPanelFrontendManifest(): PanelFrontendPluginEntry[] {
  const entries: PanelFrontendPluginEntry[] = [];
  for (const plugin of discoverPanelPlugins({
    entryFields: ["frontend", "ui"],
    onWarning: warnFrontendManifest
  })) {
    // A packaged plugin serves its frontend from `<plugin>/frontend`, and only
    // from there: the manifest must never point the browser at plugin sources.
    if (!plugin.entry || !/^[a-zA-Z0-9_-]+$/.test(plugin.folder)) continue;
    const frontendDirectory = path.resolve(plugin.directory, "frontend");
    const inFrontendDirectory = (target: string) =>
      target.startsWith(`${frontendDirectory}${path.sep}`) && fs.existsSync(target);
    if (!inFrontendDirectory(plugin.entry)) continue;

    const revision = pluginDirectoryRevision(frontendDirectory);
    const toUrl = (target: string) =>
      `./${plugin.folder}@${revision}/${path
        .relative(plugin.directory, target)
        .split(path.sep)
        .join("/")}`;
    const styles = Array.isArray(plugin.manifest.styles)
      ? plugin.manifest.styles
          .filter((style: unknown): style is string => typeof style === "string")
          .map((style) => path.resolve(plugin.directory, style))
          .filter(inFrontendDirectory)
          .map(toUrl)
      : [];
    entries.push({
      // Backend configuration may contain credentials. Browser config is explicit.
      metadata: createFrontendPluginMetadata(plugin.manifest, {
        restartRequired:
          pluginState(
            plugin,
            loaded.find((item) => item.manifest.id === plugin.manifest.id)
          ) === "restart-required"
      }),
      directory: plugin.manifest.id,
      assetDirectory: plugin.folder,
      entry: toUrl(plugin.entry),
      revision,
      frontendDirectory,
      styles
    });
  }
  return entries;
}

/** One installed plugin, as the plugin manager page lists it. */
export interface PanelPluginRecord {
  state: PluginState;
  result?: PluginChangeResult;
  id: string;
  packageName?: string;
  version?: string;
  description?: string;
  priority?: number;
  /** Effective enablement after applying the user override. */
  enabled: boolean;
  /** Declares a two-sided plugin whose other half must exist on the daemon. */
  dual: boolean;
  /** Which halves the manifest declares. Neither has to have been built yet. */
  sides: { backend: boolean; frontend: boolean };
  /** Whether the backend half is running in this process right now. */
  running: boolean;
  /** Why the backend half is not running, when it should be. */
  error?: string;
  /** Whether this npm dependency can be uninstalled from the running host. */
  removable: boolean;
}

const FRONTEND_FIELDS = ["frontend", "ui"];

/**
 * Every installed plugin, disabled ones included — a disabled plugin still has
 * to be listed for the switch to turn it back on. Entry resolution is skipped on
 * purpose: the inventory describes what is installed, not what compiled.
 */
export function getPanelPluginInventory(): PanelPluginRecord[] {
  return discoverPanelPlugins({
    entryFields: [],
    includeDisabled: true,
    onWarning: (message, error) => logger.warn(message, error)
  }).map((plugin) => {
    const running = loaded.find((item) => item.manifest.id === plugin.manifest.id);
    const has = (fields: string[]) =>
      fields.some((field) => typeof plugin.manifest[field] === "string");
    return {
      id: plugin.manifest.id,
      packageName: plugin.packageName,
      version: plugin.manifest.version,
      description: plugin.manifest.description,
      priority: plugin.manifest.priority,
      enabled: plugin.manifest.enabled !== false,
      dual: plugin.manifest.dual === true,
      sides: { backend: has(ENTRY_FIELDS), frontend: has(FRONTEND_FIELDS) },
      running: pluginState(plugin, running) === "active",
      state: pluginState(plugin, running),
      removable: !!plugin.packageRoot && !isEssentialNpmPlugin(plugin.manifest.id),
      error:
        running?.error?.message ||
        running?.fork?.runtime.error?.message ||
        running?.fork?.error?.message
    };
  });
}

/** Persist the user override, then serialize disposal/activation and report both outcomes. */
export function setPanelPluginEnabled(id: string, enabled: boolean): Promise<PanelPluginRecord> {
  return change(async () => {
    if (typeof enabled !== "boolean") throw new Error("Invalid plugin enablement.");
    if (ESSENTIAL_PLUGIN_IDS.has(id) && !enabled)
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
export function removePanelPlugin(id: string): Promise<void> {
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
  const plugin = discoverPanelPlugins({
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

function pluginState(plugin: DiscoveredPlugin, running?: LoadedPanelPlugin): PluginState {
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

function changedRecord(id: string, failure?: string): PanelPluginRecord {
  const record = getPanelPluginInventory().find((item) => item.id === id)!;
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
export function configurePanelPlugin(
  id: string,
  config: Record<string, unknown>
): Promise<PanelPluginRecord> {
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
        ...getPanelPluginInventory().find((item) => item.id === id)!,
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
