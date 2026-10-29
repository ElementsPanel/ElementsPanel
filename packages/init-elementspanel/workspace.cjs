#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const initializerMetadata = require("./package.json");

const PLUGIN_ID = /^[a-z][a-z0-9_-]{1,63}$/;
const PACKAGE_NAME = /^(?:@[a-z0-9_.-]+\/)?epanel-plugin-[a-z0-9_.-]+$/;

function readJson(filename, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw error;
  }
}

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function findProjectRoot(start = process.cwd()) {
  let directory = path.resolve(start);
  while (true) {
    const filename = path.join(directory, "package.json");
    if (fs.existsSync(filename)) {
      const manifest = readJson(filename);
      if (Array.isArray(manifest.workspaces) && manifest.workspaces.includes("external/*"))
        return directory;
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error("Run this command inside an initialized ElementsPanel project.");
}

function workspaceEntries(projectRoot) {
  const directory = path.join(projectRoot, "external");
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((item) => item.isDirectory() && fs.existsSync(path.join(directory, item.name, "package.json")))
    .map((item) => {
      const root = path.join(directory, item.name);
      return { root, directory: item.name, manifest: readJson(path.join(root, "package.json")) };
    });
}

function normalizePluginName(input) {
  const value = String(input || "").trim();
  if (!value) throw new Error("Specify a plugin name, for example `example`.");
  let name = value;
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    if (slash < 0) throw new Error("A scoped plugin name must look like @scope/example.");
    const scope = name.slice(1, slash);
    const local = name.slice(slash + 1).replace(/^epanel-plugin-/, "");
    name = `@${scope}/epanel-plugin-${local}`;
  } else if (!name.startsWith("epanel-plugin-")) {
    name = `epanel-plugin-${name}`;
  }
  if (!PACKAGE_NAME.test(name)) throw new Error(`Invalid plugin package name: ${name}`);
  const local = name.split("/").pop().slice("epanel-plugin-".length);
  if (!PLUGIN_ID.test(local)) throw new Error(`Invalid plugin id: ${local}`);
  return { name, id: local };
}

function parseSetupArgs(args) {
  let name;
  let sides = ["panel"];
  let install = true;
  for (const argument of args) {
    if (argument === "--no-install") install = false;
    else if (argument === "--panel") sides = ["panel"];
    else if (argument === "--daemon") sides = ["daemon"];
    else if (["--both", "--dual"].includes(argument)) sides = ["panel", "daemon"];
    else if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    else if (name) throw new Error("Specify only one plugin name.");
    else name = argument;
  }
  return { ...normalizePluginName(name), sides, install };
}

function parseSelection(args) {
  const names = args.filter((argument) => !argument.startsWith("-"));
  if (!names.length) return undefined;
  return new Set(names);
}

function selectWorkspaces(projectRoot, selection) {
  const entries = workspaceEntries(projectRoot);
  if (!selection) return entries;
  const selected = entries.filter(
    (entry) => selection.has(entry.directory) || selection.has(entry.manifest.name)
  );
  for (const name of selection) {
    if (!selected.some((entry) => entry.directory === name || entry.manifest.name === name))
      throw new Error(`Plugin workspace not found: ${name}`);
  }
  return selected;
}

function updateProjectManifest(projectRoot, entry) {
  const filename = path.join(projectRoot, "package.json");
  const manifest = readJson(filename);
  const workspaces = Array.isArray(manifest.workspaces) ? [...manifest.workspaces] : [];
  if (!workspaces.includes("external/*")) workspaces.push("external/*");
  manifest.workspaces = workspaces;
  manifest.dependencies = { ...(manifest.dependencies || {}) };
  manifest.dependencies[entry.manifest.name] = `file:external/${entry.directory}`;
  const elementspanel = manifest.elementspanel && typeof manifest.elementspanel === "object"
    ? { ...manifest.elementspanel }
    : {};
  const plugins = elementspanel.plugins && typeof elementspanel.plugins === "object"
    ? { ...elementspanel.plugins }
    : {};
  plugins[entry.manifest.elementspanel.id] = entry.manifest.name;
  manifest.elementspanel = { ...elementspanel, plugins };
  writeJson(filename, manifest);
}

function runNpm(args, cwd) {
  return new Promise((resolve, reject) => {
    const npmCLI = process.env.npm_execpath;
    const command = npmCLI && /npm(?:-cli)?\.(?:c?js|mjs)$/.test(npmCLI)
      ? { executable: process.execPath, args: [npmCLI, ...args] }
      : process.platform === "win32"
      ? { executable: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", "npm", ...args] }
      : { executable: "npm", args };
    const child = spawn(command.executable, command.args, { cwd, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`npm ${args[0] || "command"} failed (${signal || code}).`));
    });
  });
}

