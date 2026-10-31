import { spawn } from "child_process";
import fs from "fs-extra";
import path from "path";
import { createRequire } from "module";
import { discoverPlugins, readPluginManifest, resolvePluginEntry } from "./plugin_manifest";
import { validatePluginCompatibility } from "./plugin_contract";

/**
 * npm dependency management for plugins.
 *
 * A plugin installed from the market is a normal dependency of the installation
 * project: it is written into the project's `package.json`, installed by npm and
 * then resolved by the runtime like any other npm plugin. The market only indexes
 * npm packages; it never hosts the package files.
 *
 * `elementspanel.plugins` maps a plugin id to the npm package name, which is what
 * the runtime resolver reads. A project plugin lives next to the built-in plugins
 * of the runtime package and is loaded through the same path.
 */

export type NpmPluginSide = "panel" | "daemon";

export interface NpmPluginRecord {
  pluginId: string;
  /** The npm package name, e.g. `epanel-plugin-example`. */
  name: string;
  version: string;
  sides: NpmPluginSide[];
  /** The directory the loader discovers for the requested side. */
  directory: string;
  /** The asset folder name the plug-in declares (unique per side). */
  folder: string;
  packageRoot: string;
  /** The manifest that owns this dependency: runtime package or installation project. */
  source: "bundled" | "project";
}

export interface InstallNpmPluginOptions {
  name: string;
  pluginId?: string;
  version?: string;
  side: NpmPluginSide;
  packageRoot?: string;
  projectRoot?: string;
}

export interface NpmPluginRoots {
  packageRoot: string;
  projectRoot: string;
}

const PLUGIN_ID = /^[a-z][a-z0-9_-]{1,63}$/;
const PACKAGE_NAME = /^(?:@[a-z0-9_.-]+\/)?epanel-plugin-[a-z0-9_.-]+$/;
const VERSION = /^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$/;

