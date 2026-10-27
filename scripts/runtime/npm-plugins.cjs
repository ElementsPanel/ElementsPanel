const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
const validId = /^[a-z][a-z0-9_-]{1,63}$/;
const validName = /^(?:@[a-z0-9_-]+\/)?epanel-plugin-[a-z0-9_-]+$/;

function within(root, filename) {
  const relative = path.relative(root, filename);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

/** Resolve declared plugins through the host's dependency graph, including nested installs. */
function resolveNpmPlugins(packageRoot, side) {
  const host = readJson(path.join(packageRoot, "package.json"));
  const selectedSide = side || host.elementspanel?.side;
  const configured = host.elementspanel?.plugins;
  if (configured === undefined) return [];
  if (
    !["panel", "daemon"].includes(selectedSide) ||
    !configured ||
    typeof configured !== "object" ||
    Array.isArray(configured)
  )
    throw new Error("Invalid npm plugin configuration in the runtime package.");
  const hostRequire = createRequire(path.join(packageRoot, "package.json"));
  const folders = new Set();
  return Object.entries(configured).map(([id, name]) => {
    if (
      !validId.test(id) ||
      typeof name !== "string" ||
      !validName.test(name) ||
      typeof host.dependencies?.[name] !== "string"
    )
      throw new Error(`Invalid npm plugin dependency: ${id}.`);
    let manifestPath;
    try {
      manifestPath = hostRequire.resolve(`${name}/package.json`);
    } catch (error) {
      throw new Error(`Missing npm plugin ${name}. Run npm install in the project directory.`, {
        cause: error
      });
    }
    const metadata = readJson(manifestPath);
    const definition = metadata.elementspanel?.[selectedSide];
    if (
      metadata.name !== name ||
      metadata.elementspanel?.id !== id ||
      !definition ||
      typeof definition.directory !== "string" ||
      typeof definition.folder !== "string" ||
      !validId.test(definition.folder)
    )
      throw new Error(`Invalid ${selectedSide} entry in npm plugin ${name}.`);
    const pluginRoot = path.dirname(manifestPath);
    const directory = path.resolve(pluginRoot, definition.directory);
    if (
      directory === pluginRoot ||
      !within(pluginRoot, directory) ||
      path.isAbsolute(definition.directory)
    )
      throw new Error(`Npm plugin entry escapes its package: ${name}.`);
    const manifest = readJson(path.join(directory, "plugin.json"));
    if (manifest.id !== id || manifest.version !== metadata.version)
      throw new Error(`Npm plugin identity or version does not match its manifest: ${name}.`);
    if (folders.has(definition.folder))
      throw new Error(`Duplicate npm plugin asset directory: ${definition.folder}.`);
    folders.add(definition.folder);
    return {
      id,
      name,
      version: metadata.version,
      packageRoot: pluginRoot,
      directory,
      folder: definition.folder,
      dependencies: Object.keys(metadata.dependencies || {})
    };
  });
}

module.exports = { resolveNpmPlugins };
