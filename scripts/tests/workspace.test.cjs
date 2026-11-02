const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { initialize } = require("../../packages/init-elementspanel/index.cjs");
const {
  setupWorkspace,
  buildCommand,
  publishCommand,
  installCommand
} = require("../../packages/init-elementspanel/workspace.cjs");
const { createLoader } = require("./helpers.cjs");
const { mockNpmView } = require("./npm-fixtures.cjs");
const { readPluginManifest } = createLoader()("core/common/src/plugin_manifest.ts");

test("initialized projects create npm plugin workspaces outside the runtime source tree", async (t) => {
  const npm = mockNpmView(t);
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "elementspanel-workspace-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));

  await initialize({ directory: project, mode: "full", install: false });
  await setupWorkspace(project, ["example", "--both", "--no-install"]);

  const root = JSON.parse(fs.readFileSync(path.join(project, "package.json"), "utf8"));
  const plugin = JSON.parse(
    fs.readFileSync(path.join(project, "external/example/package.json"), "utf8")
  );
  assert.deepEqual(root.workspaces, ["external/*"]);
  assert.equal(root.dependencies["epanel-plugin-example"], undefined);
  for (const side of ["panel", "daemon"]) {
    const service = JSON.parse(fs.readFileSync(path.join(project, side, "package.json")));
    assert.equal(service.dependencies["epanel-plugin-example"], "file:../external/example");
    assert.equal(service.elementspanel.plugins.example, "epanel-plugin-example");
  }
  for (const side of ["panel", "daemon"]) {
    assert.equal(root.dependencies[`@elementspanel/${side}`], npm.versions[side]);
    assert.equal(plugin.peerDependencies[`@elementspanel/${side}`], `^${npm.versions[side]}`);
  }
  assert.equal(plugin.elementspanel.panel.directory, "panel");
  assert.equal(plugin.elementspanel.daemon.directory, "daemon");
  assert.equal(plugin.elementspanel.id, "example");
  assert.equal(plugin.elementspanel.dual, true);
  assert.equal(plugin.version, "0.1.0");
  assert.equal(plugin.description, "ElementsPanel example plugin");
  assert.deepEqual(plugin.elementspanel.panel.frontendInject, ["console", "i18n"]);
  assert.ok(plugin.scripts.build.startsWith('node -e "'));
  assert.ok(plugin.scripts.build.endsWith('"'));
  assert.doesNotMatch(plugin.scripts.build, /epanel-workspace|scripts\/build/);
  assert.doesNotThrow(() => new vm.Script(plugin.scripts.build.slice(9, -1)));
  assert.equal(plugin.scripts.prepack, "npm run build");
  for (const tool of ["esbuild", "vite", "@vitejs/plugin-vue", "@vitejs/plugin-vue-jsx", "vue"])
    assert.ok(plugin.devDependencies[tool], tool);
  for (const side of ["panel", "daemon"]) {
    const directory = path.join(project, "external/example", side);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, "plugin.json"))), {
      backend: "backend/index.cjs",
      ...(side === "panel" ? { frontend: "frontend/index.js" } : {})
    });
    const metadata = readPluginManifest(directory);
    assert.equal(metadata.id, plugin.elementspanel.id);
    assert.equal(metadata.version, plugin.version);
    assert.equal(metadata.dual, plugin.elementspanel.dual);
    assert.equal(metadata.description, plugin.description);
    assert.deepEqual(metadata.frontendInject, side === "panel" ? ["console", "i18n"] : undefined);
  }
  assert.ok(fs.existsSync(path.join(project, "external/example/panel/src/frontend.ts")));
  assert.ok(fs.existsSync(path.join(project, "external/example/daemon/src/backend/index.ts")));
  assert.equal(
    fs.existsSync(path.join(project, "external/example/panel/backend/index.cjs")),
    false
  );
  plugin.version = "0.2.0";
  fs.writeFileSync(path.join(project, "external/example/package.json"), JSON.stringify(plugin));
  for (const side of ["panel", "daemon"])
    assert.equal(readPluginManifest(path.join(project, "external/example", side)).version, "0.2.0");
});

