import { createHash, randomBytes } from "crypto";
import path from "path";
import { createRequire } from "module";
import axios from "axios";
import fs from "fs-extra";
import {
  listNpmPlugins,
  isEssentialNpmPlugin,
  npmPluginRoots,
  validatePluginCompatibility,
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
  state?: string;
  panelVersion?: string;
  daemonVersions: Record<string, string>;
  sides: PluginSide[];
  directories: string[];
  daemonIds: string[];
  /** Whether the dependency belongs to the runtime or the installation project. */
  source: "bundled" | "project";
  removable: boolean;
  updatable?: boolean;
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
    panelVersion: record.sides.includes("panel") ? record.version : undefined,
    daemonVersions: {},
    pluginId: record.pluginId,
    name: record.name,
    version: record.version,
    installedAt: 0,
    sides: record.sides,
    directories: [record.directory],
    daemonIds: [],
    source: record.source,
    updatable: true,
    removable: !isEssentialNpmPlugin(record.pluginId)
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
            daemonVersions: {},
            ...info,
            sides: ["daemon"],
            directories: [],
            daemonIds: [],
            source: "project",
            updatable: true,
            removable: true
          };
          found.set(info.pluginId, installed);
        }
        if (!installed.sides.includes("daemon")) installed.sides.push("daemon");
        if (!installed.daemonIds.includes(info.daemonId)) installed.daemonIds.push(info.daemonId);
        installed.daemonVersions[info.daemonId] = info.version;
      }
    }
  }

  return [...found.values()];
}

function sidesOf(value: unknown): PluginSide[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.filter((item): item is PluginSide => item === "panel" || item === "daemon"))
  ];
}

/** Read package versions without executing dependency code or using require's cache. */
export function panelDependencyVersions(detail: {
  name: string;
  versions?: Array<{
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  }>;
}): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  result.node = process.versions.node;
  const names = new Set<string>();
  for (const version of detail.versions ?? []) {
    for (const name of [
      ...Object.keys(version.dependencies ?? {}),
      ...Object.keys(version.peerDependencies ?? {})
    ])
      names.add(name);
  }
  if (!names.size) return result;
  const roots = npmPluginRoots();
  const plugin = listNpmPlugins(undefined, { skipInvalid: true }).find(
    (item) => item.name === detail.name
  );
  const searchRoots = [
    ...new Set(
      [plugin?.packageRoot, roots.projectRoot, roots.packageRoot].filter((root): root is string =>
        Boolean(root)
      )
    )
  ];
  for (const root of searchRoots) {
    try {
      const host = fs.readJsonSync(path.join(root, "package.json"));
      if (typeof host.name === "string" && typeof host.version === "string")
        result[host.name] = host.version;
    } catch {
      /* A dependency may be moving during npm work. */
    }
  }
  for (const name of names) {
    if (!/^(?:@[a-z0-9][a-z0-9_.-]*\/)?[a-z0-9][a-z0-9_.-]*$/.test(name)) continue;
    result[name] ||= "";
    for (const root of searchRoots) {
      const requireFromRoot = createRequire(path.join(root, "package.json"));
      for (const directory of requireFromRoot.resolve.paths(name) ?? []) {
        try {
          const metadata = fs.readJsonSync(path.join(directory, name, "package.json"));
          if (typeof metadata.version !== "string") continue;
          result[name] = metadata.version;
          break;
        } catch {
          /* Not installed at this resolution path. */
        }
      }
      if (result[name]) break;
    }
  }
  return result;
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
  if (!selected || typeof selected.version !== "string") throw new PluginMarketError("NOT_FOUND");
  if (version && selected.version !== version) throw new PluginMarketError("NOT_FOUND");
  if (selected.status && selected.status !== "approved") throw new PluginMarketError("NOT_FOUND");
  for (const contract of Object.values(selected.compatibility ?? {})) {
    try {
      validatePluginCompatibility(contract);
    } catch {
      throw new PluginMarketError("INCOMPATIBLE");
    }
  }
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
