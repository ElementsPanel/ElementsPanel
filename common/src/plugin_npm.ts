import { spawn } from "child_process";
import fs from "fs-extra";
import path from "path";
import { createRequire } from "module";

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
  /** Bundled plugins ship inside the runtime package and cannot be removed here. */
  source: "bundled" | "project";
}

export interface InstallNpmPluginOptions {
  name: string;
  pluginId: string;
  version: string;
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
const VERSION = /^[0-9][^\s/]{0,63}$/;

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
  return path.resolve(process.env.EPANEL_PACKAGE_ROOT || process.cwd());
}

export function currentProjectRoot(packageRoot = currentPackageRoot()): string {
  // The npm worker sets EPANEL_PROJECT_ROOT to the installation directory. In a
  // development checkout the runtime package sits directly under the project.
  return path.resolve(process.env.EPANEL_PROJECT_ROOT || path.resolve(packageRoot, ".."));
}

export function npmPluginRoots(options: { packageRoot?: string; projectRoot?: string } = {}): NpmPluginRoots {
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
  const hostRequire = createRequire(path.join(packageRoot, "package.json"));
  const manifestPath = hostRequire.resolve(`${name}/package.json`);
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
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return undefined;
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
  if (!directory || !folder) return undefined;
  return {
    ...pluginRecord(pluginId, name, source, packageRoot, directory, folder, version),
    sides
  };
}

/**
 * Every npm plugin the runtime can load for a side, built-in and project-installed.
 *
 * Built-in mappings win over a project mapping for the same id: a third-party
 * package must not shadow a plugin that ships with the runtime. A project package
 * that does not describe the requested side is skipped instead of failing, which
 * is what lets a two-sided project share one dependency list between sides.
 */
export function listNpmPlugins(
  side?: NpmPluginSide,
  options: { packageRoot?: string; projectRoot?: string; skipInvalid?: boolean } = {}
): NpmPluginRecord[] {
  const { packageRoot, projectRoot } = npmPluginRoots(options);
  const host = readJson(path.join(packageRoot, "package.json"));
  if (!host) throw new Error(`Missing runtime package metadata: ${packageRoot}`);
  const project = path.resolve(projectRoot) === path.resolve(packageRoot) ? null : readProjectManifest(projectRoot);

  const hostMappings = mappingsOf(host);
  const projectMappings = mappingsOf(project);
  const mappings = new Map<string, { name: string; source: NpmPluginRecord["source"] }>();
  for (const [pluginId, name] of Object.entries(projectMappings)) {
    if (!PLUGIN_ID.test(pluginId) || typeof name !== "string" || !PACKAGE_NAME.test(name)) continue;
    mappings.set(pluginId, { name, source: "project" });
  }
  for (const [pluginId, name] of Object.entries(hostMappings)) {
    if (!PLUGIN_ID.test(pluginId) || typeof name !== "string" || !PACKAGE_NAME.test(name)) continue;
    mappings.set(pluginId, { name, source: "bundled" });
  }

  const hostDependencies = dependenciesOf(host);
  const projectDependencies = dependenciesOf(project);
  const folders = new Set<string>();
  const records: NpmPluginRecord[] = [];
  for (const [pluginId, mapping] of mappings) {
    const declared = hostDependencies[mapping.name] ?? projectDependencies[mapping.name];
    if (declared === undefined) {
      if (options.skipInvalid) continue;
      throw new Error(`Missing npm plugin dependency: ${mapping.name}. Run npm install in the project directory.`);
    }
    let entry: { root: string; metadata: Record<string, unknown> };
    try {
      entry = readPackageEntry(packageRoot, mapping.name);
    } catch (error) {
      if (options.skipInvalid) continue;
      throw error;
    }
    const record = recordFromPackage(pluginId, mapping.name, mapping.source, entry.root, entry.metadata, side);
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
            args: ["/d", "/s", "/c", `npm ${args.map((item) => `"${item.replace(/"/g, '""')}"`).join(" ")}`],
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
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`npm ${args[0] ?? ""} timed out.`));
    }, 10 * 60 * 1000);
    timer.unref?.();
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(output);
      reject(new Error(`npm ${args[0] ?? ""} failed (${code}): ${output.trim()}`));
    });
  });
}

const operations = new Map<string, Promise<unknown>>();

function withProjectLock<T>(projectRoot: string, operation: () => Promise<T>): Promise<T> {
  const key = process.platform === "win32" ? projectRoot.toLowerCase() : projectRoot;
  const previous = operations.get(key) ?? Promise.resolve();
  const result = previous.then(operation);
  const settled = result.then(
    () => {},
    () => {}
  );
  operations.set(key, settled);
  return result.finally(() => {
    if (operations.get(key) === settled) operations.delete(key);
  }) as Promise<T>;
}