function sideManifest(side) {
  return {
    ...(side === "panel"
      ? { backend: "backend/index.cjs", frontend: "frontend/index.js" }
      : { backend: "backend/index.cjs" })
  };
}

function scaffoldSource(side, id) {
  const sideName = path.basename(side);
  const source = path.join(side, "src");
  fs.mkdirSync(path.join(source, "backend"), { recursive: true });
  fs.writeFileSync(
    path.join(source, "backend", "index.ts"),
    `export function apply(_ctx: any) {\n  // Add ${id} backend services here.\n}\n`
  );
  if (sideName === "panel") {
    fs.writeFileSync(
      path.join(source, "frontend.ts"),
      `export function apply(_ctx: any) {\n  // Add ${id} panel routes, views or actions here.\n}\n`
    );
  }
}

function runtimePeerVersion(projectManifest, side) {
  const dependency = projectManifest.dependencies?.[`@elementspanel/${side}`];
  if (typeof dependency === "string" && dependency.trim()) return dependency;
  return `^${initializerMetadata.runtimeVersions?.[side] || initializerMetadata.version}`;
}

function buildDependencies(sides) {
  const names = [
    "esbuild",
    ...(sides.includes("panel")
      ? ["vite", "@vitejs/plugin-vue", "@vitejs/plugin-vue-jsx", "vue"]
      : [])
  ];
  return Object.fromEntries(names.map((name) => [name, initializerMetadata.dependencies[name]]));
}

function workspaceReadme(id, sides, packageName) {
  return `# epanel-plugin-${id}\n\nAll plugin metadata belongs in package.json: version, description, displayName, author and keywords describe the package; elementspanel.id and elementspanel.dual define its identity and dual status. Runtime metadata belongs in elementspanel.<side>, including priority, frontendInject and elements.\n\nEach side's plugin.json contains only execution entries such as backend and frontend. Generated CSS paths are saved in package.json under elementspanel.panel.styles.\n\nThe complete build command lives in this package's scripts.build and uses its own devDependencies. Run npm run build in this directory, or npm run build --workspace ${packageName} from the project root. The prepack script runs it before publishing.\n\nAvailable for: ${sides.join(" and ")}.\n`;
}

