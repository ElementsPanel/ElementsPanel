import type { ForkScope } from "cordis";
import fs from "fs-extra";
import {
  discoverPlugins,
  sortPlugins,
  type DiscoveredPlugin,
  type PluginManifest
} from "mcsmanager-common";
import path from "path";
import { pathToFileURL } from "url";
import logger from "../service/log";
import { ctx, type DaemonPluginContext } from "./context";

/**
 * Turns the plugin directories into cordis plugins.
 *
 * Discovery is shared with the panel (`mcsmanager-common`); everything past it is
 * cordis: each plugin module is handed to `ctx.plugin()`, which resolves its
 * `inject` list, calls `apply()` with a scope of its own, and undoes every effect
 * that scope registered when it is disposed. A plugin that throws is isolated by
 * cordis and reported through `ctx.logger`, so the daemon keeps running.
 */

const PLUGINS_DIRECTORY = () => path.resolve(process.cwd(), "plugins");
const ENTRY_FIELDS = ["daemon", "backend", "main", "entry"];
const ENTRY_CANDIDATES = [
  "src/index.js",
  "src/index.cjs",
  "src/index.mjs",
  "src/daemon.js",
  "src/daemon.cjs",
  "src/daemon.mjs"
];
const FOUNDATION_PLUGIN_ID = "i18n";

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
  fork?: ForkScope;
  error?: Error;
}

const loaded: DaemonPluginEntry[] = [];

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
    return runtimeRequire(entry);
  } catch (error: any) {
    if (error?.code !== "ERR_REQUIRE_ESM") throw error;
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string
    ) => Promise<unknown>;
    return dynamicImport(pathToFileURL(entry).href);
  }
}

/** Requires one plugin's entry module and hands it to cordis. */
async function installPlugin(plugin: DiscoveredPlugin): Promise<DaemonPluginEntry> {
  const record: DaemonPluginEntry = { ...plugin };
  if (!plugin.entry) {
    logger.warn(`Daemon plugin "${plugin.manifest.id}" has no entry module.`);
    return record;
  }
  try {
    const module = toModule(await loadModule(plugin.entry), plugin.manifest.id);
    if (!module) return record;
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
  const discovered = discoverPlugins(PLUGINS_DIRECTORY(), {
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

/** Loads the service required before the daemon reads its language setting. */
export async function loadDaemonFoundationPlugin(id = FOUNDATION_PLUGIN_ID) {
  if (id !== FOUNDATION_PLUGIN_ID) {
    throw new Error(`Daemon plugin "${id}" is not a foundational plugin.`);
  }

  const existing = loaded.find((record) => record.manifest.id === id);
  if (existing) return existing;

  const plugin = discoverPlugins(PLUGINS_DIRECTORY(), {
    entryFields: ENTRY_FIELDS,
    entryCandidates: ENTRY_CANDIDATES,
    onWarning: (message, error) => logger.warn(message, error)
  }).find((candidate) => candidate.manifest.id === id);
  if (!plugin?.entry) throw new Error(`Daemon foundation plugin not found: ${id}`);

  const record = await installPlugin(plugin);
  loaded.push(record);
  sortPlugins(loaded);
  if (record.error) throw record.error;
  if (!record.fork || !ctx.get("i18n")) {
    throw new Error(`Daemon foundation plugin failed to initialize: ${id}`);
  }
  return record;
}

export function getLoadedDaemonPlugins(): readonly DaemonPluginEntry[] {
  return loaded;
}

/** One installed plugin, as the panel's plugin manager lists it. */
export interface DaemonPluginRecord {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  priority?: number;
  /** False only when `plugin.json` says so; that is the persisted switch. */
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
  return discoverPlugins(PLUGINS_DIRECTORY(), {
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
      running: Boolean(running?.fork),
      error: running?.error?.message
    };
  });
}

/**
 * Turns a plugin on or off: persists the switch in its `plugin.json` and applies
 * it to the running daemon.
 *
 * The manifest is the source of truth, because that is what the loader reads.
 * Disabling disposes the plugin's scope, which takes its protocol handlers,
 * tasks, timers and services with it; enabling requires the entry module afresh,
 * so a plugin that keeps module-level state starts from a clean one.
 */
export async function setDaemonPluginEnabled(
  id: string,
  enabled: boolean
): Promise<DaemonPluginRecord> {
  if (id === FOUNDATION_PLUGIN_ID && !enabled) {
    throw new Error('The foundational daemon plugin "i18n" cannot be disabled.');
  }
  const plugin = discoverPlugins(PLUGINS_DIRECTORY(), {
    entryFields: ENTRY_FIELDS,
    entryCandidates: ENTRY_CANDIDATES,
    includeDisabled: true,
    onWarning: (message, error) => logger.warn(message, error)
  }).find((item) => item.manifest.id === id);
  if (!plugin) throw new Error(`Daemon plugin not found: ${id}`);

  await writeEnabled(plugin, enabled);

  const index = loaded.findIndex((item) => item.manifest.id === id);
  if (!enabled) {
    if (index >= 0) {
      loaded[index].fork?.dispose();
      loaded.splice(index, 1);
    }
    logger.info(`Daemon plugin disabled: ${id}`);
  } else if (index < 0) {
    if (plugin.entry) {
      // Drop the cached module so a re-enabled plugin starts from fresh
      // module-level state instead of the copy its previous run left behind.
      const runtimeRequire = eval("require") as NodeRequire;
      delete runtimeRequire.cache[plugin.entry];
    }
    loaded.push(
      await installPlugin({ ...plugin, manifest: { ...plugin.manifest, enabled: true } })
    );
    sortPlugins(loaded);
    logger.info(`Daemon plugin enabled: ${id}`);
  }

  const record = getDaemonPluginInventory().find((item) => item.id === id);
  if (!record) throw new Error(`Daemon plugin not found: ${id}`);
  return record;
}

/**
 * Writes the switch into `plugin.json`. An enabled plugin has the key removed
 * rather than set to `true`, so a manifest only carries the flag while it is
 * actually holding a plugin back.
 */
async function writeEnabled(plugin: DiscoveredPlugin, enabled: boolean) {
  const file = ["plugin.json", "manifest.json", "package.json"]
    .map((name) => path.join(plugin.directory, name))
    .find((candidate) => fs.existsSync(candidate));
  if (!file) throw new Error(`Daemon plugin has no manifest file: ${plugin.manifest.id}`);
  const manifest = await fs.readJson(file);
  if (enabled) delete manifest.enabled;
  else manifest.enabled = false;
  await fs.writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
