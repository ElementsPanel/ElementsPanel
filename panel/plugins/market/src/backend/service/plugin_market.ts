import path from "path";
import { createHash, randomBytes } from "crypto";
import axios from "axios";
import fs from "fs-extra";
import {
  MARKET_INSTALL_MARKER as MARKER_FILE,
  PluginPackageError as PluginMarketError,
  pluginPackageDirectory,
  removePluginPackage,
  writePluginPackage,
  validatePluginCompatibility
} from "mcsmanager-common";

export { PluginMarketError };

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
// daemon itself (`plugin/install`). Both sides use data/plugins so container
// replacement preserves installed code on the existing data volume. Legacy
// plugins and market_plugins roots are still inventoried.

const SIDES = ["panel", "daemon"] as const;
export type PluginSide = (typeof SIDES)[number];

export interface MarketInstallInfo {
  pluginId: string;
  name: string;
  version: string;
  installedAt: number;
}

export interface InstalledMarketPlugin extends MarketInstallInfo {
  sides: PluginSide[];
  directories: string[];
  daemonIds: string[];
}

export interface RemoteMarketInstall extends MarketInstallInfo {
  daemonId: string;
}

/** One file of a published package, with its side taken off the front. */
export interface MarketPackageFile {
  /** The path the market publishes it under, which is what `/file` expects. */
  path: string;
  side: PluginSide;
  relative: string;
  size: number;
  sha256?: string;
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

/** Install into the existing persistent data volume in every environment. */
export function installRoot(side: PluginSide): string {
  const directory = side === "panel" ? process.cwd() : path.join(projectRoot(), side);
  return path.join(directory, "data", "plugins");
}

/** Both are searched: an installation may have been made under either. */
function pluginRoots(): string[] {
  return [
    path.join(process.cwd(), "data", "plugins"),
    path.join(process.cwd(), "plugins"),
    path.join(process.cwd(), "market_plugins")
  ];
}

export function installDirectory(side: PluginSide, name: string): string {
  return pluginPackageDirectory(installRoot(side), name);
}

function isInstallInfo(value: unknown): value is MarketInstallInfo {
  if (!value || typeof value !== "object") return false;
  const info = value as Partial<MarketInstallInfo>;
  return (
    typeof info.pluginId === "string" &&
    Boolean(info.pluginId) &&
    typeof info.name === "string" &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(info.name) &&
    typeof info.version === "string" &&
    typeof info.installedAt === "number" &&
    Number.isFinite(info.installedAt)
  );
}

function readMarker(directory: string): MarketInstallInfo | null {
  try {
    const filename = path.join(directory, MARKER_FILE);
    if (!fs.lstatSync(filename).isFile()) return null;
    const parsed: unknown = JSON.parse(fs.readFileSync(filename, "utf8"));
    return isInstallInfo(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function remoteInstallRoot(): string {
  return path.join(process.cwd(), "data", "market-installs");
}

function remoteInstallFile(pluginId: string): string {
  const key = createHash("sha256").update(pluginId).digest("hex");
  return path.join(remoteInstallRoot(), `${key}.json`);
}

/** Remote files never live under the panel's plugin directories. */
export function readRemoteInstalls(pluginId: string): RemoteMarketInstall[] {
  const filename = remoteInstallFile(pluginId);
  try {
    if (!fs.lstatSync(filename).isFile()) return [];
    const data = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (data?.pluginId !== pluginId || !Array.isArray(data.installations)) return [];
    return data.installations.filter(
      (item: unknown): item is RemoteMarketInstall =>
        isInstallInfo(item) &&
        item.pluginId === pluginId &&
        typeof (item as RemoteMarketInstall).daemonId === "string" &&
        Boolean((item as RemoteMarketInstall).daemonId)
    );
  } catch (error: any) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeRemoteInstalls(pluginId: string, installations: RemoteMarketInstall[]) {
  const filename = remoteInstallFile(pluginId);
  // The identifier never becomes a path, and existing links cannot redirect
  // this record to a different installation's files.
  for (const target of [path.dirname(remoteInstallRoot()), remoteInstallRoot(), filename]) {
    try {
      if ((await fs.lstat(target)).isSymbolicLink()) throw new PluginMarketError("BAD_PATH");
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (!installations.length) {
    await fs.remove(filename);
    return;
  }
  await fs.ensureDir(remoteInstallRoot());
  const temporary = `${filename}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify({ pluginId, installations }, null, 2), {
      flag: "wx"
    });
    await fs.rename(temporary, filename);
  } finally {
    await fs.remove(temporary);
  }
}

/** Record each successful node immediately, so later failures remain retryable. */
export async function recordRemoteInstall(info: MarketInstallInfo, daemonId: string) {
  const installations = readRemoteInstalls(info.pluginId).filter(
    (item) => item.daemonId !== daemonId || item.name !== info.name
  );
  installations.push({ ...info, daemonId });
  await writeRemoteInstalls(info.pluginId, installations);
}

export async function forgetRemoteInstall(installation: RemoteMarketInstall) {
  const { pluginId, daemonId, name } = installation;
  const remaining = readRemoteInstalls(pluginId).filter(
    (item) => item.daemonId !== daemonId || item.name !== name
  );
  await writeRemoteInstalls(pluginId, remaining);
}

/** Local panel markers and acknowledged remote installs, never sibling daemons. */
export function listInstalled(): InstalledMarketPlugin[] {
  const found = new Map<string, InstalledMarketPlugin>();
  const add = (
    info: MarketInstallInfo,
    side: PluginSide,
    directory?: string,
    daemonId?: string
  ) => {
    let installed = found.get(info.pluginId);
    if (!installed) {
      installed = { ...info, sides: [], directories: [], daemonIds: [] };
      found.set(info.pluginId, installed);
    } else if (info.installedAt > installed.installedAt) {
      installed.name = info.name;
      installed.version = info.version;
      installed.installedAt = info.installedAt;
    }
    if (!installed.sides.includes(side)) installed.sides.push(side);
    if (directory) installed.directories.push(directory);
    if (daemonId && !installed.daemonIds.includes(daemonId)) installed.daemonIds.push(daemonId);
  };

  for (const root of pluginRoots()) {
    if (!fs.existsSync(root) || !fs.lstatSync(root).isDirectory()) continue;
    for (const item of fs.readdirSync(root, { withFileTypes: true })) {
      if (!item.isDirectory()) continue;
      const directory = path.join(root, item.name);
      const marker = readMarker(directory);
      if (marker) add(marker, "panel", directory);
    }
  }
  const recordRoot = remoteInstallRoot();
  if (fs.existsSync(recordRoot) && fs.lstatSync(recordRoot).isDirectory()) {
    for (const item of fs.readdirSync(recordRoot, { withFileTypes: true })) {
      if (!item.isFile() || !/^[a-f0-9]{64}\.json$/.test(item.name)) continue;
      const filename = path.join(recordRoot, item.name);
      let record: { pluginId?: unknown };
      try {
        record = JSON.parse(fs.readFileSync(filename, "utf8"));
      } catch (error) {
        if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT")
          continue;
        throw error;
      }
      if (typeof record?.pluginId !== "string" || remoteInstallFile(record.pluginId) !== filename)
        continue;
      for (const info of readRemoteInstalls(record.pluginId))
        add(info, "daemon", undefined, info.daemonId);
    }
  }

  return [...found.values()];
}

function splitPackagePath(rawPath: string): { side: PluginSide; relative: string } | null {
  if (typeof rawPath !== "string" || /[\\:\x00]/.test(rawPath)) return null;
  const segments = rawPath.split("/");
  if (segments.length < 2) return null;
  const side = segments[0];
  if (side !== "panel" && side !== "daemon") return null;

  const rest = segments.slice(1);
  if (
    rest.some((segment) => !segment || segment === "." || segment === ".." || /[. ]$/.test(segment))
  )
    return null;

  return { side, relative: rest.join(path.sep) };
}

function marketUrl(addr: string, pluginId: string, suffix: string) {
  return `${addr}/api/plugins/${encodeURIComponent(pluginId)}${suffix}`;
}

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
  const params = {
    pluginApi: 1,
    pluginSdk: 1,
    ...(options.version ? { version: options.version } : {})
  };

  const meta = await axios.get<{
    name: string;
    version: string;
    compatibility?: Record<string, unknown>;
    files: Array<{ path: string; size: number; sha256?: string }>;
  }>(marketUrl(addr, options.pluginId, "/files"), { params, timeout: 20000 });

  if (!Array.isArray(meta.data?.files)) throw new PluginMarketError("EMPTY_PACKAGE");
  try {
    for (const contract of Object.values(meta.data.compatibility || {}))
      validatePluginCompatibility(contract);
  } catch {
    throw new PluginMarketError("INCOMPATIBLE");
  }
  const files = meta.data.files.map((file) => {
    const target = splitPackagePath(file?.path);
    if (!target) throw new PluginMarketError("BAD_PATH");
    if (file.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(file.sha256))
      throw new PluginMarketError("BAD_CHECKSUM");
    return { path: file.path, ...target, size: file.size, sha256: file.sha256 };
  });
  if (!files.length) throw new PluginMarketError("EMPTY_PACKAGE");

  const name = String(meta.data?.name || options.name || options.pluginId);
  installDirectory("panel", name);
  return {
    pluginId: options.pluginId,
    name,
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
    const content = Buffer.from(response.data);
    if (
      file.sha256 &&
      (content.length !== file.size ||
        createHash("sha256").update(content).digest("hex") !== file.sha256)
    )
      throw new PluginMarketError("BAD_CHECKSUM");
    downloaded.push({
      side: file.side,
      relative: file.relative,
      content
    });
  }
  // Validate every side before writing the panel half or distributing any node half.
  for (const side of new Set(downloaded.map((file) => file.side))) {
    const file = downloaded.find(
      (entry) => entry.side === side && entry.relative === "plugin.json"
    );
    if (!file) throw new PluginMarketError("EMPTY_PACKAGE");
    let manifest: { elements?: unknown };
    try {
      manifest = JSON.parse(file.content.toString("utf8"));
      if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
        throw new Error("Invalid manifest");
    } catch {
      throw new PluginMarketError("EMPTY_PACKAGE");
    }
    try {
      validatePluginCompatibility(manifest.elements);
    } catch {
      throw new PluginMarketError("INCOMPATIBLE");
    }
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
  return writePluginPackage(installRoot(side), info, files, pluginRoots());
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
  for (const directory of installed.directories) {
    await removePluginPackage(path.dirname(directory), path.basename(directory), pluginId);
  }
  return installed;
}
