const fs = require("node:fs");
const path = require("node:path");

const repository = path.resolve(__dirname, "..");
const coreDirectory = (side, root = repository) => path.join(root, "core", side);

/** Source packages use the same per-side metadata as their published npm packages. */
function sourcePlugins(side, root = repository) {
  if (!["panel", "daemon"].includes(side)) throw new Error(`Unknown plugin side: ${side}`);
  const directory = path.join(root, "plugins");
  if (!fs.existsSync(directory)) return [];
  const plugins = [];
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const packageRoot = path.join(directory, item.name);
    const filename = path.join(packageRoot, "package.json");
    if (!fs.existsSync(filename)) continue;
    const metadata = JSON.parse(fs.readFileSync(filename, "utf8"));
    const definition = metadata.elementspanel?.[side];
    if (!definition) continue;
    const id = metadata.elementspanel.id;
    if (typeof id !== "string" || typeof definition.directory !== "string")
      throw new Error(`Invalid ${side} plugin metadata: ${filename}`);
    const pluginDirectory = path.resolve(packageRoot, definition.directory);
    const relative = path.relative(packageRoot, pluginDirectory);
    if (
      !relative ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    )
      throw new Error(`Plugin directory must stay inside its package: ${filename}`);
    if (!fs.existsSync(path.join(pluginDirectory, "plugin.json")))
      throw new Error(`Missing ${side} plugin manifest: ${pluginDirectory}`);
    plugins.push({
      id,
      folder: definition.folder || id,
      directory: pluginDirectory,
      packageRoot,
      metadata
    });
  }
  return plugins.sort((a, b) => a.id.localeCompare(b.id));
}

module.exports = { repository, coreDirectory, sourcePlugins };
