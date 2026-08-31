import fs from "fs-extra";
import path from "path";
import { pathToFileURL } from "url";
import { discoverPlugins, type PluginManifest } from "mcsmanager-common";
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

/** Discovers, requires and installs every enabled plugin, in manifest order. */
export async function loadPanelPlugins(): Promise<readonly LoadedPanelPlugin[]> {
  loaded.length = 0;
  const discovered = discoverPlugins(PLUGINS_DIRECTORY(), {
    entryFields: ENTRY_FIELDS,
    entryCandidates: ENTRY_CANDIDATES,
    onWarning: (message, error) => logger.warn(message, error)
  });

  for (const plugin of discovered) {
    const record: LoadedPanelPlugin = { ...plugin };
    loaded.push(record);
    if (!plugin.entry) continue;
    try {
      const module = toModule(await loadModule(plugin.entry), plugin.manifest.id);
      if (!module) continue;
      // Plugins are applied one at a time, in `priority` order, and an `async
      // apply()` is awaited before the next plugin starts — `oobe` reads the
      // account records `user` initializes, and cordis does not order them.
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
      // Failure is atomic: whatever the plugin managed to register before it
      // threw goes with its scope, so a half-loaded plugin never stays behind —
      // a plugin that had already claimed the request guard, in particular.
      record.error = error instanceof Error ? error : new Error(String(error));
      record.fork?.dispose();
      record.fork = undefined;
      logger.error(`Panel plugin failed to load: ${plugin.manifest.id}`, error);
    }
  }
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