function readJson(filename: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filename, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function currentPackageRoot(): string {
  return path.resolve(
    process.env.EPANEL_PACKAGE_ROOT || process.env.EPANEL_SOURCE_ROOT || process.cwd()
  );
}

export function currentProjectRoot(packageRoot = currentPackageRoot()): string {
  // The npm worker sets EPANEL_PROJECT_ROOT to the installation directory. In a
  // development checkout the runtime package sits directly under the project.
  if (process.env.EPANEL_PROJECT_ROOT) return path.resolve(process.env.EPANEL_PROJECT_ROOT);
  const scope = path.resolve(packageRoot, "..");
  if (path.basename(scope) === "core") return path.dirname(scope);
  const nodeModules = path.dirname(scope);
  if (path.basename(nodeModules) === "node_modules" && path.basename(scope).startsWith("@"))
    return path.dirname(nodeModules);
  return scope;
}

export function npmPluginRoots(
  options: { packageRoot?: string; projectRoot?: string } = {}
): NpmPluginRoots {
  const packageRoot = path.resolve(options.packageRoot ?? currentPackageRoot());
  return {
    packageRoot,
    projectRoot: path.resolve(options.projectRoot ?? currentProjectRoot(packageRoot))
  };
}

function projectManifestFile(projectRoot: string): string {
  return path.join(projectRoot, "package.json");
}

function readProjectManifest(projectRoot: string): Record<string, unknown> {
  return (
    readJson(projectManifestFile(projectRoot)) ?? {
      private: true,
      dependencies: {},
      elementspanel: { plugins: {} }
    }
  );
}

function writeProjectManifest(projectRoot: string, manifest: Record<string, unknown>): void {
  fs.writeFileSync(projectManifestFile(projectRoot), `${JSON.stringify(manifest, null, 2)}\n`);
}

function dependenciesOf(manifest: Record<string, unknown> | null): Record<string, unknown> {
  return objectValue(manifest?.dependencies) ?? {};
}

function mappingsOf(manifest: Record<string, unknown> | null): Record<string, unknown> {
  return objectValue(objectValue(manifest?.elementspanel)?.plugins) ?? {};
}

function pluginRecord(
  pluginId: string,
  name: string,
  source: NpmPluginRecord["source"],
  packageRoot: string,
  directory: string,
  folder: string,
  version: string
): NpmPluginRecord {
  return { pluginId, name, version, sides: [], directory, folder, packageRoot, source };
}

function readPackageEntry(
  packageRoot: string,
  name: string
): { root: string; metadata: Record<string, unknown> } {
  // Read package boundaries directly: Node caches require.resolve() paths even
  // after npm moves an installation between nested and hoisted node_modules.
  let manifestPath: string | undefined;
  for (const root of [packageRoot, currentProjectRoot(packageRoot)]) {
    const localRequire = createRequire(path.join(root, "package.json"));
    manifestPath = (localRequire.resolve.paths(name) || [])
      .map((directory) => path.join(directory, name, "package.json"))
      .find((filename) => fs.existsSync(filename));
    if (manifestPath) break;
  }
  if (!manifestPath) throw new Error(`Missing npm plugin package: ${name}.`);
  manifestPath = fs.realpathSync(manifestPath);
  const metadata = readJson(manifestPath);
  if (!metadata) throw new Error(`Missing package metadata for ${name}.`);
  return { root: path.dirname(manifestPath), metadata };
}

function sideDirectory(
  packageRoot: string,
  metadata: Record<string, unknown>,
  side: NpmPluginSide
): string | undefined {
  const elements = objectValue(metadata.elementspanel);
  const definition = objectValue(elements?.[side]);
  const directory = stringValue(definition?.directory);
  if (!definition || !directory) return undefined;
  const target = path.resolve(packageRoot, directory);
  const relative = path.relative(packageRoot, target);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    return undefined;
  return target;
}

function recordFromPackage(
  pluginId: string,
  name: string,
  source: NpmPluginRecord["source"],
  packageRoot: string,
  metadata: Record<string, unknown>,
  side?: NpmPluginSide
): NpmPluginRecord | undefined {
  const elements = objectValue(metadata.elementspanel);
  if (!elements || elements.id !== pluginId) return undefined;
  const version = stringValue(metadata.version);
  const sides = (["panel", "daemon"] as const).filter((item) =>
    Boolean(sideDirectory(packageRoot, metadata, item))
  );
  if (!sides.length) return undefined;
  const target = side ?? sides[0]!;
  if (!sides.includes(target)) return undefined;
  const directory = sideDirectory(packageRoot, metadata, target);
  const folder = stringValue(objectValue(elements[target])?.folder);
  if (!directory || !PLUGIN_ID.test(folder)) return undefined;
  return {
    ...pluginRecord(pluginId, name, source, packageRoot, directory, folder, version),
    sides
  };
}

/**
 * Every npm plugin the runtime can load for a side, built-in and project-installed.
 *
 * Built-in package names win over a project mapping for the same id. An explicit
 * project dependency on that same package selects the user's installed version.
 * A project package that does not describe the requested side is skipped instead of failing, which
 * is what lets a two-sided project share one dependency list between sides.
 */
export function listNpmPlugins(
  side?: NpmPluginSide,
  options: { packageRoot?: string; projectRoot?: string; skipInvalid?: boolean } = {}
): NpmPluginRecord[] {
  const { packageRoot, projectRoot } = npmPluginRoots(options);
  const host = readJson(path.join(packageRoot, "package.json"));
  if (!host) throw new Error(`Missing runtime package metadata: ${packageRoot}`);
  const project =
    path.resolve(projectRoot) === path.resolve(packageRoot)
      ? null
      : readProjectManifest(projectRoot);

  const hostMappings = mappingsOf(host);
  const projectMappings = { ...mappingsOf(project) };
  for (const name of Object.keys(dependenciesOf(project))) {
    if (!PACKAGE_NAME.test(name) || Object.values(projectMappings).includes(name)) continue;
    try {
      const entry = readPackageEntry(projectRoot, name);
      const id = stringValue(objectValue(entry.metadata.elementspanel)?.id);
      if (PLUGIN_ID.test(id) && projectMappings[id] === undefined) projectMappings[id] = name;
    } catch {
      /* npm may still be writing the package. */
    }
  }
  const mappings = new Map<string, { name: string; source: NpmPluginRecord["source"] }>();
  for (const [pluginId, name] of Object.entries(projectMappings)) {
    if (!PLUGIN_ID.test(pluginId) || typeof name !== "string" || !PACKAGE_NAME.test(name)) continue;
    mappings.set(pluginId, { name, source: "project" });
  }
  for (const [pluginId, name] of Object.entries(hostMappings)) {
    if (!PLUGIN_ID.test(pluginId) || typeof name !== "string" || !PACKAGE_NAME.test(name)) continue;
    if (dependenciesOf(host)[name] === undefined) continue;
    mappings.set(pluginId, {
      name,
      source: dependenciesOf(project)[name] === undefined ? "bundled" : "project"
    });
  }

  const hostDependencies = dependenciesOf(host);
  const projectDependencies = dependenciesOf(project);
  const folders = new Set<string>();
  const records: NpmPluginRecord[] = [];
  for (const [pluginId, mapping] of mappings) {
    const declared = hostDependencies[mapping.name] ?? projectDependencies[mapping.name];
    if (declared === undefined) {
      if (options.skipInvalid) continue;
      throw new Error(
        `Missing npm plugin dependency: ${mapping.name}. Run npm install in the project directory.`
      );
    }
    let entry: { root: string; metadata: Record<string, unknown> };
    try {
      entry = readPackageEntry(
        mapping.source === "project" ? projectRoot : packageRoot,
        mapping.name
      );
    } catch (error) {
      if (options.skipInvalid) continue;
      throw error;
    }
    const record = recordFromPackage(
      pluginId,
      mapping.name,
      mapping.source,
      entry.root,
      entry.metadata,
      side
    );
    if (!record) {
      if (options.skipInvalid || mapping.source === "project") continue;
      throw new Error(`Invalid ${side ?? "plugin"} entry in npm plugin ${mapping.name}.`);
    }
    const folder = record.folder;
    if (folders.has(folder)) {
      if (options.skipInvalid) continue;
      throw new Error(`Duplicate npm plugin asset directory: ${folder}.`);
    }
    folders.add(folder);
    records.push(record);
  }
  return records;
}

function runNpm(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const npmCLI = process.env.npm_execpath;
    const invocation =
      npmCLI && /npm(?:-cli)?\.(?:c?js|mjs)$/.test(npmCLI)
        ? { command: process.execPath, args: [npmCLI, ...args], shell: false }
        : process.platform === "win32"
        ? {
            command: process.env.ComSpec || "cmd.exe",
            args: [
              "/d",
              "/s",
              "/c",
              `npm ${args.map((item) => `"${item.replace(/"/g, '""')}"`).join(" ")}`
            ],
            shell: false
          }
        : { command: "npm", args, shell: false };
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      shell: invocation.shell,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, npm_config_update_notifier: "false" }
    });
    let output = "";
    const append = (data: Buffer) => {
      output += data.toString();
      if (output.length > 16000) output = output.slice(-16000);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    const action =
      args.find((argument) => argument === "install" || argument === "uninstall") || "operation";
    const timer = setTimeout(
      () => {
        child.kill("SIGKILL");
        reject(new Error(`npm ${action} timed out.`));
      },
      10 * 60 * 1000
    );
    timer.unref?.();
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(output);
      reject(new Error(`npm ${action} failed (${code}): ${output.trim()}`));
    });
  });
}