test("project installation installs each side in its own npm directory", async (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "elementspanel-side-install-"));
  const previousNpmCLI = process.env.npm_execpath;
  t.after(() => {
    if (previousNpmCLI === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = previousNpmCLI;
    fs.rmSync(project, { recursive: true, force: true });
  });
  await initialize({
    directory: project,
    mode: "full",
    install: false,
    versions: { panel: "1.0.0", daemon: "1.0.0" },
    builtinPlugins: {}
  });
  const log = path.join(project, "npm-calls.jsonl");
  const projectFile = path.join(project, "package.json");
  const projectManifest = JSON.parse(fs.readFileSync(projectFile));
  delete projectManifest.scripts.dev;
  delete projectManifest.scripts["dev:panel"];
  projectManifest.scripts["dev:daemon"] = "custom-daemon-dev";
  fs.writeFileSync(projectFile, JSON.stringify(projectManifest));
  const npmCLI = path.join(project, "npm-cli.cjs");
  fs.writeFileSync(
    npmCLI,
    `require("node:fs").appendFileSync(${JSON.stringify(log)}, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }) + "\\n");`
  );
  process.env.npm_execpath = npmCLI;
  await installCommand(project);
  const updated = JSON.parse(fs.readFileSync(projectFile));
  assert.equal(updated.scripts.dev, "epanel dev --with-daemon");
  assert.equal(updated.scripts["dev:panel"], "epanel dev");
  assert.equal(updated.scripts["dev:daemon"], "custom-daemon-dev");
  assert.equal(fs.readFileSync(path.join(project, "README.md"), "utf8"), "# ElementsPanel\n");
  fs.rmSync(path.join(project, "daemon"), { recursive: true });
  await setupWorkspace(project, ["shared", "--both", "--no-install"]);
  assert.equal(fs.existsSync(path.join(project, "daemon")), false);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(project, "panel/package.json"))).dependencies["epanel-plugin-shared"],
    "file:../external/shared"
  );
  await installCommand(project, ["--ignore-scripts"]);
  const args = ["install", "--no-fund", "--no-audit", "--workspaces=false"];
  assert.deepEqual(
    fs
      .readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
    [
      { cwd: path.join(project, "panel"), args },
      { cwd: path.join(project, "daemon"), args },
      { cwd: path.join(project, "panel"), args: [...args, "--ignore-scripts"] }
    ]
  );
  await assert.rejects(installCommand(project, ["--unknown"]), /Unknown install option/);
});

test("plugin packages own their build commands and workspace commands only invoke npm", async (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "elements workspace 构建-"));
  const previousNpmCLI = process.env.npm_execpath;
  t.after(() => {
    if (previousNpmCLI === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = previousNpmCLI;
    fs.rmSync(project, { recursive: true, force: true });
  });
  await initialize({
    directory: project,
    mode: "full",
    versions: { panel: "1.2.3", daemon: "^2.3.4" },
    builtinPlugins: {},
    install: false
  });
  const entry = await setupWorkspace(project, ["@example/owned", "--daemon", "--no-install"]);
  assert.equal(entry.manifest.peerDependencies["@elementspanel/daemon"], "^2.3.4");
  assert.match(fs.readFileSync(path.join(entry.root, "README.md"), "utf8"), /--workspace @example\/epanel-plugin-owned/);
  assert.deepEqual(Object.keys(entry.manifest.devDependencies), ["esbuild"]);
  const buildScript = entry.manifest.scripts.build;
  const compileCalls = [];
  const simulatedProcess = { cwd: () => entry.root };
  await vm.runInNewContext(buildScript.slice(9, -1), {
    require: (id) =>
      id === "esbuild" ? { build: async (options) => compileCalls.push(options) } : require(id),
    process: simulatedProcess,
    console: { log() {}, error(error) { throw error; } }
  });
  assert.equal(simulatedProcess.exitCode, undefined);
  assert.equal(compileCalls.length, 1);
  assert.equal(compileCalls[0].entryPoints[0], path.join(entry.root, "daemon/src/backend/index.ts"));
  assert.equal(compileCalls[0].outfile, path.join(entry.root, "daemon/backend/index.cjs"));
  assert.equal(fs.existsSync(compileCalls[0].outfile), false);

  const log = path.join(project, "npm-calls.jsonl");
  const npmCLI = path.join(project, "npm-cli.cjs");
  fs.writeFileSync(
    npmCLI,
    `require("node:fs").appendFileSync(${JSON.stringify(
      log
    )}, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }) + "\\n");`
  );
  process.env.npm_execpath = npmCLI;
  await buildCommand(project, ["owned"]);
  await publishCommand(project, ["owned"]);

  const packageFile = path.join(entry.root, "package.json");
  const legacy = JSON.parse(fs.readFileSync(packageFile));
  legacy.scripts.build = "epanel-workspace build owned";
  delete legacy.devDependencies;
  fs.writeFileSync(packageFile, JSON.stringify(legacy));
  await buildCommand(project, ["owned"]);
  const updated = JSON.parse(fs.readFileSync(packageFile));
  assert.equal(updated.version, entry.manifest.version);
  assert.equal(updated.scripts.build, buildScript);
  assert.deepEqual(Object.keys(updated.devDependencies), ["esbuild"]);
  assert.deepEqual(
    fs
      .readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
    [
      { cwd: entry.root, args: ["run", "build"] },
      { cwd: entry.root, args: ["publish", "--access", "public"] },
      { cwd: entry.root, args: ["run", "build"] }
    ]
  );
});
