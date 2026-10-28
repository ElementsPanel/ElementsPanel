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
      : { executable: "npm", args };
    const child = spawn(command.executable, command.args, { cwd, stdio: "inherit", shell: false });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`npm ${args[0] || "command"} failed (${signal || code}).`));
    });
  });
}

function sideManifest(id, version, side, dual) {
  return {
    id,
    version,
    description: `ElementsPanel ${id} plugin`,
    ...(dual ? { dual: true } : {}),
    ...(side === "panel"
      ? { backend: "backend/index.cjs", frontend: "frontend/index.js", frontendInject: ["console", "i18n"] }
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

function workspaceReadme(id, sides) {
  return `# epanel-plugin-${id}\n`;
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
    scripts: { build: `epanel-workspace build ${directory}` },
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
      ...(options.sides.includes("panel")
        ? { panel: { directory: "panel", folder: options.id } }
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
    writeJson(path.join(workspaceRoot, side, "plugin.json"), sideManifest(options.id, "0.1.0", side, dual));
    scaffoldSource(path.join(workspaceRoot, side), options.id);
  }
  fs.writeFileSync(path.join(workspaceRoot, "README.md"), workspaceReadme(options.id, options.sides));
  const entry = { root: workspaceRoot, directory, manifest: packageManifest };
  updateProjectManifest(projectRoot, entry);
  if (options.install) await runNpm(["install", "--no-fund", "--no-audit", "--ignore-scripts"], projectRoot);
  console.log(`Created plugin workspace in ${workspaceRoot}`);
  return entry;
}

function findSource(sideRoot, candidates) {
  return candidates.map((candidate) => path.join(sideRoot, "src", candidate)).find((filename) => fs.existsSync(filename));
}

function compiledStyles(directory) {
  const files = [];
  const visit = (current) => {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const filename = path.join(current, item.name);
      if (item.isDirectory()) visit(filename);
      else if (/\.css$/i.test(item.name)) files.push(filename);
    }
  };
  if (fs.existsSync(directory)) visit(directory);
  return files
    .sort()
    .map((filename) => path.relative(path.dirname(directory), filename).split(path.sep).join("/"));
}

async function buildWorkspace(entry) {
  const esbuild = require("esbuild");
  const packageManifest = entry.manifest;
  const sides = ["panel", "daemon"].filter((side) => packageManifest.elementspanel?.[side]);
  if (!sides.length) throw new Error(`Plugin workspace has no panel or daemon side: ${packageManifest.name}.`);
  for (const side of sides) {
    const sideRoot = path.join(entry.root, side);
    const backend = findSource(sideRoot, ["backend/index.ts", "backend/index.js", "index.ts", "index.js"]);
    const frontend =
      side === "panel"
        ? findSource(sideRoot, [
            "frontend.ts",
            "frontend.tsx",
            "frontend.jsx",
            "frontend.js",
            "index.ts",
            "index.tsx",
            "index.jsx",
            "index.js"
          ])
        : undefined;
    const pluginFile = path.join(sideRoot, "plugin.json");
    const plugin = readJson(pluginFile);
    plugin.version = packageManifest.version;
    if (!backend) throw new Error(`Missing backend source for ${packageManifest.name}/${side}.`);
    if (side === "panel" && !frontend)
      throw new Error(`Missing frontend source for ${packageManifest.name}/panel.`);
    const output = path.join(sideRoot, "backend", "index.cjs");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    await esbuild.build({ entryPoints: [backend], outfile: output, bundle: true, platform: "node", format: "cjs", target: "node22", packages: "external", sourcemap: false, logLevel: "warning" });
    plugin.backend = "backend/index.cjs";
    if (side === "panel") {
      const { build } = await import("vite");
      const vuePlugin = require("@vitejs/plugin-vue");
      const vueJsxPlugin = require("@vitejs/plugin-vue-jsx");
      const frontendOutput = path.join(sideRoot, "frontend");
      await build({
        configFile: false,
        root: sideRoot,
        plugins: [vuePlugin(), vueJsxPlugin()],
        build: {
          outDir: frontendOutput,
          emptyOutDir: true,
          sourcemap: false,
          rollupOptions: {
            input: frontend,
            external: (id) =>
              [
                "vue",
                "vue-router",
                "pinia",
                "vue-i18n",
                "cordis",
                "cosmokit",
                "@vueuse/core",
                "@vueuse/shared",
                "@elements-panel/sdk"
              ].some(
                (name) => id === name || id.startsWith(`${name}/`)
              ),
            output: { format: "es", entryFileNames: "index.js", chunkFileNames: "[name]-[hash].js", assetFileNames: "assets/[name]-[hash][extname]" }
          }
        }
      });
      plugin.frontend = "frontend/index.js";
      const styles = compiledStyles(frontendOutput);
      if (styles.length) plugin.styles = styles;
      else delete plugin.styles;
    }
    writeJson(pluginFile, plugin);
  }
  console.log(`Built ${packageManifest.name}@${packageManifest.version}`);
}

async function buildCommand(projectRoot, args) {
  for (const entry of selectWorkspaces(projectRoot, parseSelection(args))) await buildWorkspace(entry);
}

async function publishCommand(projectRoot, args) {
  const entries = selectWorkspaces(projectRoot, parseSelection(args));
  if (!entries.length) throw new Error("No plugin workspaces found under external/.");
  for (const entry of entries) {
    if (entry.manifest.private) throw new Error(`Cannot publish private plugin: ${entry.manifest.name}`);
    await buildWorkspace(entry);
    await runNpm(["publish", entry.root, "--access", "public"], projectRoot);
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
