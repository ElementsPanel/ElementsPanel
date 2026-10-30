import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pluginDirectoryRevision } from "./plugin_revision";

const REVISION = "epanelPluginRevision";
const graphs = new Map<string, string[]>();
const previousRoots = new Map<string, string[]>();
let hooksInstalled = false;
const sharedModules = new Set([
  "cordis",
  "@cordisjs/core",
  "@cordisjs/logger",
  "@cordisjs/timer",
  "@cordisjs/schema",
  "cosmokit",
  "schemastery",
  "reggol"
]);

function dependencyRoots(directory: string) {
  const visited = new Set([directory]);
  const walk = (root: string) => {
    const filename = path.join(root, "package.json");
    if (!fs.existsSync(filename)) return;
    const metadata = JSON.parse(fs.readFileSync(filename, "utf8"));
    const localRequire = createRequire(filename);
    for (const name of Object.keys({
      ...metadata.dependencies,
      ...metadata.optionalDependencies
    })) {
      if (sharedModules.has(name)) continue;
      const target = (localRequire.resolve.paths(name) || [])
        .map((directory) => path.join(directory, name, "package.json"))
        .find((candidate) => fs.existsSync(candidate));
      if (!target) continue;
      const dependency = fs.realpathSync(path.dirname(target));
      if (visited.has(dependency)) continue;
      visited.add(dependency);
      walk(dependency);
    }
  };
  walk(directory);
  visited.delete(directory);
  return [...visited];
}

/** Include transitive dependency versions so npm updates replace the affected graph. */
export function pluginBackendRevision(entry: string, directory: string): string {
  const hash = createHash("sha256").update(pluginDirectoryRevision(path.dirname(entry)));
  for (const root of [directory, ...dependencyRoots(directory)]) {
    const filename = path.join(root, "package.json");
    if (fs.existsSync(filename)) hash.update(root).update(fs.readFileSync(filename));
  }
  return hash.digest("hex").slice(0, 24);
}

function within(root: string, filename: string) {
  const relative = path.relative(root, filename);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

/** Clear the plugin's complete CJS graph, keeping shared host modules intact. */
export function forgetPluginModules(directory: string) {
  const runtimeRequire = eval("require") as NodeRequire;
  const owned = [directory, ...(previousRoots.get(directory) || []), ...dependencyRoots(directory)];
  previousRoots.delete(directory);
  const belongs = (filename: string) => {
    const parts = filename.split(`${path.sep}node_modules${path.sep}`);
    if (
      parts.slice(1).some((part) => {
        const name = part.startsWith("@")
          ? part.split(path.sep).slice(0, 2).join("/")
          : part.split(path.sep)[0];
        return sharedModules.has(name);
      })
    )
      return false;
    return owned.some((root) => within(root, filename));
  };
  for (const filename of Object.keys(runtimeRequire.cache)) {
    if (belongs(filename)) delete runtimeRequire.cache[filename];
  }
  for (const mod of Object.values(runtimeRequire.cache)) {
    if (mod) mod.children = mod.children.filter((child) => !belongs(child.filename));
  }
  // npm can move a dependency or change its main entry. Node's CJS resolver
  // retains those paths separately from require.cache.
  const pathCache = runtimeRequire("node:module")._pathCache as Record<string, string>;
  for (const [key, filename] of Object.entries(pathCache)) {
    if (belongs(filename) || owned.some((root) => key.includes(root))) delete pathCache[key];
  }
}

function isEsm(entry: string) {
  if (entry.endsWith(".mjs")) return true;
  if (entry.endsWith(".cjs")) return false;
  let directory = path.dirname(entry);
  while (true) {
    const filename = path.join(directory, "package.json");
    if (fs.existsSync(filename))
      return JSON.parse(fs.readFileSync(filename, "utf8")).type === "module";
    const parent = path.dirname(directory);
    if (parent === directory) return false;
    directory = parent;
  }
}

/** Give an ESM entry and its local imports the same immutable revision URL. */
export async function loadPluginModule(
  entry: string,
  directory: string,
  revision: string
): Promise<unknown> {
  const runtimeRequire = eval("require") as NodeRequire;
  previousRoots.set(directory, dependencyRoots(directory));
  if (!isEsm(entry)) {
    try {
      return runtimeRequire(entry);
    } catch (error: any) {
      if (error?.code !== "ERR_REQUIRE_ESM") throw error;
    }
  }
  graphs.set(revision, [directory, ...dependencyRoots(directory)]);
  if (!hooksInstalled) {
    const { registerHooks } = runtimeRequire("node:module");
    if (typeof registerHooks !== "function")
      throw new Error("ESM plugin updates require Node.js 22.15 or newer.");
    registerHooks({
      resolve(specifier: string, context: any, nextResolve: any) {
        const resolved = nextResolve(specifier, context);
        if (!context.parentURL?.startsWith("file:") || !resolved.url.startsWith("file:"))
          return resolved;
        const parent = new URL(context.parentURL);
        const parentRevision = parent.searchParams.get(REVISION);
        if (!parentRevision) return resolved;
        const roots = graphs.get(parentRevision);
        if (
          !roots?.some((root) => within(root, fileURLToPath(parent))) ||
          !roots.some((root) => within(root, fileURLToPath(resolved.url)))
        )
          return resolved;
        const url = new URL(resolved.url);
        url.searchParams.set(REVISION, parentRevision);
        return { ...resolved, url: url.href };
      }
    });
    hooksInstalled = true;
  }
  const url = pathToFileURL(entry);
  url.searchParams.set(REVISION, revision);
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string
  ) => Promise<unknown>;
  return dynamicImport(url.href);
}