/**
 * Installs (or updates) one npm plugin as a project dependency.
 *
 * The version is pinned with `--save-exact`: the panel performs updates, so a
 * later bare `npm install` must not silently move the plugin to another release.
 */
export async function installNpmPlugin(
  options: InstallNpmPluginOptions
): Promise<NpmPluginRecord> {
  const { name, pluginId, version, side } = options;
  if (!PLUGIN_ID.test(pluginId)) throw new Error(`Invalid plugin id: ${pluginId}`);
  if (!PACKAGE_NAME.test(name)) throw new Error(`Invalid npm plugin package: ${name}`);
  if (!VERSION.test(version)) throw new Error(`Invalid plugin version: ${version}`);
  const { packageRoot, projectRoot } = npmPluginRoots(options);

  return withProjectLock(projectRoot, async () => {
    const host = readJson(path.join(packageRoot, "package.json"));
    if (!host) throw new Error(`Missing runtime package metadata: ${packageRoot}`);
    if (mappingsOf(host)[pluginId] !== undefined)
      throw new Error(`BUNDLED:${pluginId}`);
    const existing = mappingsOf(readProjectManifest(projectRoot))[pluginId];
    if (existing !== undefined && existing !== name)
      throw new Error(`Plugin id ${pluginId} is already installed as ${String(existing)}.`);

    await fs.ensureDir(projectRoot);
    await runNpm(
      ["install", `${name}@${version}`, "--save", "--save-exact", "--no-fund", "--no-audit", "--ignore-scripts"],
      projectRoot
    );

    let entry: { root: string; metadata: Record<string, unknown> };
    try {
      entry = readPackageEntry(packageRoot, name);
    } catch (error) {
      await runNpm(["uninstall", name, "--no-fund", "--no-audit", "--ignore-scripts"], projectRoot).catch(() => {});
      throw error;
    }
    const record = recordFromPackage(pluginId, name, "project", entry.root, entry.metadata, side);
    if (!record) {
      await runNpm(["uninstall", name, "--no-fund", "--no-audit", "--ignore-scripts"], projectRoot).catch(() => {});
      throw new Error(`The package ${name} does not provide a ${side} plugin named ${pluginId}.`);
    }
    if (record.version !== version) {
      await runNpm(["uninstall", name, "--no-fund", "--no-audit", "--ignore-scripts"], projectRoot).catch(() => {});
      throw new Error(`The installed package ${name} is ${record.version}, expected ${version}.`);
    }

    const manifest = readProjectManifest(projectRoot);
    const dependencies = { ...dependenciesOf(manifest), [name]: version };
    const elementspanel = { ...(objectValue(manifest.elementspanel) ?? {}) };
    const plugins = { ...mappingsOf(manifest), [pluginId]: name };
    manifest.dependencies = dependencies;
    manifest.elementspanel = { ...elementspanel, plugins };
    writeProjectManifest(projectRoot, manifest);
    return record;
  });
}

/** Removes one project-installed npm plugin. Built-in packages are left alone. */
export async function uninstallNpmPlugin(
  pluginId: string,
  options: { packageRoot?: string; projectRoot?: string } = {}
): Promise<NpmPluginRecord | null> {
  if (!PLUGIN_ID.test(pluginId)) throw new Error(`Invalid plugin id: ${pluginId}`);
  const { packageRoot, projectRoot } = npmPluginRoots(options);
  return withProjectLock(projectRoot, async () => {
    const host = readJson(path.join(packageRoot, "package.json"));
    if (host && mappingsOf(host)[pluginId] !== undefined) throw new Error(`BUNDLED:${pluginId}`);
    const manifest = readProjectManifest(projectRoot);
    const name = mappingsOf(manifest)[pluginId];
    if (typeof name !== "string" || !PACKAGE_NAME.test(name)) return null;

    const record = listNpmPlugins(undefined, { packageRoot, projectRoot, skipInvalid: true }).find(
      (item) => item.pluginId === pluginId
    );
    await runNpm(["uninstall", name, "--no-fund", "--no-audit", "--ignore-scripts"], projectRoot);

    const plugins = { ...mappingsOf(manifest) };
    delete plugins[pluginId];
    const elementspanel = { ...(objectValue(manifest.elementspanel) ?? {}) };
    if (Object.keys(plugins).length) elementspanel.plugins = plugins;
    else delete elementspanel.plugins;
    manifest.elementspanel = elementspanel;
    writeProjectManifest(projectRoot, manifest);
    return record ?? null;
  });
}
