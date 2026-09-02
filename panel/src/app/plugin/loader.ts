import fs from "fs-extra";
import path from "path";
import { pathToFileURL } from "url";
import {
  discoverPlugins,
  sortPlugins,
  type DiscoveredPlugin,
  type PluginManifest
} from "mcsmanager-common";
import type { ForkScope } from "cordis";
import { ctx, type PanelPluginContext } from "./context";
import { logger } from "../service/log";

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

const PLUGINS_DIRECTORY = () => path.resolve(process.cwd(), "plugins");
const ENTRY_FIELDS = ["panel", "backend", "main", "entry"];
const ENTRY_CANDIDATES = [
  "src/index.js",
  "src/index.cjs",
  "src/index.mjs",
  "src/panel.js",
  "src/panel.cjs",
  "src/panel.mjs"
];

/** A panel plugin module, as its backend entry exports it. */
export interface PanelPluginModule {
  /** Services the plugin cannot work without. cordis waits for them to appear. */
  inject?: string[] | Record<string, { required: boolean }>;
  apply(ctx: PanelPluginContext, config?: unknown): void | Promise<void>;
}

export interface LoadedPanelPlugin {
  manifest: PluginManifest;
  directory: string;
  folder: string;
  /** Absent for a plugin that only contributes a frontend. */
  entry?: string;
  fork?: ForkScope;
  error?: Error;
}

/** One entry of `/plugins/manifest.json`, as the browser consumes it. */
export interface PanelFrontendPluginEntry {
  metadata: PluginManifest;
  directory: string;
  assetDirectory: string;
  entry: string;
  styles: string[];
}

const loaded: LoadedPanelPlugin[] = [];

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

