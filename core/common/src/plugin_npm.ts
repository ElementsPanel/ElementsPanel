import { spawn } from "child_process";
import fs from "fs-extra";
import path from "path";
import { createRequire } from "module";
import { discoverPlugins, readPluginManifest, resolvePluginEntry } from "./plugin_manifest";
import { validatePluginCompatibility } from "./plugin_contract";
// @ts-ignore Shared by the source runtime and the published npm launcher.
import * as npmPlugins from "../../../scripts/runtime/npm-plugins.cjs";

/**
 * npm dependency management for plugins.
 *
 * Built-in and market plugins are dependencies of the installation's panel or
 * daemon directory. Each side owns its package.json, lockfile and npm operations.
 * The market only indexes npm packages; it never hosts the package files.
 *
 * `elementspanel.plugins` maps a plugin id to the npm package name, which is what
 * the runtime resolver reads. The runtime package lists built-in identities but
 * does not pin or install their versions.
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
  /** Whether the runtime identifies this package as a built-in plugin. */
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
  dependencyRoot: string;
}

export interface NpmRuntimeRecord {
  name: string;
  side: NpmPluginSide;
  version: string;
}

export interface NpmRuntimeUpdate extends NpmRuntimeRecord {
  latestVersion: string;
}

export interface NpmRuntimeUpdateService {
  readonly installed: NpmRuntimeRecord | null;
  check(): Promise<NpmRuntimeUpdate | null>;
  update(options: {
    version: string;
    reloadAfter?: Promise<void>;
  }): Promise<NpmRuntimeRecord & { restartRequired: boolean }>;
}

/** One package in a market update batch; runtime packages are installed last. */
export interface NpmPackageUpdate {
  name: string;
  version: string;
  pluginId?: string;
  runtime?: boolean;
}

export interface NpmPackageUpdateResult extends NpmPackageUpdate {
  error?: string;
}

export interface NpmUpdateBatchOptions {
  updates: NpmPackageUpdate[];
  /** Keep the running graph alive until the caller has delivered the whole batch result. */
  reloadAfter?: Promise<void>;
}

export interface NpmUpdateBatchResult {
  results: NpmPackageUpdateResult[];
  restartRequired: boolean;
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
  options: { packageRoot?: string; projectRoot?: string; side?: NpmPluginSide } = {}
): NpmPluginRoots {
  const packageRoot = path.resolve(options.packageRoot ?? currentPackageRoot());
  const projectRoot = path.resolve(options.projectRoot ?? currentProjectRoot(packageRoot));
  const host = readJson(path.join(packageRoot, "package.json"));
  const side =
    options.side ||
    stringValue(objectValue(host?.elementspanel)?.side) ||
    path.basename(packageRoot);
  return {
    packageRoot,
    projectRoot,
    dependencyRoot: path.dirname(
      npmPlugins.projectManifestFile(packageRoot, side, {
        projectRoot,
        runtimeDirectory: process.env.EPANEL_RUNTIME_ROOT
      })
    )
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
  const localRequire = createRequire(path.join(packageRoot, "package.json"));
  let manifestPath = (localRequire.resolve.paths(name) || [])
    .map((directory) => path.join(directory, name, "package.json"))
    .find((filename) => fs.existsSync(filename));
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
 * Built-in package names reserve their plugin ids. The side manifest selects
 * the installed versions; a package without that side is skipped.
 */
export function listNpmPlugins(
  side?: NpmPluginSide,
  options: { packageRoot?: string; projectRoot?: string; skipInvalid?: boolean } = {}
): NpmPluginRecord[] {
  const { packageRoot, projectRoot, dependencyRoot } = npmPluginRoots({ ...options, side });
  const records: NpmPluginRecord[] = [];
  for (const item of npmPlugins.resolveNpmPlugins(packageRoot, side, {
    projectRoot,
    runtimeDirectory: dependencyRoot,
    skipInvalid: options.skipInvalid
  })) {
    const metadata = readJson(path.join(item.packageRoot, "package.json"));
    if (!metadata) continue;
    const record = recordFromPackage(
      item.id,
      item.name,
      item.source,
      item.packageRoot,
      metadata,
      side
    );
    if (!record) {
      if (options.skipInvalid) continue;
      throw new Error(`Invalid ${side ?? "plugin"} entry in npm plugin ${item.name}.`);
    }
    records.push(record);
  }
  return records;
}

function runNpm(args: string[], cwd: string, timeout = 10 * 60 * 1000): Promise<string> {
  const action =
    args.find((argument) => argument === "install" || argument === "uninstall") || "operation";
  // Workers run with NODE_ENV=production. Keep npm from pruning development
  // dependencies such as @elementspanel/init during updates and rollbacks.
  if (action !== "operation") args = [...args, "--include=dev"];
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
    let errors = "";
    child.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
      if (output.length > 16000) output = output.slice(-16000);
    });
    child.stderr?.on("data", (data: Buffer) => {
      errors += data.toString();
      if (errors.length > 16000) errors = errors.slice(-16000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`npm ${action} timed out.`));
    }, timeout);
    timer.unref?.();
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(output);
      reject(new Error(`npm ${action} failed (${code}): ${output.trim()} ${errors.trim()}`));
    });
  });
}

