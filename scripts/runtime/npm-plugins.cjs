const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
const readOptional = (filename) => {
  try {
    return readJson(filename);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};
const validId = /^[a-z][a-z0-9_-]{1,63}$/;
const validName = /^(?:@[a-z0-9_.-]+\/)?epanel-plugin-[a-z0-9_.-]+$/;

function within(root, filename) {
  const relative = path.relative(root, filename);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function projectRoot(packageRoot) {
  if (process.env.EPANEL_PROJECT_ROOT) return path.resolve(process.env.EPANEL_PROJECT_ROOT);
  const parent = path.resolve(packageRoot, "..");
  // An installed runtime sits at <project>/node_modules/@scope/<side>; the
  // project itself is three levels above the package. A development checkout
  // sits directly under the project instead.
  const scope = parent;
  const nodeModules = path.dirname(scope);
  if (path.basename(nodeModules) === "node_modules" && path.basename(scope).startsWith("@")) {
    return path.dirname(nodeModules);
  }
  return parent;
}

function projectManifestFile(packageRoot) {
  const root = projectRoot(packageRoot);
  const filename = path.join(root, "package.json");
  return path.resolve(filename) === path.resolve(path.join(packageRoot, "package.json"))
    ? null
    : filename;
}

function mappingOf(manifest) {
  const plugins = manifest?.elementspanel?.plugins;
  return plugins && typeof plugins === "object" && !Array.isArray(plugins) ? plugins : {};
}

function dependenciesOf(manifest) {
  const dependencies = manifest?.dependencies;
  return dependencies && typeof dependencies === "object" ? dependencies : {};
}

/**
 * Resolve declared plugins through the host's dependency graph, including nested
 * installs and project-level dependencies installed by the plugin market.
 */
function resolveNpmPlugins(packageRoot, side) {
  const host = readJson(path.join(packageRoot, "package.json"));
  const projectFile = projectManifestFile(packageRoot);
  const project = projectFile ? readOptional(projectFile) : null;
  const selectedSide = side || host.elementspanel?.side;

  // Project mappings are read first so the host's built-in plugins win an id
  // collision: a market package must not shadow a plugin that ships with the runtime.
  const configured = new Map();
  for (const [id, name] of Object.entries(mappingOf(project))) configured.set(id, { name, source: "project" });
  for (const [id, name] of Object.entries(mappingOf(host))) configured.set(id, { name, source: "bundled" });

  const hostDependencies = dependenciesOf(host);
  const projectDependencies = dependenciesOf(project);
  const roots = [packageRoot];
  const parentRoot = projectRoot(packageRoot);
  if (path.resolve(parentRoot) !== path.resolve(packageRoot)) roots.push(parentRoot);
  const requireAt = (root) => createRequire(path.join(root, "package.json"));
  const folders = new Set();
  const records = [];

  for (const [id, mapping] of configured) {
    const name = mapping.name;
    if (
      !validId.test(id) ||
      typeof name !== "string" ||
      !validName.test(name) ||
      (hostDependencies[name] === undefined && projectDependencies[name] === undefined)
    )
      throw new Error(`Invalid npm plugin dependency: ${id}.`);

    let manifestPath;
    let failure;
    for (const root of roots) {
      try {
        manifestPath = requireAt(root).resolve(`${name}/package.json`);
        break;
      } catch (error) {
        failure = error;
      }
    }
    if (!manifestPath) {
      throw new Error(`Missing npm plugin ${name}. Run npm install in the project directory.`, {
        cause: failure
      });
    }
    const metadata = readJson(manifestPath);
    const definition = metadata.elementspanel?.[selectedSide];
    // A project dependency may only ship one side; the other side simply does
    // not see it. A built-in plugin declared by the runtime must carry this side.
    if (!definition) {
      if (mapping.source === "project") continue;
      throw new Error(`Invalid ${selectedSide} entry in npm plugin ${name}.`);
    }
    const pluginRoot = path.dirname(manifestPath);
    if (
      typeof definition.directory !== "string" ||
      typeof definition.folder !== "string" ||
      !validId.test(definition.folder) ||
      path.isAbsolute(definition.directory)
    )
      throw new Error(`Npm plugin entry escapes its package: ${name}.`);
    const directory = path.resolve(pluginRoot, definition.directory);
    if (directory === pluginRoot || !within(pluginRoot, directory))
      throw new Error(`Npm plugin entry escapes its package: ${name}.`);
    const manifest = readJson(path.join(directory, "plugin.json"));
    if (manifest.id !== id || manifest.version !== metadata.version)
      throw new Error(`Npm plugin identity or version does not match its manifest: ${name}.`);
    if (folders.has(definition.folder))
      throw new Error(`Duplicate npm plugin asset directory: ${definition.folder}.`);
    folders.add(definition.folder);
    records.push({
      id,
      name,
      version: metadata.version,
      packageRoot: pluginRoot,
      directory,
      folder: definition.folder,
      dependencies: Object.keys(metadata.dependencies || {})
    });
  }
  return records;
}

module.exports = { resolveNpmPlugins, projectManifestFile };
