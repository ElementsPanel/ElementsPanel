const fs = require("node:fs");
const path = require("node:path");

function write(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, typeof value === "string" ? value : JSON.stringify(value));
}

/** Install a tiny precompiled npm plugin fixture without a registry or project build. */
function installNpmPlugin(hostRoot, side, id, options = {}) {
  const name = `@elementspanel/epanel-plugin-${id}`;
  const packageRoot = options.packageRoot || path.join(hostRoot, "node_modules", name);
  const directory = path.join(packageRoot, side);
  const version = options.version || "1.0.0";
  const read = (filename) => (fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename)) : {});
  const hostFile = path.join(hostRoot, "package.json");
  const host = { name: `@elementspanel/${side}`, version: "1.0.0", ...read(hostFile) };
  host.dependencies = { ...host.dependencies, [name]: version };
  host.elementspanel = { side, plugins: { ...host.elementspanel?.plugins, [id]: name } };
  write(hostFile, host);
  const metadata = read(path.join(packageRoot, "package.json"));
  write(path.join(packageRoot, "package.json"), {
    ...metadata,
    name,
    version,
    dependencies: options.dependencies || metadata.dependencies || {},
    exports: { "./package.json": "./package.json" },
    elementspanel: {
      ...metadata.elementspanel,
      id,
      [side]: { directory: side, folder: options.folder || id }
    }
  });
  write(path.join(directory, "plugin.json"), {
    backend: "backend/index.cjs",
    ...(options.frontend ? { frontend: "frontend/index.js" } : {})
  });
  write(path.join(directory, "backend/index.cjs"), options.source || "exports.apply = () => {};\n");
  if (options.frontend) write(path.join(directory, "frontend/index.js"), options.frontend);
  const resolver = path.join(hostRoot, "runtime/npm-plugins.cjs");
  fs.mkdirSync(path.dirname(resolver), { recursive: true });
  fs.copyFileSync(path.join(__dirname, "../runtime/npm-plugins.cjs"), resolver);
  return { directory, packageRoot, name };
}

module.exports = { installNpmPlugin, write };
