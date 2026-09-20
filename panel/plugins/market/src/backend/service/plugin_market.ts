import path from "path";
import axios from "axios";
import fs from "fs-extra";

// Installing a plugin from the plugin market.
//
// A published package is laid out the way `scripts/package-panel-plugins.mjs`
// lays one out, with the side as its first path segment:
//
//   panel/plugin.json, panel/backend/index.cjs, panel/frontend/index.js
//   daemon/plugin.json, daemon/backend/index.cjs
//
// Installing means putting each side's files under `<side>/plugins/<name>/`, so
// the panel and daemon loaders pick the plugin up like any other. In development
// the same files go to `<side>/market_plugins/<name>/` instead, because that
// directory is git-ignored and an installation must never add files to the
// repository.

const SIDES = ["panel", "daemon"] as const;
export type PluginSide = (typeof SIDES)[number];

/** Written into an installed plugin's directory: what it is, and who put it there. */
const MARKER_FILE = ".market-install.json";

export interface MarketInstallInfo {
  pluginId: string;
  name: string;
  version: string;
  installedAt: number;
}

export interface InstalledMarketPlugin extends MarketInstallInfo {
  sides: PluginSide[];
  directories: string[];
}

function projectRoot() {
  // The panel runs with its own directory as the working directory.
  return path.resolve(process.cwd(), "..");
}

/**
 * Whether this is a development checkout.
 *
 * `process.env.NODE_ENV` is no use here: webpack bakes `"production"` into every
 * plugin bundle — `webpack.plugins.config.js` builds in production mode, and a
 * plugin's `backend/index.cjs` is what runs even while the dev servers are up.
 * The source tree is the signal that survives: a built deployment is only
 * `production-code/web` and `production-code/daemon`, with no `panel/src`.
 */
export function isDevelopment(): boolean {
  return fs.existsSync(path.join(projectRoot(), "panel", "src", "app"));
}

/** Where an installation writes. `market_plugins` in development, `plugins` otherwise. */
export function installRoot(side: PluginSide): string {
  return path.join(projectRoot(), side, isDevelopment() ? "market_plugins" : "plugins");
}

/** Both are searched: an installation may have been made under either. */
function pluginRoots(side: PluginSide): string[] {
  return [path.join(projectRoot(), side, "plugins"), path.join(projectRoot(), side, "market_plugins")];
}

export function installDirectory(side: PluginSide, name: string): string {
  return path.join(installRoot(side), name);
}

function readMarker(directory: string): MarketInstallInfo | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(directory, MARKER_FILE), "utf8"));
    return parsed && typeof parsed.pluginId === "string" ? (parsed as MarketInstallInfo) : null;
  } catch {
    return null;
  }
}

/** Every plugin directory that carries an install marker, under either root. */
export function listInstalled(): InstalledMarketPlugin[] {
  const found = new Map<string, InstalledMarketPlugin>();

  for (const side of SIDES) {
    for (const root of pluginRoots(side)) {
      if (!fs.existsSync(root)) continue;
      for (const item of fs.readdirSync(root, { withFileTypes: true })) {
        if (!item.isDirectory()) continue;
        const directory = path.join(root, item.name);
        const marker = readMarker(directory);
        if (!marker?.pluginId) continue;

        const existing = found.get(marker.pluginId);
        if (existing) {
          existing.sides.push(side);
          existing.directories.push(directory);
          continue;
        }
        found.set(marker.pluginId, {
          ...marker,
          sides: [side],
          directories: [directory]
        });
      }
    }
  }

  return [...found.values()];
}

function splitPackagePath(
  rawPath: string
): { side: PluginSide; relative: string } | null {
  const segments = rawPath.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const side = segments[0];
  if (side !== "panel" && side !== "daemon") return null;

  const rest = segments.slice(1);
  if (rest.some((segment) => segment === "." || segment === "..")) return null;

  return { side, relative: rest.join(path.sep) };
}

function marketUrl(addr: string, pluginId: string, suffix: string) {
  return `${addr}/api/plugins/${encodeURIComponent(pluginId)}${suffix}`;
}

export class PluginMarketError extends Error {}

export async function installPlugin(
  addr: string,
  options: { pluginId: string; name: string; version?: string }
): Promise<InstalledMarketPlugin> {
  const params = options.version ? { version: options.version } : {};

  const meta = await axios.get<{
    name: string;
    version: string;
    files: Array<{ path: string; size: number }>;
  }>(marketUrl(addr, options.pluginId, "/files"), { params, timeout: 20000 });

  const files = meta.data?.files ?? [];
  if (!files.length) throw new PluginMarketError("EMPTY_PACKAGE");

  const name = String(meta.data?.name || options.name);
  const version = String(meta.data?.version ?? options.version ?? "");

  // A directory that belongs to a different plugin is not ours to overwrite.
  for (const side of SIDES) {
    const marker = readMarker(installDirectory(side, name));
    if (marker && marker.pluginId !== options.pluginId) throw new PluginMarketError("DIR_TAKEN");
  }

  const touched = new Set<PluginSide>();
  for (const file of files) {
    const target = splitPackagePath(file.path);
    if (!target) continue;

    const root = installDirectory(target.side, name);
    const destination = path.resolve(root, target.relative);
    if (!destination.startsWith(`${path.resolve(root)}${path.sep}`)) {
      throw new PluginMarketError("BAD_PATH");
    }

    const response = await axios.get<ArrayBuffer>(marketUrl(addr, options.pluginId, "/file"), {
      params: { ...params, path: file.path },
      responseType: "arraybuffer",
      timeout: 60000
    });
    await fs.outputFile(destination, Buffer.from(response.data));
    touched.add(target.side);
  }

  if (!touched.size) throw new PluginMarketError("EMPTY_PACKAGE");

  const info: MarketInstallInfo = {
    pluginId: options.pluginId,
    name,
    version,
    installedAt: Date.now()
  };
  for (const side of touched) {
    await fs.outputFile(
      path.join(installDirectory(side, name), MARKER_FILE),
      JSON.stringify(info, null, 2)
    );
  }

  return { ...info, sides: [...touched], directories: [...touched].map((side) => installDirectory(side, name)) };
}

export async function uninstallPlugin(pluginId: string): Promise<boolean> {
  const installed = listInstalled().find((item) => item.pluginId === pluginId);
  if (!installed) return false;
  for (const directory of installed.directories) await fs.remove(directory);
  return true;
}