/** Requires one plugin's backend entry and hands it to cordis. */
async function installPlugin(plugin: DiscoveredPlugin): Promise<LoadedPanelPlugin> {
  const record: LoadedPanelPlugin = { ...plugin };
  if (!plugin.entry) return record;
  try {
    const module = toModule(await loadModule(plugin.entry), plugin.manifest.id);
    if (!module) return record;
    // Plugins are applied one at a time, in `priority` order, and an async
    // `apply()` is awaited before the next plugin starts.
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
  loaded.length = 0;
  const discovered = discoverPlugins(PLUGINS_DIRECTORY(), {
    entryFields: ENTRY_FIELDS,
    entryCandidates: ENTRY_CANDIDATES,
    onWarning: (message, error) => logger.warn(message, error)
  });
  for (const plugin of discovered) loaded.push(await installPlugin(plugin));
  return loaded;
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
  const root = PLUGINS_DIRECTORY();
  const entries: PanelFrontendPluginEntry[] = [];
  for (const plugin of discoverPlugins(root, {
    entryFields: ["frontend", "ui"],
    onWarning: (message, error) => logger.warn(message, error)
  })) {
    // A packaged plugin serves its frontend from `<plugin>/frontend`, and only
    // from there: the manifest must never point the browser at plugin sources.
    if (!plugin.entry || !/^[a-zA-Z0-9_-]+$/.test(plugin.folder)) continue;
    const frontendDirectory = path.resolve(plugin.directory, "frontend");
    const inFrontendDirectory = (target: string) =>
      target.startsWith(`${frontendDirectory}${path.sep}`) && fs.existsSync(target);
    if (!inFrontendDirectory(plugin.entry)) continue;

    const toUrl = (target: string) =>
      `./${plugin.folder}/${path.relative(plugin.directory, target).split(path.sep).join("/")}`;
    const styles = Array.isArray(plugin.manifest.styles)
      ? plugin.manifest.styles
          .filter((style: unknown): style is string => typeof style === "string")
          .map((style) => path.resolve(plugin.directory, style))
          .filter(inFrontendDirectory)
          .map(toUrl)
      : [];
    entries.push({
      metadata: plugin.manifest,
      directory: plugin.manifest.id,
      assetDirectory: plugin.folder,
      entry: toUrl(plugin.entry),
      styles
    });
  }
  return entries;
}

/** One installed plugin, as the plugin manager page lists it. */
export interface PanelPluginRecord {
  id: string;
  version?: string;
  description?: string;
  priority?: number;
  /** False only when `plugin.json` says so; that is the persisted switch. */
  enabled: boolean;
  /** Which halves the manifest declares. Neither has to have been built yet. */
  sides: { backend: boolean; frontend: boolean };
  /** Whether the backend half is running in this process right now. */
  running: boolean;
  /** Why the backend half is not running, when it should be. */
  error?: string;
}

const FRONTEND_FIELDS = ["frontend", "ui"];

/**
 * Every installed plugin, disabled ones included — a disabled plugin still has
 * to be listed for the switch to turn it back on. Entry resolution is skipped on
 * purpose: the inventory describes what is installed, not what compiled.
 */
export function getPanelPluginInventory(): PanelPluginRecord[] {
  return discoverPlugins(PLUGINS_DIRECTORY(), {
    entryFields: [],
    includeDisabled: true,
    onWarning: (message, error) => logger.warn(message, error)
  }).map((plugin) => {
    const running = loaded.find((item) => item.manifest.id === plugin.manifest.id);
    const has = (fields: string[]) =>
      fields.some((field) => typeof plugin.manifest[field] === "string");
    return {
      id: plugin.manifest.id,
      version: plugin.manifest.version,
      description: plugin.manifest.description,
      priority: plugin.manifest.priority,
      enabled: plugin.manifest.enabled !== false,
      sides: { backend: has(ENTRY_FIELDS), frontend: has(FRONTEND_FIELDS) },
      running: Boolean(running?.fork),
      error: running?.error?.message
    };
  });
}

/**
 * Turns a plugin on or off: persists the switch in its `plugin.json` and applies
 * it to the running panel.
 *
 * The manifest is the source of truth, because that is what the loaders and the
 * frontend manifest endpoint read — so the browser reconciles itself by fetching
 * `/plugins/manifest.json` again. Disabling disposes the backend scope, which
 * takes its routes, middleware, timers and services with it; enabling requires
 * the entry module afresh, so a plugin that keeps module-level state starts from
 * a clean one.
 */
export async function setPanelPluginEnabled(
  id: string,
  enabled: boolean
): Promise<PanelPluginRecord> {
  const plugin = discoverPlugins(PLUGINS_DIRECTORY(), {
    entryFields: ENTRY_FIELDS,
    entryCandidates: ENTRY_CANDIDATES,
    includeDisabled: true,
    onWarning: (message, error) => logger.warn(message, error)
  }).find((item) => item.manifest.id === id);
  if (!plugin) throw new Error(`Panel plugin not found: ${id}`);

  await writeEnabled(plugin, enabled);

  const index = loaded.findIndex((item) => item.manifest.id === id);
  if (!enabled) {
    if (index >= 0) {
      loaded[index].fork?.dispose();
      loaded.splice(index, 1);
    }
    logger.info(`Panel plugin disabled: ${id}`);
  } else if (index < 0) {
    if (plugin.entry) {
      // Drop the cached module so a re-enabled plugin starts from fresh
      // module-level state instead of the copy its previous run left behind.
      const runtimeRequire = eval("require") as NodeRequire;
      delete runtimeRequire.cache[plugin.entry];
    }
    loaded.push(await installPlugin({ ...plugin, manifest: { ...plugin.manifest, enabled: true } }));
    sortPlugins(loaded);
    logger.info(`Panel plugin enabled: ${id}`);
  }

  const record = getPanelPluginInventory().find((item) => item.id === id);
  if (!record) throw new Error(`Panel plugin not found: ${id}`);
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
  if (!file) throw new Error(`Panel plugin has no manifest file: ${plugin.manifest.id}`);
  const manifest = await fs.readJson(file);
  if (enabled) delete manifest.enabled;
  else manifest.enabled = false;
  await fs.writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