const operationsKey = Symbol.for("elementspanel.npm.operations");
const shared = globalThis as typeof globalThis & {
  [operationsKey]?: Map<string, Promise<unknown>>;
};
const operations = (shared[operationsKey] ??= new Map<string, Promise<unknown>>());
const LOCK_NAME = ".elementspanel-npm.lock";
const RUNTIME_VERSION = /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/;

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

export function npmPluginOperationPending(side?: NpmPluginSide): boolean {
  const { dependencyRoot, projectRoot } = npmPluginRoots({ side });
  return (
    operations.size > 0 ||
    [dependencyRoot, projectRoot].some((root) => fs.existsSync(path.join(root, LOCK_NAME)))
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

/** Only a runtime owned by this installation project can be updated in place. */
export function npmRuntimePackage(
  side: NpmPluginSide,
  options: { packageRoot?: string; projectRoot?: string } = {}
): NpmRuntimeRecord | undefined {
  const { packageRoot, projectRoot } = npmPluginRoots({ ...options, side });
  const name = `@elementspanel/${side}`;
  const host = readJson(path.join(packageRoot, "package.json"));
  if (
    host?.name !== name ||
    objectValue(host.elementspanel)?.side !== side ||
    typeof host.version !== "string" ||
    !dependenciesOf(readProjectManifest(projectRoot))[name]
  )
    return;
  try {
    if (readPackageEntry(projectRoot, name).root !== fs.realpathSync(packageRoot)) return;
  } catch {
    return;
  }
  return { name, side, version: host.version };
}

/** Use npm's configured registry, including installation-specific mirrors. */
export async function latestNpmRuntimeVersion(side: NpmPluginSide): Promise<string> {
  if (side !== "panel" && side !== "daemon") throw new Error("Invalid runtime side.");
  const version: unknown = JSON.parse(
    await runNpm(
      [
        "view",
        `@elementspanel/${side}@latest`,
        "version",
        "--json",
        "--loglevel=error",
        "--fetch-retries=0",
        "--fetch-timeout=15000"
      ],
      currentProjectRoot(),
      20000
    )
  );
  if (typeof version !== "string" || !RUNTIME_VERSION.test(version))
    throw new Error(`Invalid ${side} release version.`);
  return version;
}

/** Runtime dependencies belong to the project root, separate from side plugins. */
export async function updateNpmRuntime(options: {
  side: NpmPluginSide;
  version: string;
  packageRoot?: string;
  projectRoot?: string;
}): Promise<NpmRuntimeRecord> {
  const { side, version } = options;
  if (side !== "panel" && side !== "daemon") throw new Error("Invalid runtime side.");
  if (!RUNTIME_VERSION.test(version)) throw new Error(`Invalid runtime version: ${version}`);
  const { projectRoot, dependencyRoot } = npmPluginRoots(options);
  return withProjectLock(projectRoot, async () => {
    const previous = npmRuntimePackage(side, options);
    if (!previous) throw new Error(`The ${side} runtime is not an installed project dependency.`);
    const previousPlugins = listNpmPlugins(side, { ...options, skipInvalid: true });
    const changedPlugins: NpmPluginRecord[] = [];
    const backups = new Map<string, Buffer | null>();
    for (const root of [projectRoot, dependencyRoot])
      for (const filename of ["package.json", "package-lock.json", "npm-shrinkwrap.json"]) {
        const target = path.join(root, filename);
        backups.set(target, fs.existsSync(target) ? fs.readFileSync(target) : null);
      }
    const install = (targetVersion: string) =>
      runNpm(
        [
          "--prefix",
          projectRoot,
          "install",
          `${previous.name}@${targetVersion}`,
          "--save",
          "--save-exact",
          "--no-fund",
          "--no-audit",
          "--ignore-scripts",
          "--workspaces=false"
        ],
        projectRoot
      );
    try {
      await install(version);
      const entry = readPackageEntry(projectRoot, previous.name);
      if (
        entry.metadata.name !== previous.name ||
        entry.metadata.version !== version ||
        objectValue(entry.metadata.elementspanel)?.side !== side
      )
        throw new Error(`The installed ${side} package does not match the requested release.`);
      for (const filename of [
        "app.js",
        "runtime/worker.cjs",
        ...(side === "panel" ? ["public/index.html"] : [])
      ]) {
        if (!fs.statSync(path.join(entry.root, filename)).isFile())
          throw new Error(`Incomplete ${side} runtime: missing ${filename}.`);
      }
      // Keep the runtime's identity and every essential installed plugin valid
      // before handing the installation back to the supervising launcher.
      const runtimePlugins = npmPlugins.resolveNpmPlugins(entry.root, side, {
        projectRoot,
        runtimeDirectory: dependencyRoot,
        development: false
      }) as Array<{ id: string; name: string; packageRoot: string }>;
      for (const id of [
        "i18n",
        "storage",
        "runtime",
        "server",
        ...(side === "panel" ? ["console"] : [])
      ]) {
        if (!runtimePlugins.some((plugin) => plugin.id === id))
          throw new Error(`Incomplete ${side} installation: missing npm plugin ${id}.`);
      }
      if (side === "panel") {
        const available = objectValue(entry.metadata.elementspanel)?.frontendAssets;
        for (const plugin of runtimePlugins) {
          const metadata = readJson(path.join(plugin.packageRoot, "package.json"));
          const expected = objectValue(objectValue(metadata?.elementspanel)?.panel)?.frontendAssets;
          const mismatched =
            expected !== undefined &&
            (!Array.isArray(expected) ||
              !Array.isArray(available) ||
              expected.some((file) => typeof file !== "string" || !available.includes(file)));
          if (!mismatched) continue;
          const original = previousPlugins.find((record) => record.name === plugin.name);
          if (!original || mappingsOf(entry.metadata)[plugin.id] !== plugin.name)
            throw new Error(
              `Frontend assets in plugin ${plugin.id} do not match the updated panel.`
            );
          // Built-in frontend plugins import shared assets from the panel. Bring
          // only those whose imports changed along with the runtime update.
          await installNpmPlugin({
            name: plugin.name,
            pluginId: plugin.id,
            version: "latest",
            side,
            packageRoot: entry.root,
            projectRoot
          });
          changedPlugins.push(original);
        }
      }
      return { name: previous.name, side, version };
    } catch (error) {
      try {
        await install(previous.version);
        const packageRoot = readPackageEntry(projectRoot, previous.name).root;
        for (const plugin of changedPlugins.reverse())
          await installNpmPlugin({
            name: plugin.name,
            pluginId: plugin.pluginId,
            version: plugin.version,
            side,
            packageRoot,
            projectRoot
          });
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

/** npm changes dependencies and lockfiles; only append our plugin mapping afterwards. */
export async function installNpmPlugin(options: InstallNpmPluginOptions): Promise<NpmPluginRecord> {
  const { name, side } = options;
  const version = options.version || "latest";
  if (!PACKAGE_NAME.test(name)) throw new Error(`Invalid npm plugin package: ${name}`);
  if (options.pluginId && !PLUGIN_ID.test(options.pluginId))
    throw new Error(`Invalid plugin id: ${options.pluginId}`);
  if (!VERSION.test(version)) throw new Error(`Invalid plugin version: ${version}`);
  const { packageRoot, projectRoot, dependencyRoot } = npmPluginRoots(options);
  return withProjectLock(dependencyRoot, async () => {
    const host = readJson(path.join(packageRoot, "package.json"));
    if (!host) throw new Error(`Missing runtime package metadata: ${packageRoot}`);
    const hostId = Object.entries(mappingsOf(host)).find(([, value]) => value === name)?.[0];
    const targetRoot = dependencyRoot;
    if (
      options.pluginId &&
      mappingsOf(host)[options.pluginId] &&
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
          "--ignore-scripts",
          "--workspaces=false"
        ],
        targetRoot
      );
      const entry = readPackageEntry(targetRoot, name);
      const pluginId =
        options.pluginId || stringValue(objectValue(entry.metadata.elementspanel)?.id);
      if (!PLUGIN_ID.test(pluginId)) throw new Error(`Invalid plugin id in ${name}.`);
      if (mappingsOf(host)[pluginId] && mappingsOf(host)[pluginId] !== name)
        throw new Error(`Plugin id ${pluginId} belongs to a bundled dependency.`);
      if (hostId && pluginId !== hostId)
        throw new Error(`The package ${name} changed its plugin id from ${hostId} to ${pluginId}.`);
      const mapped = mappingsOf(readProjectManifest(targetRoot))[pluginId];
      if (mapped !== undefined && mapped !== name)
        throw new Error(`Plugin id ${pluginId} is already installed as ${String(mapped)}.`);
      const record = recordFromPackage(
        pluginId,
        name,
        hostId ? "bundled" : "project",
        entry.root,
        entry.metadata,
        side
      );
      if (!record)
        throw new Error(`The package ${name} does not provide a ${side} plugin named ${pluginId}.`);
      if (side === "panel") {
        const expected = objectValue(objectValue(entry.metadata.elementspanel)?.panel)
          ?.frontendAssets;
        const available = objectValue(host.elementspanel)?.frontendAssets;
        if (
          (hostId || expected !== undefined) &&
          (!Array.isArray(expected) ||
            !Array.isArray(available) ||
            expected.some((file) => typeof file !== "string" || !available.includes(file)))
        )
          throw new Error(
            `Frontend assets in ${name} do not match this panel. Update the panel or install a matching plugin version.`
          );
      }
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
                "--ignore-scripts",
                "--workspaces=false"
              ]
            : [
                "--prefix",
                targetRoot,
                "uninstall",
                name,
                "--no-fund",
                "--no-audit",
                "--ignore-scripts",
                "--workspaces=false"
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
  options: { packageRoot?: string; projectRoot?: string; side?: NpmPluginSide } = {}
): Promise<NpmPluginRecord | null> {
  if (!PLUGIN_ID.test(pluginId)) throw new Error(`Invalid plugin id: ${pluginId}`);
  if (isEssentialNpmPlugin(pluginId))
    throw new Error(`The essential plugin "${pluginId}" cannot be uninstalled.`);
  const { packageRoot, projectRoot, dependencyRoot } = npmPluginRoots(options);
  return withProjectLock(dependencyRoot, async () => {
    const targetRoot = dependencyRoot;
    const manifest = readProjectManifest(targetRoot);
    const name =
      mappingsOf(manifest)[pluginId] ??
      listNpmPlugins(options.side, { packageRoot, projectRoot, skipInvalid: true }).find(
        (item) => item.pluginId === pluginId
      )?.name;
    if (typeof name !== "string" || !PACKAGE_NAME.test(name)) return null;
    const record = listNpmPlugins(options.side, {
      packageRoot,
      projectRoot,
      skipInvalid: true
    }).find((item) => item.pluginId === pluginId);
    await runNpm(
      [
        "--prefix",
        targetRoot,
        "uninstall",
        name,
        "--no-fund",
        "--no-audit",
        "--ignore-scripts",
        "--workspaces=false"
      ],
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
