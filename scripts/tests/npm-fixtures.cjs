const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function write(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, typeof value === "string" ? value : JSON.stringify(value));
}

/** Install a tiny precompiled npm plugin fixture without a registry or project build. */
function installNpmPlugin(hostRoot, side, id, options = {}) {
  const name = `@elementspanel/epanel-plugin-${id}`;
  const scoped =
    path.basename(path.dirname(hostRoot)).startsWith("@") &&
    path.basename(path.resolve(hostRoot, "../..")) === "node_modules";
  const projectRoot =
    options.projectRoot ||
    (scoped
      ? path.resolve(hostRoot, "../../..")
      : process.env.EPANEL_PACKAGE_ROOT === hostRoot
      ? process.env.EPANEL_PROJECT_ROOT || process.cwd()
      : ["host", "package", "panel", "daemon"].includes(path.basename(hostRoot))
      ? path.dirname(hostRoot)
      : hostRoot);
  const dependencyRoot = options.runtimeDirectory || path.join(projectRoot, side);
  const packageRoot = options.packageRoot || path.join(dependencyRoot, "node_modules", name);
  const directory = path.join(packageRoot, side);
  const version = options.version || "1.0.0";
  const read = (filename) => (fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename)) : {});
  const hostFile = path.join(hostRoot, "package.json");
  const host = { name: `@elementspanel/${side}`, version: "1.0.0", ...read(hostFile) };
  host.elementspanel = {
    ...host.elementspanel,
    side,
    ...(side === "panel" ? { frontendAssets: host.elementspanel?.frontendAssets || [] } : {}),
    plugins: { ...host.elementspanel?.plugins, [id]: name }
  };
  write(hostFile, host);
  const projectFile = path.join(dependencyRoot, "package.json");
  const project = read(projectFile);
  project.private = true;
  project.dependencies = { ...project.dependencies, [name]: version };
  project.elementspanel = {
    ...project.elementspanel,
    side,
    plugins: { ...project.elementspanel?.plugins, [id]: name }
  };
  write(projectFile, project);
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
      [side]: {
        directory: side,
        folder: options.folder || id,
        ...(side === "panel" ? { frontendAssets: [] } : {})
      }
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

function mockNpmView(t, versions = { panel: "1.2.3", daemon: "2.3.4" }, pluginVersion = "9.8.7") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "elements-npm-view-"));
  const npmCLI = path.join(root, "npm-cli.cjs");
  const log = path.join(root, "queries.jsonl");
  const registryFile = path.join(root, "registry.json");
  write(registryFile, {});
  const previousNpmCLI = process.env.npm_execpath;
  write(npmCLI, `
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
const side = args[1]?.match(/^@elementspanel\\/(panel|daemon)@(.+)$/)?.[1];
const versions = ${JSON.stringify(versions)};
if (args[0] !== "view" || args[2] !== "--json")
  throw new Error("Registry unavailable or unexpected npm command.");
const registry = JSON.parse(fs.readFileSync(${JSON.stringify(registryFile)}));
const name = args[1].slice(0, args[1].lastIndexOf('@'));
if (Object.hasOwn(registry, name)) {
  if (registry[name] === null) throw new Error('Registry unavailable.');
  console.log(JSON.stringify(registry[name]));
  process.exit(0);
}
if (side && Object.hasOwn(versions, side)) {
  const requested = args[1].slice(args[1].lastIndexOf('@') + 1);
  console.log(JSON.stringify({ version: requested === 'latest' ? versions[side] : requested,
    elementspanel: { plugins: { i18n: '@elementspanel/epanel-plugin-i18n' }, frontendAssets: [] } }));
} else if (args[1] === '@elementspanel/epanel-plugin-i18n@latest') {
  console.log(JSON.stringify({ version: ${JSON.stringify(pluginVersion)},
    elementspanel: { id: 'i18n', panel: { directory: 'panel', frontendAssets: [] }, daemon: { directory: 'daemon' } } }));
} else throw new Error('Registry unavailable or unexpected package.');
`
  );
  process.env.npm_execpath = npmCLI;
  t.after(() => {
    if (previousNpmCLI === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = previousNpmCLI;
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    versions,
    pluginVersion,
    metadata(name, value) {
      const registry = JSON.parse(fs.readFileSync(registryFile));
      registry[name] = value;
      write(registryFile, registry);
    },
    queries: () =>
      fs.existsSync(log)
        ? fs
            .readFileSync(log, "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
        : []
  };
}

module.exports = { installNpmPlugin, mockNpmView, write };
