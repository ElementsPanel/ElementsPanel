const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { initialize } = require("../../packages/init-elementspanel/index.cjs");
const {
  setupWorkspace,
  setupCommand,
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
  assert.equal(plugin.scripts.build, "node scripts/build.cjs");
  const buildSource = fs.readFileSync(path.join(project, "external/example/scripts/build.cjs"), "utf8");
  assert.doesNotThrow(() => new vm.Script(buildSource));
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

async function wizardProject(t) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "elementspanel-workspace-wizard-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  await initialize({
    directory: project,
    mode: "full",
    versions: { panel: "1.0.0", daemon: "1.0.0" },
    builtinPlugins: {},
    install: false
  });
  return project;
}

for (const type of ["panel", "daemon", "both"]) {
  test(`workspace wizard creates the selected ${type} plugin without writing before confirmation`, async (t) => {
    const project = await wizardProject(t);
    const marks = [];
    let closed = false;
    const result = await setupCommand(project, ["--language", "en", "--no-install"], {
      interactive: true,
      prompt: {
        async text(config) {
          assert.equal(config.title, "Name");
          assert.equal(config.placeholder, "example");
          return { value: `wizard-${type}`, mark: (...args) => marks.push(args) };
        },
        async select(config) {
          assert.equal(config.title, "Type");
          assert.deepEqual(
            config.options.map((option) => option.value),
            ["panel", "daemon", "both"]
          );
          assert.equal(config.defaultIndex, 0);
          assert.match(config.hint, /↑\/↓.*Enter/);
          assert.equal(fs.existsSync(path.join(project, "external")), false);
          return type;
        },
        close() {
          closed = true;
        }
      }
    });
    assert.equal(closed, true);
    assert.deepEqual(marks, [["done", `epanel-plugin-wizard-${type}`]]);
    assert.equal(result.manifest.elementspanel.dual, type === "both" ? true : undefined);
    assert.equal(result.manifest.version, "0.1.0");
    for (const side of ["panel", "daemon"]) {
      const selected = type === "both" || type === side;
      assert.equal(fs.existsSync(path.join(result.root, side)), selected);
      assert.equal(Boolean(result.manifest.elementspanel[side]), selected);
      const service = JSON.parse(fs.readFileSync(path.join(project, side, "package.json")));
      assert.equal(Boolean(service.dependencies[result.manifest.name]), selected);
    }
  });
}

test("workspace wizard follows the system language and retries invalid or existing names safely", async (t) => {
  const project = await wizardProject(t);
  const previousLanguage = process.env.LC_ALL;
  process.env.LC_ALL = "zh_CN.UTF-8";
  t.after(() => {
    if (previousLanguage === undefined) delete process.env.LC_ALL;
    else process.env.LC_ALL = previousLanguage;
  });
  const existing = path.join(project, "external/existing");
  fs.mkdirSync(existing, { recursive: true });
  fs.writeFileSync(path.join(existing, "keep.txt"), "keep");
  const inputs = ["", "../escape", "@other/existing", "@acme/retrying"];
  const marks = [];
  const errors = t.mock.method(console, "error", () => {});
  const messages = t.mock.method(console, "log", () => {});
  const result = await setupCommand(project, ["--no-install"], {
    interactive: true,
    prompt: {
      async text(config) {
        assert.equal(config.title, "名称");
        assert.ok(inputs.length, "The name prompt must finish after a valid name");
        return { value: inputs.shift(), mark: (...args) => marks.push(args) };
      },
      async select(config) {
        assert.equal(config.title, "类型");
        assert.match(config.options[2].label, /双端/);
        assert.match(config.hint, /回车/);
        return "both";
      }
    }
  });
  assert.deepEqual(marks.map(([status]) => status), ["error", "error", "error", "done"]);
  assert.equal(errors.mock.callCount(), 0, "Marked errors must not also print a duplicate message");
  assert.match(marks[0][1], /请输入名称/);
  assert.match(marks[2][1], /工作区已存在/);
  assert.match(messages.mock.calls[0].arguments[0], /已创建工作区/);
  assert.equal(result.manifest.name, "@acme/epanel-plugin-retrying");
  assert.equal(fs.readFileSync(path.join(existing, "keep.txt"), "utf8"), "keep");
  assert.deepEqual(fs.readdirSync(path.join(project, "external")).sort(), ["existing", "retrying"]);
});

