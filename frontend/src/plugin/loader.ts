import { shallowReactive } from "vue";
import type { ForkScope } from "cordis";
import { router } from "@/config/router";
import { ctx, type PanelFrontendPluginContext } from "./context";
import { panelPluginModules } from "virtual:panel-plugins";

/**
 * Fetches plugin code and hands it to cordis.
 *
 * Discovery is unchanged: in development the Vite plugin supplies a virtual
 * module of static imports; in production the browser fetches
 * `plugins/manifest.json` and imports each entry by URL. What that feeds is now
 * `ctx.plugin()`, and unloading is `fork.dispose()` — every route, card, menu,
 * action and translation the plugin registered is an effect of its scope.
 */

export interface PanelFrontendPluginMetadata {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  frontend?: string;
  ui?: string;
  [key: string]: unknown;
}

/** A frontend plugin module, as its entry exports it. */
export interface PanelFrontendPluginModule {
  inject?: string[] | Record<string, { required: boolean }>;
  apply(ctx: PanelFrontendPluginContext, config?: unknown): void | Promise<void>;
}

interface PluginSource {
  metadata: PanelFrontendPluginMetadata;
  directory: string;
  assetDirectory: string;
  entry?: string;
  styles?: string[];
  load: (cacheKey?: string) => Promise<Record<string, unknown>>;
}

export interface LoadedPanelFrontendPlugin {
  metadata: PanelFrontendPluginMetadata;
  directory: string;
  fork?: ForkScope;
  error?: Error;
}

interface InternalPlugin extends LoadedPanelFrontendPlugin {
  source: PluginSource;
  /** Only the stylesheet links, which are not cordis effects. */
  removeStyles?: () => void;
}

const plugins = shallowReactive<InternalPlugin[]>([]);
const sources = new Map<string, PluginSource>();

function normalizeMetadata(value: Record<string, unknown>): PanelFrontendPluginMetadata | null {
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!id) return null;
  return { ...value, id } as PanelFrontendPluginMetadata;
}

/**
 * The plugin object a module exports, whether as named exports or as `default`.
 *
 * Only an object counts: every function has `Function.prototype.apply`, so a
 * module whose default export is a function would otherwise be mistaken for a
 * plugin and then called with the context as `this`.
 */
function toModule(value: any, id: string): PanelFrontendPluginModule | undefined {
  for (const candidate of [value, value?.default]) {
    if (typeof candidate !== "object" || candidate === null) continue;
    if (typeof candidate.apply === "function") return candidate;
  }
  ctx.logger("plugin").warn(`Panel frontend plugin "${id}" must export an apply() function.`);
  return undefined;
}

async function loadStyles(source: PluginSource) {
  const links: HTMLLinkElement[] = [];
  try {
    await Promise.all(
      (source.styles || []).map(
        (href) =>
          new Promise<void>((resolve, reject) => {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = href;
            link.dataset.panelPlugin = source.metadata.id;
            link.addEventListener("load", () => resolve(), { once: true });
            link.addEventListener(
              "error",
              () => reject(new Error(`Failed to load panel plugin stylesheet: ${href}`)),
              { once: true }
            );
            document.head.appendChild(link);
            links.push(link);
          })
      )
    );
  } catch (error) {
    links.forEach((link) => link.remove());
    throw error;
  }
  return () => links.forEach((link) => link.remove());
}

/**
 * Removes stylesheets the plugin injected itself, which the core cannot track:
 * `<style>` elements it tagged, and any `<link>` matching one of its hrefs.
 */
function removePluginStyles(source: PluginSource) {
  document
    .querySelectorAll<HTMLStyleElement>(
      `style[data-panel-plugin=${JSON.stringify(source.metadata.id)}]`
    )
    .forEach((style) => style.remove());
  for (const href of source.styles || []) {
    const normalizedHref = new URL(href, document.baseURI).href;
    document.querySelectorAll<HTMLLinkElement>("link[rel='stylesheet']").forEach((link) => {
      try {
        if (new URL(link.href, document.baseURI).href === normalizedHref) link.remove();
      } catch {
        // Ignore malformed third-party stylesheet URLs.
      }
    });
  }
}

