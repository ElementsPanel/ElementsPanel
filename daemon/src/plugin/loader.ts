import path from "path";
import { pathToFileURL } from "url";
import { discoverPlugins, type PluginManifest } from "mcsmanager-common";
import type { ForkScope } from "cordis";
import { ctx, type DaemonPluginContext } from "./context";
import logger from "../service/log";

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

/** Discovers, requires and installs every enabled plugin, in manifest order. */
export async function loadDaemonPlugins(): Promise<readonly DaemonPluginEntry[]> {
  loaded.length = 0;
  const discovered = discoverPlugins(PLUGINS_DIRECTORY(), {
    entryFields: ENTRY_FIELDS,
    entryCandidates: ENTRY_CANDIDATES,
    onWarning: (message, error) => logger.warn(message, error)
  });

  for (const plugin of discovered) {
    const record: DaemonPluginEntry = { ...plugin };
    loaded.push(record);
    if (!plugin.entry) {
      logger.warn(`Daemon plugin "${plugin.manifest.id}" has no entry module.`);
      continue;
    }
    try {
      const module = toModule(await loadModule(plugin.entry), plugin.manifest.id);
      if (!module) continue;
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
  }
  return loaded;
}

export function getLoadedDaemonPlugins(): readonly DaemonPluginEntry[] {
  return loaded;
}