for (const [name, args, expectedPrompts, type] of [
  ["name", ["provided-name"], ["type"], "daemon"],
  ["type", ["--both"], ["name"], "both"],
  ["both", ["provided-both", "--daemon"], [], "daemon"],
  ["defaults", ["automated", "--yes"], [], "panel"]
]) {
  test(`workspace setup keeps supplied ${name} arguments and only prompts for missing fields`, async (t) => {
    const project = await wizardProject(t);
    const prompts = [];
    const result = await setupCommand(project, [...args, "--no-install", "--language", "en"], {
      interactive: true,
      prompt: {
        async text() {
          prompts.push("name");
          return { value: "provided-type" };
        },
        async select() {
          prompts.push("type");
          return type;
        }
      }
    });
    assert.deepEqual(prompts, expectedPrompts);
    assert.deepEqual(
      ["panel", "daemon"].filter((side) => result.manifest.elementspanel[side]),
      type === "both" ? ["panel", "daemon"] : [type]
    );
  });
}

test("workspace setup CLI stays noninteractive in scripts and offers help outside a project", async (t) => {
  const project = await wizardProject(t);
  const cli = path.resolve(__dirname, "../../packages/init-elementspanel/workspace.cjs");
  const invoke = (args) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd: project,
      encoding: "utf8",
      timeout: 10_000
    });
  const missing = invoke(["setup", "--no-install", "--language", "en"]);
  assert.equal(missing.status, 1, missing.stderr);
  assert.match(missing.stderr, /Enter a name/);
  assert.equal(fs.existsSync(path.join(project, "external")), false);
  const ready = invoke(["setup", "scripted", "--dual", "--no-install", "--language", "en"]);
  assert.equal(ready.status, 0, ready.stderr);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(project, "external/scripted/package.json"))).elementspanel
      .dual,
    true
  );
  const original = fs.readFileSync(path.join(project, "external/scripted/package.json"), "utf8");
  const repeated = invoke(["setup", "scripted", "--panel", "--no-install", "--language", "en"]);
  assert.equal(repeated.status, 1);
  assert.match(repeated.stderr, /already exists/);
  assert.equal(
    fs.readFileSync(path.join(project, "external/scripted/package.json"), "utf8"),
    original
  );
  for (const args of [["--language", "unknown"], ["--unknown"], ["--yes"]]) {
    await assert.rejects(setupCommand(project, [...args, "--no-install"], { interactive: false }));
  }
  assert.deepEqual(fs.readdirSync(path.join(project, "external")), ["scripted"]);
  const help = spawnSync(process.execPath, [cli, "setup", "--help", "--language", "zh"], {
    cwd: os.tmpdir(),
    encoding: "utf8",
    timeout: 10_000
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /npm run setup/);
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
  const readme = fs.readFileSync(path.join(entry.root, "README.md"), "utf8");
  assert.match(readme, /scripts\/build\.cjs/);
  assert.match(readme, /--workspace @example\/epanel-plugin-owned/);
  assert.deepEqual(Object.keys(entry.manifest.devDependencies), ["esbuild"]);
  const buildScript = entry.manifest.scripts.build;
  const buildFile = path.join(entry.root, "scripts/build.cjs");
  const buildSource = fs.readFileSync(buildFile, "utf8");
  const compileCalls = [];
  const simulatedProcess = { cwd: () => project };
  await vm.runInNewContext(buildSource, {
    __dirname: path.dirname(buildFile),
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
  fs.unlinkSync(buildFile);
  await buildCommand(project, ["owned"]);
  const updated = JSON.parse(fs.readFileSync(packageFile));
  assert.equal(updated.version, entry.manifest.version);
  assert.equal(updated.scripts.build, buildScript);
  assert.equal(fs.readFileSync(buildFile, "utf8"), buildSource);
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