async function fetchProductionSources(): Promise<PluginSource[]> {
  const manifestUrl = new URL("plugins/manifest.json", document.baseURI);
  const response = await fetch(manifestUrl.href, { cache: "no-store" });
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Failed to load panel plugin manifest: HTTP ${response.status}`);
  }
  const body = await response.json();
  // Older panel builds may still pass the manifest through the standard API
  // envelope. Accept both the raw array and `{ data: [...] }` forms.
  const manifest = Array.isArray(body) ? body : body?.data;
  if (!Array.isArray(manifest)) throw new Error("Invalid panel plugin manifest.");

  const toUrl = (value: string) => new URL(value, manifestUrl).href;
  const result: PluginSource[] = [];
  for (const item of manifest) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const metadata = normalizeMetadata((item as any).metadata || item);
    const entry = typeof (item as any).entry === "string" ? (item as any).entry : "";
    if (!metadata || metadata.enabled === false || !entry) continue;
    const entryUrl = toUrl(entry);
    result.push({
      metadata,
      directory: typeof (item as any).directory === "string" ? (item as any).directory : metadata.id,
      assetDirectory:
        typeof (item as any).assetDirectory === "string"
          ? (item as any).assetDirectory
          : metadata.id,
      entry: entryUrl,
      styles: Array.isArray((item as any).styles)
        ? (item as any).styles
            .filter((style: unknown): style is string => typeof style === "string")
            .map(toUrl)
        : [],
      load: async (cacheKey) => {
        const url = new URL(entryUrl);
        if (cacheKey) url.searchParams.set("panel_plugin_reload", cacheKey);
        return import(/* @vite-ignore */ url.href) as Promise<Record<string, unknown>>;
      }
    });
  }
  return result;
}

async function discoverSources() {
  const discovered = import.meta.env.DEV
    ? (panelPluginModules as PluginSource[])
    : await fetchProductionSources();
  const unique = new Map<string, PluginSource>();
  for (const source of discovered) {
    const metadata = normalizeMetadata(source.metadata);
    if (!metadata || metadata.enabled === false || unique.has(metadata.id)) continue;
    unique.set(metadata.id, { ...source, metadata });
  }
  // Ascending priority, then by id, so the order never depends on the manifest.
  return [...unique.values()].sort(
    (a, b) =>
      (Number(a.metadata.priority) || 0) - (Number(b.metadata.priority) || 0) ||
      a.metadata.id.localeCompare(b.metadata.id)
  );
}

async function install(source: PluginSource, cacheKey?: string) {
  const existing = plugins.find((plugin) => plugin.metadata.id === source.metadata.id);
  if (existing) return existing;

  const plugin = shallowReactive<InternalPlugin>({
    source,
    metadata: source.metadata,
    directory: source.directory
  });
  plugins.push(plugin);
  try {
    if (!import.meta.env.DEV) plugin.removeStyles = await loadStyles(source);
    const module = toModule(await source.load(cacheKey), source.metadata.id);
    if (module) {
      // An `async apply()` is awaited here, so a plugin is fully applied before
      // the next one loads and before the app is mounted.
      //
      // cordis catches a synchronous throw from `apply()` and cancels the scope
      // itself, so the wrapper keeps a copy of it: without that, a plugin that
      // failed on its first line would still be reported as loaded.
      let applied: unknown;
      let thrown: unknown;
      // The manifest id is the plugin's name, so `ctx.name` — which is what
      // appears in its log lines — always matches `plugin.json`.
      plugin.fork = ctx.plugin(
        {
          ...module,
          name: source.metadata.id,
          apply: (...args) => {
            try {
              return (applied = module.apply(...args));
            } catch (error) {
              thrown = error;
              throw error;
            }
          }
        },
        (source.metadata as { config?: unknown }).config
      );
      if (thrown) throw thrown;
      await applied;
      ctx.logger("plugin").info(`Panel frontend plugin loaded: ${source.metadata.id}`);
    }
  } catch (error: any) {
    // Failure is atomic: whatever the plugin managed to register before it threw
    // goes with its scope, so a half-loaded plugin never stays behind.
    plugin.error = error instanceof Error ? error : new Error(String(error));
    plugin.fork?.dispose();
    plugin.fork = undefined;
    plugin.removeStyles?.();
    ctx.logger("plugin").error(`Panel frontend plugin failed to load: ${source.metadata.id}`, error);
  }
  return plugin;
}

function isCurrentRoute(plugin: InternalPlugin) {
  return router.currentRoute.value.matched.some(
    (record) => ctx.routes.ownerOf(record.path) === plugin.metadata.id
  );
}

export async function unloadPlugin(id: string) {
  const plugin = plugins.find((candidate) => candidate.metadata.id === id);
  if (!plugin) return false;
  // Leave the plugin's page before its routes go, or the router lands on
  // nothing.
  if (isCurrentRoute(plugin)) await router.replace("/404");
  await plugin.fork?.dispose();
  plugin.removeStyles?.();
  removePluginStyles(plugin.source);
  const index = plugins.indexOf(plugin);
  if (index >= 0) plugins.splice(index, 1);
  ctx.logger("plugin").info(`Panel frontend plugin unloaded: ${id}`);
  return true;
}

export async function loadPlugin(id: string) {
  let source = sources.get(id);
  if (!source && !import.meta.env.DEV) {
    await refreshPlugins();
    source = sources.get(id);
  }
  if (!source) throw new Error(`Panel frontend plugin not found: ${id}`);
  return install(source);
}

export async function reloadPlugin(id: string) {
  await unloadPlugin(id);
  if (!import.meta.env.DEV) {
    const discovered = await discoverSources();
    sources.clear();
    discovered.forEach((source) => sources.set(source.metadata.id, source));
  }
  const source = sources.get(id);
  if (!source) throw new Error(`Panel frontend plugin not found: ${id}`);
  // A fresh URL, or the browser answers the import from its module cache.
  return install(source, `${Date.now()}`);
}

/** Re-reads what is installed and loads or unloads to match. */
export async function refreshPlugins() {
  const discovered = await discoverSources();
  const next = new Map(discovered.map((source) => [source.metadata.id, source]));
  sources.clear();
  next.forEach((source, id) => sources.set(id, source));
  for (const plugin of [...plugins].reverse()) {
    if (!next.has(plugin.metadata.id)) await unloadPlugin(plugin.metadata.id);
  }
  for (const source of discovered) {
    if (!plugins.some((plugin) => plugin.metadata.id === source.metadata.id)) await install(source);
  }
  return discovered.map((source) => source.metadata) as readonly PanelFrontendPluginMetadata[];
}

export function getLoadedPlugins(): readonly LoadedPanelFrontendPlugin[] {
  return plugins;
}
