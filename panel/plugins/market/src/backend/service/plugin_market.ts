import { createHash, randomBytes } from "crypto";
import path from "path";
import axios from "axios";
import fs from "fs-extra";
import {
  installNpmPlugin,
  listNpmPlugins,
  uninstallNpmPlugin,
  type NpmPluginRecord
} from "mcsmanager-common";

export type MarketErrorReason =
  | "NOT_FOUND"
  | "DIR_TAKEN"
  | "EMPTY_PACKAGE"
  | "BAD_PATH"
  | "BAD_CHECKSUM"
  | "INCOMPATIBLE"
  | "NO_NODES"
  | "BUNDLED";

export class PluginMarketError extends Error {
  constructor(readonly reason: MarketErrorReason) {
    super(reason);
  }
}

// Plugin installation through the market.
//
// The market no longer serves package files: it indexes npm packages named
// `epanel-plugin-*`. Installing one means adding an npm dependency to the
// installation project, which the runtime resolves like any other npm plugin.
// Updates are ordinary npm dependency updates, and the market only names the
// package and the version.

export type PluginSide = "panel" | "daemon";

export interface MarketInstallInfo {
  pluginId: string;
  /** The npm package name. */
  name: string;
  version: string;
  installedAt: number;
}

export interface InstalledMarketPlugin extends MarketInstallInfo {
  sides: PluginSide[];
  directories: string[];
  daemonIds: string[];
  /** Bundled plugins ship inside the runtime package and cannot be removed here. */
  source: "bundled" | "project";
  removable: boolean;
}

export interface RemoteMarketInstall extends MarketInstallInfo {
  daemonId: string;
}

export interface MarketPluginDetail {
  id: string;
  name: string;
  sides: PluginSide[];
  selectedVersion: {
    version: string;
    sides: PluginSide[];
  };
}

function remoteInstallRoot(): string {
  return path.join(process.cwd(), "data", "MarketInstalls");
}

function remoteInstallFile(pluginId: string): string {
  const key = createHash("sha256").update(pluginId).digest("hex");
  return path.join(remoteInstallRoot(), `${key}.json`);
}

function isInstallInfo(value: unknown): value is MarketInstallInfo {
  if (!value || typeof value !== "object") return false;
  const info = value as Partial<MarketInstallInfo>;
  return (
    typeof info.pluginId === "string" &&
    Boolean(info.pluginId) &&
    typeof info.name === "string" &&
    Boolean(info.name) &&
    typeof info.version === "string" &&
    typeof info.installedAt === "number" &&
    Number.isFinite(info.installedAt)
  );
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

function localRecord(record: NpmPluginRecord): InstalledMarketPlugin {
  return {
    pluginId: record.pluginId,
    name: record.name,
    version: record.version,
    installedAt: 0,
    sides: record.sides,
    directories: [record.directory],
    daemonIds: [],
    source: record.source,
    removable: record.source === "project"
  };
}

/** Local npm dependencies, both bundled and project-installed, plus node records. */
export function listInstalled(): InstalledMarketPlugin[] {
  const found = new Map<string, InstalledMarketPlugin>();
  for (const record of listNpmPlugins(undefined, { skipInvalid: true }))
    found.set(record.pluginId, localRecord(record));

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
      for (const info of readRemoteInstalls(record.pluginId)) {
        let installed = found.get(info.pluginId);
        if (!installed) {
          installed = {
            ...info,
            sides: ["daemon"],
            directories: [],
            daemonIds: [],
            source: "project",
            removable: true
          };
          found.set(info.pluginId, installed);
        }
        if (!installed.sides.includes("daemon")) installed.sides.push("daemon");
        if (!installed.daemonIds.includes(info.daemonId)) installed.daemonIds.push(info.daemonId);
      }
    }
  }

  return [...found.values()];
}

function sidesOf(value: unknown): PluginSide[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is PluginSide => item === "panel" || item === "daemon"))];
}

/**
 * Reads the release the page is about to install. The market's catalogue is the
 * authority for the npm package name, so an install cannot be redirected to a
 * different package than the one that was listed.
 */
export async function fetchMarketPluginDetail(
  addr: string,
  pluginId: string,
  version?: string
): Promise<MarketPluginDetail> {
  const response = await axios.get<Record<string, any>>(
    `${addr}/api/plugins/${encodeURIComponent(pluginId)}`,
    { params: version ? { version } : {}, timeout: 15000 }
  );
  const detail = response.data ?? {};
  const selected =
    (version && Array.isArray(detail.versions)
      ? detail.versions.find((item: { version?: unknown }) => item?.version === version)
      : detail.selectedVersion) ?? detail.latestVersion;
  if (!selected || typeof selected.version !== "string")
    throw new PluginMarketError("NOT_FOUND");
  if (selected.status && selected.status !== "approved") throw new PluginMarketError("NOT_FOUND");
  const name = typeof detail.name === "string" ? detail.name : "";
  if (!name) throw new PluginMarketError("BAD_PATH");
  return {
    id: pluginId,
    name,
    sides: sidesOf(detail.sides).length ? sidesOf(detail.sides) : sidesOf(selected.sides),
    selectedVersion: {
      version: selected.version,
      sides: sidesOf(selected.sides).length ? sidesOf(selected.sides) : sidesOf(detail.sides)
    }
  };
}

/** Adds one npm package to this installation's dependencies. */
export async function installPanelPlugin(detail: MarketPluginDetail): Promise<NpmPluginRecord> {
  try {
    return await installNpmPlugin({
      name: detail.name,
      pluginId: detail.id,
      version: detail.selectedVersion.version,
      side: "panel"
    });
  } catch (error: any) {
    if (String(error?.message).startsWith("BUNDLED:")) throw new PluginMarketError("BUNDLED");
    throw error;
  }
}

/** Removes one project-installed npm plugin from this installation. */
export async function uninstallPanelPlugin(pluginId: string): Promise<NpmPluginRecord | null> {
  try {
    return await uninstallNpmPlugin(pluginId);
  } catch (error: any) {
    if (String(error?.message).startsWith("BUNDLED:")) throw new PluginMarketError("BUNDLED");
    throw error;
  }
}
