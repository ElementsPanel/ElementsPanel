import fs from "node:fs";
import path from "node:path";

/**
 * Plugin manifest discovery, shared by every process that has to find plugins:
 * the panel and daemon backend loaders, the panel's frontend manifest endpoint,
 * and the Vite plugin that compiles frontend entries.
 *
 * They used to hold a copy of this logic each, and the copies drifted. Nothing
 * here needs more than `node:fs`, which is what lets the Vite config import this
 * source file directly without pulling in the rest of the common layer.
 */

export interface PluginManifest {
  id: string;
  version?: string;
  description?: string;
  /** Set to false to skip the plugin entirely. */
  enabled?: boolean;
  /** Ascending load order among plugins that do not depend on each other. */
  priority?: number;
  /** Passed to the plugin as its configuration. */
  config?: unknown;
  [key: string]: unknown;
}

/** Browser-safe plugin metadata shared by the Vite and runtime manifests. */
export interface FrontendPluginMetadata {
  id: string;
  version?: string;
  description?: string;
  priority?: number;
  elements?: unknown;
  /** Plugin ids that must be activated before this browser entry. */
  frontendInject?: string[];
  /** Loads in the foundation/prefetch tier. */
  frontendImmediate?: boolean;
  /** A failed or pending entry prevents application startup. */
  frontendRequired?: boolean;
  /** Browser-only configuration; backend `config` is never exposed. */
  config?: unknown;
  restartRequired?: boolean;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.filter((item): item is string => typeof item === "string" && !!item.trim());
  return result.length ? [...new Set(result.map((item) => item.trim()))] : undefined;
}

/**
 * Redacts a full plugin manifest to the fields a browser is allowed to see.
 * Backend `config` may contain credentials, so only `frontendConfig` crosses
 * this boundary.
 */
export function createFrontendPluginMetadata(
  manifest: PluginManifest,
  extras: Pick<FrontendPluginMetadata, "restartRequired"> = {}
): FrontendPluginMetadata {
  const frontendInject = stringArray(manifest.frontendInject);
  return {
    id: manifest.id,
    ...(manifest.version === undefined ? {} : { version: manifest.version }),
    ...(manifest.description === undefined ? {} : { description: manifest.description }),
    ...(manifest.priority === undefined ? {} : { priority: manifest.priority }),
    ...(manifest.elements === undefined ? {} : { elements: manifest.elements }),
    ...(frontendInject === undefined ? {} : { frontendInject }),
    ...(manifest.frontendImmediate === undefined
      ? {}
      : { frontendImmediate: Boolean(manifest.frontendImmediate) }),
    ...(manifest.frontendRequired === undefined
      ? {}
      : { frontendRequired: Boolean(manifest.frontendRequired) }),
    ...(manifest.frontendConfig === undefined ? {} : { config: manifest.frontendConfig }),
    ...(extras.restartRequired === undefined ? {} : extras)
  };
}

export interface DiscoveredPlugin {
  manifest: PluginManifest;
  /** Absolute path of the plugin directory. */
  directory: string;
  /** Directory name, which is also the URL segment a packaged plugin is served at. */
  folder: string;
  /** Absolute path of the resolved entry module, when one was found. */
  entry?: string;
}

export interface DiscoverPluginsOptions {
  /**
   * Manifest fields naming the entry, most specific first. The first one present
   * wins, and no fallback is attempted once a field is set.
   */
  entryFields: string[];
  /** Relative entries tried when no `entryFields` value is set. */
  entryCandidates?: string[];
  /**
   * Include plugins whose manifest sets `enabled: false`. Loaders leave this
   * off; the plugin inventory the panel reports turns it on, because a disabled
   * plugin still has to be listed to be enabled again.
   */
  includeDisabled?: boolean;
  /**
   * Report a plugin that could not be used. Discovery never throws: one broken
   * plugin directory must not stop the others from loading.
   */
  onWarning?: (message: string, error?: unknown) => void;
}

/** A plugin directory to scan, optionally with a public folder name override. */
export interface PluginDiscoveryRoot {
  directory: string;
  /** A persistent installation may supersede its own legacy market directory. */
  overrideManaged?: boolean;
  /** Used by external workspaces, whose manifest lives below a side directory. */
  folder?: string;
}

const MANIFEST_FILES = ["plugin.json", "manifest.json", "package.json"];

/** Reads the manifest of one plugin directory, or null if it has none. */
export function readPluginManifest(
  directory: string,
  onWarning?: (message: string, error?: unknown) => void
): PluginManifest | null {
  for (const file of MANIFEST_FILES) {
    const filePath = path.join(directory, file);
    if (!fs.existsSync(filePath)) continue;
    try {
      const value = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown> | null;
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const id = typeof value.id === "string" ? value.id : path.basename(directory);
      if (!id.trim()) return null;
      return { ...value, id: id.trim() } as PluginManifest;
    } catch (error) {
      onWarning?.(`Failed to read plugin manifest: ${filePath}`, error);
      return null;
    }
  }
  return null;
}

/**
 * Resolves one plugin's entry module. Returns null when the manifest names an
 * entry that does not exist, or when none of the fallback candidates is present.
 * Paths that would escape the plugin directory are rejected.
 */
