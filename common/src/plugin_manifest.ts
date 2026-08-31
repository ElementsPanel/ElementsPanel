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
  name?: string;
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
   * Report a plugin that could not be used. Discovery never throws: one broken
   * plugin directory must not stop the others from loading.
   */
  onWarning?: (message: string, error?: unknown) => void;
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
      const id =
        typeof value.id === "string"
          ? value.id
          : typeof value.name === "string"
          ? value.name
          : path.basename(directory);
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

/**
 * Lists the usable plugins below `root`, in load order: ascending `priority`,
 * then by id so the order is stable. Disabled plugins and duplicate ids are
 * dropped. A plugin whose manifest names an entry that cannot be resolved is
 * dropped too; one that names none keeps `entry` undefined, because a plugin may
 * legitimately contribute to only one side of the panel.
 */
export function discoverPlugins(
  root: string,
  options: DiscoverPluginsOptions
): DiscoveredPlugin[] {
  if (!fs.existsSync(root)) return [];

  const plugins: DiscoveredPlugin[] = [];
  const seenIds = new Set<string>();
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const directory = path.join(root, item.name);
    const manifest = readPluginManifest(directory, options.onWarning);
    if (!manifest || manifest.enabled === false) continue;
    if (seenIds.has(manifest.id)) {
      options.onWarning?.(`Ignoring duplicate plugin id: ${manifest.id}`);
      continue;
    }
    seenIds.add(manifest.id);

    const entry = resolvePluginEntry(directory, manifest, options);
    if (!entry && options.entryFields.some((field) => typeof manifest[field] === "string")) {
      options.onWarning?.(`Plugin "${manifest.id}" has no valid entry module.`);
      continue;
    }
    plugins.push({ manifest, directory, folder: item.name, entry: entry ?? undefined });
  }

  return sortPlugins(plugins);
}

/** Load order: ascending `priority`, then by id so it never depends on the filesystem. */
export function sortPlugins<T extends { manifest: PluginManifest }>(plugins: T[]): T[] {
  return plugins.sort(
    (a, b) =>
      (Number(a.manifest.priority) || 0) - (Number(b.manifest.priority) || 0) ||
      a.manifest.id.localeCompare(b.manifest.id)
  );
}