async function setupWorkspace(projectRoot, args) {
  const options = parseSetupArgs(args);
  const projectManifest = readJson(path.join(projectRoot, "package.json"));
  const directory = options.id;
  const workspaceRoot = path.join(projectRoot, "external", directory);
  if (fs.existsSync(workspaceRoot)) throw new Error(`Plugin workspace already exists: ${workspaceRoot}`);
  const dual = options.sides.length === 2;
  const packageManifest = {
    name: options.name,
    version: "0.1.0",
    description: `ElementsPanel ${options.id} plugin`,
    license: "Apache-2.0",
    files: [
      ...(options.sides.includes("panel") ? ["panel/plugin.json", "panel/backend/", "panel/frontend/"] : []),
      ...(options.sides.includes("daemon") ? ["daemon/plugin.json", "daemon/backend/"] : []),
      "README.md"
    ],
    scripts: { build: packageBuildScript(), prepack: "npm run build" },
    devDependencies: buildDependencies(options.sides),
    peerDependencies: Object.fromEntries(
      options.sides.map((side) => [
        `@elementspanel/${side}`,
        runtimePeerVersion(projectManifest, side)
      ])
    ),
    peerDependenciesMeta: Object.fromEntries(
      options.sides.map((side) => [`@elementspanel/${side}`, { optional: true }])
    ),
    elementspanel: {
      id: options.id,
      ...(dual ? { dual: true } : {}),
      ...(options.sides.includes("panel")
        ? { panel: { directory: "panel", folder: options.id, frontendInject: ["console", "i18n"] } }
        : {}),
      ...(options.sides.includes("daemon")
        ? { daemon: { directory: "daemon", folder: options.id } }
        : {})
    }
  };
  fs.mkdirSync(workspaceRoot, { recursive: true });
  writeJson(path.join(workspaceRoot, "package.json"), packageManifest);
  fs.writeFileSync(
    path.join(workspaceRoot, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", strict: true, skipLibCheck: true }, include: ["panel/src/**/*", "daemon/src/**/*"] }, null, 2)}\n`
  );
  for (const side of options.sides) {
    fs.mkdirSync(path.join(workspaceRoot, side), { recursive: true });
    writeJson(path.join(workspaceRoot, side, "plugin.json"), sideManifest(side));
    scaffoldSource(path.join(workspaceRoot, side), options.id);
  }
  fs.writeFileSync(path.join(workspaceRoot, "README.md"), workspaceReadme(options.id, options.sides, options.name));
  const entry = { root: workspaceRoot, directory, manifest: packageManifest };
  updateProjectManifest(projectRoot, entry);
  if (options.install) await runNpm(["install", "--no-fund", "--no-audit", "--ignore-scripts"], projectRoot);
  console.log(`Created plugin workspace in ${workspaceRoot}`);
  return entry;
}

// This function is serialized into package.json. Keep it self-contained and
// avoid shell expansion characters so npm can run it on Windows and Unix.
async function buildPluginPackage() {
  const fs = require('node:fs');
  const path = require('node:path');
  const esbuild = require('esbuild');
  const root = process.cwd();
  const packageFile = path.join(root, 'package.json');
  const metadata = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const write = (filename, value) =>
    fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n');
  const findSource = (directory, candidates) =>
    candidates.map(candidate => path.join(directory, 'src', candidate)).find(filename => fs.existsSync(filename));
  const compiledStyles = directory => {
    const files = [];
    const visit = current => {
      for (const item of fs.readdirSync(current, { withFileTypes: true })) {
        const filename = path.join(current, item.name);
        if (item.isDirectory()) visit(filename);
        else if (item.name.toLowerCase().endsWith('.css')) files.push(filename);
      }
    };
    if (fs.existsSync(directory)) visit(directory);
    return files.sort().map(filename => path.relative(path.dirname(directory), filename).split(path.sep).join('/'));
  };
  const sides = ['panel', 'daemon'].filter(side => metadata.elementspanel?.[side]);
  if (!sides.length) throw new Error('Plugin package has no panel or daemon side: ' + metadata.name);
  if (sides.length === 2 && metadata.elementspanel.dual === undefined) metadata.elementspanel.dual = true;
  for (const side of sides) {
    const definition = metadata.elementspanel[side];
    const directory = path.join(root, definition.directory);
    const backend = findSource(directory, ['backend/index.ts', 'backend/index.js', 'index.ts', 'index.js']);
    const frontend = side === 'panel'
      ? findSource(directory, ['frontend.ts', 'frontend.tsx', 'frontend.jsx', 'frontend.js', 'index.ts', 'index.tsx', 'index.jsx', 'index.js'])
      : undefined;
    if (!backend) throw new Error('Missing backend source for ' + metadata.name + '/' + side);
    if (side === 'panel' && !frontend) throw new Error('Missing frontend source for ' + metadata.name + '/panel');
    const pluginFile = path.join(directory, 'plugin.json');
    const previous = fs.existsSync(pluginFile) ? JSON.parse(fs.readFileSync(pluginFile, 'utf8')) : {};
    for (const [key, value] of Object.entries(previous)) {
      if (['id', 'version', 'dual', 'backend', 'frontend', 'panel', 'daemon', 'main', 'entry', 'ui'].includes(key)) continue;
      const field = key === 'name' ? 'displayName' : key;
      if (definition[field] === undefined && metadata[field] === undefined && metadata.elementspanel[field] === undefined) definition[field] = value;
    }
    const manifest = { backend: 'backend/index.cjs' };
    const output = path.join(directory, 'backend', 'index.cjs');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    await esbuild.build({
      entryPoints: [backend], outfile: output, bundle: true, platform: 'node',
      format: 'cjs', target: 'node22', packages: 'external', sourcemap: false, logLevel: 'warning'
    });
    if (side === 'panel') {
      const { build } = await import('vite');
      const vuePlugin = require('@vitejs/plugin-vue');
      const vueJsxPlugin = require('@vitejs/plugin-vue-jsx');
      const frontendOutput = path.join(directory, 'frontend');
      const shared = ['vue', 'vue-router', 'pinia', 'vue-i18n', 'cordis', 'cosmokit', '@vueuse/core', '@vueuse/shared', '@elements-panel/sdk'];
      await build({
        configFile: false, root: directory, plugins: [vuePlugin(), vueJsxPlugin()],
        build: {
          outDir: frontendOutput, emptyOutDir: true, sourcemap: false,
          rollupOptions: {
            input: frontend, preserveEntrySignatures: 'strict',
            external: id => shared.some(name => id === name || id.startsWith(name + '/')),
            output: { format: 'es', entryFileNames: 'index.js', chunkFileNames: '[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' }
          }
        }
      });
      manifest.frontend = 'frontend/index.js';
      const styles = compiledStyles(frontendOutput);
      if (styles.length) definition.styles = styles;
      else delete definition.styles;
    }
    write(pluginFile, manifest);
  }
  write(packageFile, metadata);
  console.log('Built ' + metadata.name + '@' + metadata.version);
}

function packageBuildScript() {
  const source = buildPluginPackage.toString().split(/\r?\n/).map(line => line.trim()).join(" ");
  return 'node -e "(' + source + ')().catch(error => { console.error(error); process.exitCode = 1; });"';
}

async function buildWorkspace(entry) {
  let script = entry.manifest.scripts?.build;
  if (script === "epanel-workspace build" || script === `epanel-workspace build ${entry.directory}`) {
    entry.manifest.scripts.build = packageBuildScript();
    const sides = ["panel", "daemon"].filter(side => entry.manifest.elementspanel?.[side]);
    entry.manifest.devDependencies = { ...buildDependencies(sides), ...entry.manifest.devDependencies };
    writeJson(path.join(entry.root, "package.json"), entry.manifest);
    script = entry.manifest.scripts.build;
  }
  if (typeof script !== "string" || !script.trim() || /^epanel-workspace\s+build(?:\s|$)/.test(script))
    throw new Error(`Plugin package must define its own scripts.build: ${entry.manifest.name}`);
  await runNpm(["run", "build"], entry.root);
}

async function buildCommand(projectRoot, args) {
  for (const entry of selectWorkspaces(projectRoot, parseSelection(args))) await buildWorkspace(entry);
}

async function publishCommand(projectRoot, args) {
  const entries = selectWorkspaces(projectRoot, parseSelection(args));
  if (!entries.length) throw new Error("No plugin workspaces found under external/.");
  for (const entry of entries) {
    if (entry.manifest.private) throw new Error(`Cannot publish private plugin: ${entry.manifest.name}`);
    if (!entry.manifest.scripts?.prepack) await buildWorkspace(entry);
    await runNpm(["publish", "--access", "public"], entry.root);
  }
}

function help() {
  console.log(`Usage: epanel-workspace <setup|build|publish> [name] [options]\n\n  setup <name> [--panel|--daemon|--both] [--no-install]\n  build [name ...]\n  publish [name ...]`);
}

async function main(argv = process.argv.slice(2)) {
  const command = argv.shift();
  if (!command || ["--help", "-h"].includes(command)) return help();
  const projectRoot = findProjectRoot();
  if (command === "setup") return setupWorkspace(projectRoot, argv);
  if (command === "build") return buildCommand(projectRoot, argv);
  if (["publish", "pub"].includes(command)) return publishCommand(projectRoot, argv);
  throw new Error(`Unknown workspace command: ${command}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { findProjectRoot, setupWorkspace, buildWorkspace, buildCommand, publishCommand };