export function resolvePluginEntry(
  directory: string,
  manifest: PluginManifest,
  options: Pick<DiscoverPluginsOptions, "entryFields" | "entryCandidates">
): string | null {
  const configured = options.entryFields
    .map((field) => manifest[field])
    .find((entry): entry is string => typeof entry === "string" && entry.length > 0);
  const candidates = configured ? [configured] : options.entryCandidates ?? [];
  const root = path.resolve(directory);
  for (const candidate of candidates) {
    const entry = path.resolve(directory, candidate);
    if (entry.startsWith(`${root}${path.sep}`) && fs.existsSync(entry)) return entry;
  }
  return null;
}

function discoverPluginDirectory(
  directory: string,
  options: DiscoverPluginsOptions,
  folder = path.basename(directory)
): DiscoveredPlugin | null {
  const manifest = readPluginManifest(directory, options.onWarning);
  if (!manifest) return null;
  if (manifest.enabled === false && !options.includeDisabled) return null;

  const entry = resolvePluginEntry(directory, manifest, options);
  if (!entry && options.entryFields.some((field) => typeof manifest[field] === "string")) {
    options.onWarning?.(`Plugin "${manifest.id}" has no valid entry module.`);
    return null;
  }
  return { manifest, directory, folder, entry: entry ?? undefined };
}

/**
 * Lists the usable plugins below `root`, in load order: ascending `priority`,
 * then by id so the order is stable. Duplicate ids are dropped, and disabled
 * ones too unless `includeDisabled` says otherwise. A plugin whose manifest names an entry that cannot be resolved is
 * dropped too; one that names none keeps `entry` undefined, because a plugin may
 * legitimately contribute to only one side of the panel.
 */
export function discoverPlugins(root: string, options: DiscoverPluginsOptions): DiscoveredPlugin[] {
  if (!fs.existsSync(root)) return [];

  const plugins: DiscoveredPlugin[] = [];
  const seenIds = new Set<string>();
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const directory = path.join(root, item.name);
    const plugin = discoverPluginDirectory(directory, options, item.name);
    if (!plugin || seenIds.has(plugin.manifest.id)) {
      if (plugin && seenIds.has(plugin.manifest.id)) {
        options.onWarning?.(`Ignoring duplicate plugin id: ${plugin.manifest.id}`);
      }
      continue;
    }
    seenIds.add(plugin.manifest.id);
    plugins.push(plugin);
  }

  return sortPlugins(plugins);
}

/**
 * Discovers plugins from several roots while keeping the first root's plugin
 * when ids collide. The built-in root is intentionally passed first by the
 * panel and daemon loaders, so an external workspace cannot shadow a bundled
 * plugin accidentally.
 */
export function discoverPluginsFromRoots(
  roots: readonly PluginDiscoveryRoot[],
  options: DiscoverPluginsOptions
): DiscoveredPlugin[] {
  const discovered: DiscoveredPlugin[] = [];
  const seenIds = new Set<string>();
  for (const root of roots) {
    const isDirectPlugin = MANIFEST_FILES.some((file) =>
      fs.existsSync(path.join(root.directory, file))
    );
    const plugins = isDirectPlugin
      ? [discoverPluginDirectory(root.directory, options, root.folder)]
      : discoverPlugins(root.directory, options);
    for (const plugin of plugins) {
      if (!plugin) continue;
      if (seenIds.has(plugin.manifest.id)) {
        const index = discovered.findIndex((item) => item.manifest.id === plugin.manifest.id);
        const owner = (directory: string) => {
          try {
            return JSON.parse(fs.readFileSync(path.join(directory, ".market-install.json"), "utf8"))
              .pluginId;
          } catch {
            return undefined;
          }
        };
        const previousOwner = owner(discovered[index].directory);
        if (root.overrideManaged && previousOwner && previousOwner === owner(plugin.directory)) {
          discovered[index] = plugin;
          continue;
        }
        options.onWarning?.(`Ignoring duplicate plugin id: ${plugin.manifest.id}`);
        continue;
      }
      seenIds.add(plugin.manifest.id);
      discovered.push(root.folder ? { ...plugin, folder: root.folder } : plugin);
    }
  }
  return sortPlugins(discovered);
}

/**
 * Lists the side-specific roots of custom plugin workspaces below
 * `<projectRoot>/external/<workspace>/<side>`.
 */
export function discoverExternalPluginRoots(
  projectRoot: string,
  side: "panel" | "daemon"
): PluginDiscoveryRoot[] {
  const externalRoot = path.resolve(projectRoot, "external");
  if (!fs.existsSync(externalRoot)) return [];
  return fs
    .readdirSync(externalRoot, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({
      directory: path.join(externalRoot, item.name, side),
      folder: item.name
    }));
}

/** Load order: ascending `priority`, then by id so it never depends on the filesystem. */
export function sortPlugins<T extends { manifest: PluginManifest }>(plugins: T[]): T[] {
  return plugins.sort(
    (a, b) =>
      (Number(a.manifest.priority) || 0) - (Number(b.manifest.priority) || 0) ||
      a.manifest.id.localeCompare(b.manifest.id)
  );
}
