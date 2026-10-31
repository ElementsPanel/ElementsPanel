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

function mockNpmView(t, versions = { panel: "1.2.3", daemon: "2.3.4" }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "elements-npm-view-"));
  const npmCLI = path.join(root, "npm-cli.cjs");
  const log = path.join(root, "queries.jsonl");
  const previousNpmCLI = process.env.npm_execpath;
  write(npmCLI, `
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
const side = args[1]?.match(/^@elementspanel\\/(panel|daemon)@latest$/)?.[1];
const versions = ${JSON.stringify(versions)};
if (args[0] !== "view" || args[2] !== "version" || !Object.hasOwn(versions, side))
  throw new Error("Registry unavailable or unexpected npm command.");
console.log(JSON.stringify(versions[side]));
`);
  process.env.npm_execpath = npmCLI;
  t.after(() => {
    if (previousNpmCLI === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = previousNpmCLI;
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    versions,
    queries: () => fs.existsSync(log)
      ? fs.readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line))
      : []
  };
}

module.exports = { installNpmPlugin, mockNpmView, write };
