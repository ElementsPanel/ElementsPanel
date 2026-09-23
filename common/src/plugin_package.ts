import fs from "fs-extra";
import path from "path";
import { readPluginManifest, resolvePluginEntry } from "./plugin_manifest";
import { validatePluginCompatibility } from "./plugin_contract";
export { PLUGIN_API_VERSION, validatePluginCompatibility } from "./plugin_contract";

export const MARKET_INSTALL_MARKER = ".market-install.json";

export class PluginPackageError extends Error {}

export interface PluginInstallation {
  pluginId: string;
  name: string;
  version: string;
  installedAt: number;
}

export interface PluginPackageFile {
  relative: string;
  content: Buffer;
}

export function pluginPackageDirectory(root: string, name: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) {
    throw new PluginPackageError("BAD_PATH");
  }
  return path.join(root, name);
}

async function assertNoLinks(root: string, target: string) {
  let current = root;
  for (const segment of ["", ...path.relative(root, target).split(path.sep)]) {
    current = path.join(current, segment);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new PluginPackageError("BAD_PATH");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function owner(directory: string): Promise<string | undefined> {
  try {
    const marker = path.join(directory, MARKET_INSTALL_MARKER);
    if (!(await fs.lstat(marker)).isFile()) return undefined;
    const data = JSON.parse(await fs.readFile(marker, "utf8"));
    return typeof data?.pluginId === "string" ? data.pluginId : undefined;
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT")
      return undefined;
    throw error;
  }
}

async function validateManifest(directory: string): Promise<void> {
  const filename = path.join(directory, "plugin.json");
  if (!(await fs.pathExists(filename)) || !(await fs.stat(filename)).isFile()) {
    throw new PluginPackageError("EMPTY_PACKAGE");
  }
  const manifest = readPluginManifest(directory);
  if (!manifest) throw new PluginPackageError("EMPTY_PACKAGE");
  validatePluginCompatibility(manifest.elements);
  // Do not execute downloaded code during installation. A declared entry must
  // resolve to a file inside this candidate, using the loader's path rules.
  for (const field of ["panel", "daemon", "backend", "main", "entry", "frontend", "ui"]) {
    if (typeof manifest[field] !== "string") continue;
    const entry = resolvePluginEntry(directory, manifest, { entryFields: [field] });
    if (!entry || !(await fs.stat(entry)).isFile()) {
      throw new PluginPackageError("EMPTY_PACKAGE");
    }
  }
}

const operations = new Map<string, Promise<void>>();

async function withDirectoryLock<T>(directory: string, operation: () => Promise<T>): Promise<T> {
  const key = process.platform === "win32" ? directory.toLowerCase() : directory;
  const result = (operations.get(key) ?? Promise.resolve()).then(operation);
  const settled = result.then(
    () => {},
    () => {}
  );
  operations.set(key, settled);
  try {
    return await result;
  } finally {
    if (operations.get(key) === settled) operations.delete(key);
  }
}

/** Replace only an owned package, keeping the previous release intact on failure. */
export async function writePluginPackage(
  root: string,
  info: PluginInstallation,
  files: readonly PluginPackageFile[],
  existingRoots: readonly string[] = []
): Promise<string> {
  root = path.resolve(root);
  const directory = pluginPackageDirectory(root, info.name);
  return withDirectoryLock(directory, async () => {
    if (!info.pluginId) throw new PluginPackageError("EMPTY_PACKAGE");
    const seen = new Set<string>();
    const relativeFiles = files.map((file) => {
      const segments = file.relative.split(/[\\/]/);
      if (
        segments.some(
          (segment) =>
            !segment ||
            segment === "." ||
            segment === ".." ||
            /[\x00-\x1f:<>"|?*]/.test(segment) ||
            /[. ]$/.test(segment) ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)
        )
      ) {
        throw new PluginPackageError("BAD_PATH");
      }
      const relative = segments.join(path.sep);
      const key = relative.toLowerCase();
      if (key === MARKET_INSTALL_MARKER || seen.has(key)) throw new PluginPackageError("BAD_PATH");
      seen.add(key);
      return relative;
    });
    await assertNoLinks(root, directory);
    const exists = await fs.pathExists(directory);
    if (exists && (await owner(directory)) !== info.pluginId)
      throw new PluginPackageError("DIR_TAKEN");
    if (!files.length) throw new PluginPackageError("EMPTY_PACKAGE");
    for (const relative of relativeFiles) await assertNoLinks(root, path.join(directory, relative));

    await fs.ensureDir(root);
    // Neither the staging root nor its backup is a discoverable plugin: the
    // loader only reads plugin.json from immediate children of the plugin root.
    const staging = await fs.mkdtemp(path.join(root, ".install-"));
    const candidate = path.join(staging, "package");
    const previous = path.join(staging, "previous");
    let keepBackup = false;
    try {
      for (const [index, file] of files.entries()) {
        await fs.outputFile(path.join(candidate, relativeFiles[index]), file.content);
      }
      await validateManifest(candidate);
      const manifest = readPluginManifest(candidate)!;
      for (const installedRoot of existingRoots) {
        if (!(await fs.pathExists(installedRoot))) continue;
        for (const item of await fs.readdir(installedRoot, { withFileTypes: true })) {
          if (!item.isDirectory()) continue;
          const existingDirectory = path.join(installedRoot, item.name);
          const existing = readPluginManifest(existingDirectory);
          if (
            !existing ||
            (existing.id !== manifest.id && item.name.toLowerCase() !== info.name.toLowerCase())
          )
            continue;
          if ((await owner(existingDirectory)) !== info.pluginId)
            throw new PluginPackageError("DIR_TAKEN");
        }
      }
      await fs.outputFile(
        path.join(candidate, MARKET_INSTALL_MARKER),
        JSON.stringify(info, null, 2)
      );
      if (exists) await fs.rename(directory, previous);
      try {
        await fs.rename(candidate, directory);
      } catch (error) {
        if (exists) {
          try {
            await fs.rename(previous, directory);
          } catch (rollbackError) {
            keepBackup = true;
            throw new Error(
              `Plugin replacement failed; previous release retained at ${previous}: ${rollbackError}`
            );
          }
        }
        throw error;
      }
      return directory;
    } finally {
      if (!keepBackup)
        await fs
          .remove(staging)
          .catch((error) => console.warn("Plugin staging cleanup failed:", error));
    }
  });
}

/** A missing installation is already removed; a different owner is never removed. */
export async function removePluginPackage(
  root: string,
  name: string,
  pluginId: string
): Promise<void> {
  root = path.resolve(root);
  const directory = pluginPackageDirectory(root, name);
  await withDirectoryLock(directory, async () => {
    await assertNoLinks(root, directory);
    if (!(await fs.pathExists(directory))) return;
    if (!pluginId || (await owner(directory)) !== pluginId)
      throw new PluginPackageError("DIR_TAKEN");
    await fs.remove(directory);
  });
}
