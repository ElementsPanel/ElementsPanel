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
// The two halves do not travel the same way. The panel half is written into this
// process's own plugin directory; the daemon half has to land on every machine
// that loads it, so it is sent to the daemons the user picked and written by the
// daemon itself (`plugin/install`). In development a side goes to
// `<side>/market_plugins/<name>/` instead of `<side>/plugins/`, because that
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

/** One file of a published package, with its side taken off the front. */
export interface MarketPackageFile {
  /** The path the market publishes it under, which is what `/file` expects. */
  path: string;
  side: PluginSide;
  relative: string;
  size: number;
}

/** A package as the market lists it: enough to decide what an install touches. */
export interface MarketPackage {
  pluginId: string;
  name: string;
  version: string;
  files: MarketPackageFile[];
}

/** One file of a package, ready to be written or sent to a daemon. */
export interface MarketFileContent {
  side: PluginSide;
  relative: string;
  content: Buffer;
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

/**
 * Asks the market what a package contains, without downloading it.
 *
 * The answer is what the page needs before it can ask the user anything: a
 * package with a daemon half has to be sent to the nodes the user picks, and one
 * without is installed into the panel alone.
 */
export async function fetchPackage(
  addr: string,
  options: { pluginId: string; name?: string; version?: string }
): Promise<MarketPackage> {
  const params = options.version ? { version: options.version } : {};

  const meta = await axios.get<{
    name: string;
    version: string;
    files: Array<{ path: string; size: number }>;
  }>(marketUrl(addr, options.pluginId, "/files"), { params, timeout: 20000 });

  const files = (meta.data?.files ?? [])
    .map((file) => {
      const target = splitPackagePath(file.path);
      return target ? { path: file.path, ...target, size: file.size } : null;
    })
    .filter((file): file is MarketPackageFile => file !== null);
  if (!files.length) throw new PluginMarketError("EMPTY_PACKAGE");

  return {
    pluginId: options.pluginId,
    name: String(meta.data?.name || options.name || options.pluginId),
    version: String(meta.data?.version ?? options.version ?? ""),
    files
  };
}

/** Downloads every file of a package, keeping each one's side. */
export async function downloadPackage(
  addr: string,
  pkg: MarketPackage
): Promise<MarketFileContent[]> {
  const params = pkg.version ? { version: pkg.version } : {};
  const downloaded: MarketFileContent[] = [];
  for (const file of pkg.files) {
    const response = await axios.get<ArrayBuffer>(marketUrl(addr, pkg.pluginId, "/file"), {
      params: { ...params, path: file.path },
      responseType: "arraybuffer",
      timeout: 60000
    });
    downloaded.push({
      side: file.side,
      relative: file.relative,
      content: Buffer.from(response.data)
    });
  }
  return downloaded;
}

/**
 * Writes one side's files into this process's own plugin directory, and marks
 * the directory so the market can recognise it later.
 */
export async function writePlugin(
  side: PluginSide,
  info: MarketInstallInfo,
  files: readonly { relative: string; content: Buffer }[]
): Promise<string> {
  // A directory that belongs to a different plugin is not ours to overwrite.
  const directory = installDirectory(side, info.name);
  const marker = readMarker(directory);
  if (marker && marker.pluginId !== info.pluginId) throw new PluginMarketError("DIR_TAKEN");

  const root = path.resolve(directory);
  for (const file of files) {
    const destination = path.resolve(root, file.relative);
    if (!destination.startsWith(`${root}${path.sep}`)) throw new PluginMarketError("BAD_PATH");
    await fs.outputFile(destination, file.content);
  }
  await fs.outputFile(path.join(directory, MARKER_FILE), JSON.stringify(info, null, 2));
  return directory;
}

/** What a daemon needs to write the same half on its own machine. */
export function toTransferFiles(files: readonly { relative: string; content: Buffer }[]) {
  return files.map((file) => ({
    path: file.relative,
    content: file.content.toString("base64")
  }));
}

/**
 * Removes every local half of an installation and reports what it was, so the
 * caller can ask the same nodes to remove their half too.
 */
export async function uninstallPlugin(pluginId: string): Promise<InstalledMarketPlugin | null> {
  const installed = listInstalled().find((item) => item.pluginId === pluginId);
  if (!installed) return null;
  for (const directory of installed.directories) await fs.remove(directory);
  return installed;
}