const operationsKey = Symbol.for("elementspanel.npm.operations");
const shared = globalThis as typeof globalThis & {
  [operationsKey]?: Map<string, Promise<unknown>>;
};
const operations = (shared[operationsKey] ??= new Map<string, Promise<unknown>>());
const LOCK_NAME = ".elementspanel-npm.lock";

async function acquireProjectLock(projectRoot: string) {
  await fs.ensureDir(projectRoot);
  const directory = path.join(projectRoot, LOCK_NAME);
  const deadline = Date.now() + 11 * 60 * 1000;
  while (true) {
    try {
      await fs.mkdir(directory);
      await fs.writeJson(path.join(directory, "owner.json"), { pid: process.pid });
      return () => fs.remove(directory);
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
      try {
        const owner = await fs.readJson(path.join(directory, "owner.json"));
        try {
          process.kill(owner.pid, 0);
        } catch (failure: any) {
          if (failure.code === "ESRCH") {
            await fs.remove(directory);
            continue;
          }
        }
      } catch {
        if (
          Date.now() - ((await fs.stat(directory).catch(() => null))?.mtimeMs ?? Date.now()) >
          60_000
        ) {
          await fs.remove(directory);
          continue;
        }
      }
      if (Date.now() > deadline) throw new Error("Another npm plugin operation is still running.");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

export function npmPluginOperationPending(): boolean {
  const { packageRoot, projectRoot } = npmPluginRoots();
  return (
    operations.size > 0 ||
    [packageRoot, projectRoot].some((root) => fs.existsSync(path.join(root, LOCK_NAME)))
  );
}

function withProjectLock<T>(projectRoot: string, operation: () => Promise<T>): Promise<T> {
  const key = process.platform === "win32" ? projectRoot.toLowerCase() : projectRoot;
  const previous = operations.get(key) ?? Promise.resolve();
  const result = previous.then(async () => {
    const release = await acquireProjectLock(projectRoot);
    try {
      return await operation();
    } finally {
      await release();
    }
  });
  const settled = result.then(
    () => {},
    () => {}
  );
  operations.set(key, settled);
  return result.finally(() => {
    if (operations.get(key) === settled) operations.delete(key);
  }) as Promise<T>;
}

/** Core services keep the connection and management interface available. */
export function isEssentialNpmPlugin(pluginId: string) {
  return ["i18n", "storage", "runtime", "server", "console", "config"].includes(pluginId);
}

/** npm changes dependencies and lockfiles; only append our plugin mapping afterwards. */
export async function installNpmPlugin(options: InstallNpmPluginOptions): Promise<NpmPluginRecord> {
  const { name, side } = options;
  const version = options.version || "latest";
  if (!PACKAGE_NAME.test(name)) throw new Error(`Invalid npm plugin package: ${name}`);
  if (options.pluginId && !PLUGIN_ID.test(options.pluginId))
    throw new Error(`Invalid plugin id: ${options.pluginId}`);
  if (!VERSION.test(version)) throw new Error(`Invalid plugin version: ${version}`);
  const { packageRoot, projectRoot } = npmPluginRoots(options);
  return withProjectLock(projectRoot, async () => {
    const host = readJson(path.join(packageRoot, "package.json"));
    if (!host) throw new Error(`Missing runtime package metadata: ${packageRoot}`);
    const hostId = Object.entries(mappingsOf(host)).find(
      ([, value]) => value === name && dependenciesOf(host)[name] !== undefined
    )?.[0];
    const targetRoot =
      hostId && dependenciesOf(readProjectManifest(projectRoot))[name] === undefined
        ? packageRoot
        : projectRoot;
    if (
      options.pluginId &&
      mappingsOf(host)[options.pluginId] &&
      dependenciesOf(host)[String(mappingsOf(host)[options.pluginId])] !== undefined &&
      mappingsOf(host)[options.pluginId] !== name
    )
      throw new Error(`BUNDLED:${options.pluginId}`);
    const original = readProjectManifest(targetRoot);
    const previous = dependenciesOf(original)[name];
    let previousVersion = previous;
    if (previous) {
      try {
        previousVersion = readPackageEntry(targetRoot, name).metadata.version || previous;
      } catch {
        /* Keep the declared spec if the previous package is incomplete. */
      }
    }
    const backups = new Map<string, Buffer | null>();
    for (const filename of ["package.json", "package-lock.json", "npm-shrinkwrap.json"]) {
      const target = path.join(targetRoot, filename);
      backups.set(target, fs.existsSync(target) ? fs.readFileSync(target) : null);
    }
    try {
      await runNpm(
        [
          "--prefix",
          targetRoot,
          "install",
          `${name}@${version}`,
          "--save",
          "--save-exact",
          "--no-fund",
          "--no-audit",
          "--ignore-scripts"
        ],
        targetRoot
      );
      const entry = readPackageEntry(targetRoot, name);
      const pluginId =
        options.pluginId || stringValue(objectValue(entry.metadata.elementspanel)?.id);
      if (!PLUGIN_ID.test(pluginId)) throw new Error(`Invalid plugin id in ${name}.`);
      if (
        mappingsOf(host)[pluginId] &&
        dependenciesOf(host)[String(mappingsOf(host)[pluginId])] !== undefined &&
        mappingsOf(host)[pluginId] !== name
      )
        throw new Error(`Plugin id ${pluginId} belongs to a bundled dependency.`);
      if (hostId && pluginId !== hostId)
        throw new Error(`The package ${name} changed its plugin id from ${hostId} to ${pluginId}.`);
      const mapped = mappingsOf(readProjectManifest(targetRoot))[pluginId];
      if (mapped !== undefined && mapped !== name)
        throw new Error(`Plugin id ${pluginId} is already installed as ${String(mapped)}.`);
      const record = recordFromPackage(
        pluginId,
        name,
        targetRoot === packageRoot ? "bundled" : "project",
        entry.root,
        entry.metadata,
        side
      );
      if (!record)
        throw new Error(`The package ${name} does not provide a ${side} plugin named ${pluginId}.`);
      if (/^[0-9]/.test(version) && record.version !== version)
        throw new Error(`The installed package ${name} is ${record.version}, expected ${version}.`);
      if (
        !process.env.EPANEL_PACKAGE_ROOT &&
        discoverPlugins(path.join(packageRoot, "plugins"), {
          entryFields: [],
          includeDisabled: true
        }).some((plugin) => plugin.manifest.id === pluginId)
      )
        throw new Error(`Source plugin ${pluginId} cannot be replaced with an npm dependency.`);
      const manifest = readPluginManifest(record.directory);
      if (!manifest || manifest.id !== pluginId || manifest.version !== record.version)
        throw new Error(`The plugin manifest in ${name} does not match its package.`);
      validatePluginCompatibility(manifest.elements);
      for (const field of ["backend", "frontend", "panel", "daemon", "main", "entry", "ui"]) {
        if (
          typeof manifest[field] === "string" &&
          !resolvePluginEntry(record.directory, manifest, { entryFields: [field] })
        )
          throw new Error(`Invalid ${field} entry in ${name}.`);
      }
      const others = listNpmPlugins(side, { packageRoot, projectRoot, skipInvalid: true });
      if (others.some((plugin) => plugin.pluginId === pluginId && plugin.name !== name))
        throw new Error(`Plugin id ${pluginId} is already provided by another dependency.`);
      const collision = others.find(
        (plugin) => plugin.pluginId !== pluginId && plugin.folder === record.folder
      );
      if (collision)
        throw new Error(
          `Plugin asset directory ${record.folder} is already used by ${collision.name}.`
        );
      const updated = readProjectManifest(targetRoot);
      updated.dependencies = { ...dependenciesOf(updated), [name]: record.version };
      updated.elementspanel = {
        ...objectValue(updated.elementspanel),
        plugins: { ...mappingsOf(updated), [pluginId]: name }
      };
      writeProjectManifest(targetRoot, updated);
      return record;
    } catch (error) {
      try {
        await runNpm(
          previous
            ? [
                "--prefix",
                targetRoot,
                "install",
                `${name}@${String(previousVersion)}`,
                "--save",
                "--no-fund",
                "--no-audit",
                "--ignore-scripts"
              ]
            : [
                "--prefix",
                targetRoot,
                "uninstall",
                name,
                "--no-fund",
                "--no-audit",
                "--ignore-scripts"
              ],
          targetRoot
        );
      } catch (rollback) {
        throw new Error(`${String(error)}; npm rollback failed: ${String(rollback)}`);
      } finally {
        for (const [filename, content] of backups) {
          if (content === null) await fs.remove(filename);
          else await fs.writeFile(filename, content);
        }
      }
      throw error;
    }
  });
}

/** Remove the dependency from the manifest that owns it, preserving user configuration. */
export async function uninstallNpmPlugin(
  pluginId: string,
  options: { packageRoot?: string; projectRoot?: string } = {}
): Promise<NpmPluginRecord | null> {
  if (!PLUGIN_ID.test(pluginId)) throw new Error(`Invalid plugin id: ${pluginId}`);
  if (isEssentialNpmPlugin(pluginId))
    throw new Error(`The essential plugin "${pluginId}" cannot be uninstalled.`);
  const { packageRoot, projectRoot } = npmPluginRoots(options);
  return withProjectLock(projectRoot, async () => {
    const host = readJson(path.join(packageRoot, "package.json"));
    const bundledName = mappingsOf(host)[pluginId];
    const targetRoot =
      typeof bundledName === "string" &&
      dependenciesOf(host)[bundledName] !== undefined &&
      dependenciesOf(readProjectManifest(projectRoot))[bundledName] === undefined
        ? packageRoot
        : projectRoot;
    const manifest = readProjectManifest(targetRoot);
    const name =
      mappingsOf(manifest)[pluginId] ??
      listNpmPlugins(undefined, { packageRoot, projectRoot, skipInvalid: true }).find(
        (item) => item.pluginId === pluginId
      )?.name;
    if (typeof name !== "string" || !PACKAGE_NAME.test(name)) return null;
    const record = listNpmPlugins(undefined, { packageRoot, projectRoot, skipInvalid: true }).find(
      (item) => item.pluginId === pluginId
    );
    await runNpm(
      ["--prefix", targetRoot, "uninstall", name, "--no-fund", "--no-audit", "--ignore-scripts"],
      targetRoot
    );
    const updated = readProjectManifest(targetRoot);
    const plugins = { ...mappingsOf(updated) };
    delete plugins[pluginId];
    updated.elementspanel = { ...objectValue(updated.elementspanel), plugins };
    writeProjectManifest(targetRoot, updated);
    return record ?? null;
  });
}
