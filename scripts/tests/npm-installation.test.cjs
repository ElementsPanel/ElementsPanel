const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const { installNpmPlugin, mockNpmView } = require("./npm-fixtures.cjs");
const initializer = require("../../packages/init-elementspanel/index.cjs");
const { installPluginResolution } = require("../runtime/plugin-resolution.cjs");
const { resolveNpmPlugins } = require("../runtime/npm-plugins.cjs");
const { parseArgs, planWorkers } = require("../runtime/cli.cjs");
const repository = path.resolve(__dirname, "../..");

function write(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, typeof value === "string" ? value : JSON.stringify(value));
}

function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "elements npm 验证-"));
  const processes = [];
  t.after(async () => {
    for (const { child, closed } of processes) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await closed;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, processes };
}

function execute(fixture, filename, args = [], cwd = fixture.root, env = process.env) {
  let output = "";
  const child = spawn(process.execPath, [filename, ...args], {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"]
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000);
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, output });
    });
  });
  fixture.processes.push({ child, closed });
  return { child, closed, output: () => output };
}

async function until(check, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for fixture process.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

for (const mode of ["full", "panel", "daemon"]) {
  test(`initializer creates an installable ${mode} project with independent user directories`, async (t) => {
    const f = temporary(t);
    const directory = path.join(f.root, "My Panel");
    let installed;
    const npm = mockNpmView(t);
    const versions = npm.versions;
    const result = await initializer.initialize({
      directory,
      mode,
      installer: async (target) => {
        installed = target;
        const manifest = JSON.parse(fs.readFileSync(path.join(target, "package.json")));
        assert.equal(manifest.private, true);
        assert.ok(manifest.scripts.start);
        if (mode !== "daemon")
          assert.equal(
            JSON.parse(fs.readFileSync(path.join(target, "panel/data/SystemConfig/config.json")))
              .httpPort,
            23333
          );
        if (mode !== "panel")
          assert.equal(
            JSON.parse(fs.readFileSync(path.join(target, "daemon/data/Config/global.json"))).port,
            24444
          );
      }
    });
    assert.equal(installed, directory);
    const dependencies = result.manifest.dependencies;
    assert.equal(
      dependencies["@elementspanel/panel"],
      mode === "daemon" ? undefined : versions.panel
    );
    assert.equal(
      dependencies["@elementspanel/daemon"],
      mode === "panel" ? undefined : versions.daemon
    );
    assert.equal(fs.existsSync(path.join(directory, "panel")), mode !== "daemon");
    assert.equal(fs.existsSync(path.join(directory, "daemon")), mode !== "panel");
    assert.equal(result.manifest.scripts.postinstall, "epanel-workspace install");
    assert.equal(result.manifest.scripts["update:plugins"], "init --update-plugins");
    assert.equal(dependencies["@elementspanel/epanel-plugin-i18n"], undefined);
    const ignore = fs.readFileSync(path.join(directory, ".gitignore"), "utf8");
    for (const side of ["panel", "daemon"].filter((side) => mode === "full" || mode === side)) {
      const service = JSON.parse(fs.readFileSync(path.join(directory, side, "package.json")));
      assert.equal(service.private, true);
      assert.equal(service.dependencies["@elementspanel/epanel-plugin-i18n"], npm.pluginVersion);
      assert.deepEqual(service.elementspanel, {
        side,
        plugins: { i18n: "@elementspanel/epanel-plugin-i18n" }
      });
      assert.ok(ignore.includes(`!${side}/package.json\n!${side}/package-lock.json\n`));
    }
    assert.equal(
      result.manifest.scripts.start,
      mode === "full"
        ? "epanel start --with-daemon"
        : mode === "panel"
        ? "epanel start"
        : "epanel-daemon start"
    );
    const queries = npm.queries();
    assert.equal(queries.filter((args) => args[1].includes("epanel-plugin-i18n@latest")).length, 1);
    assert.deepEqual(
      queries
        .filter((args) => !args[1].includes("epanel-plugin-"))
        .map((args) => args[1])
        .sort(),
      ["panel", "daemon"]
        .filter((side) => mode === "full" || mode === side)
        .map((side) => `@elementspanel/${side}@latest`).sort()
    );
    for (const args of queries)
      assert.deepEqual([args[0], ...args.slice(2)], ["view", "--json", "--prefer-online"]);
    const pinned = await initializer.initialize({
      directory: path.join(f.root, "pinned"),
      mode,
      versions: { panel: "3.4.5", daemon: "4.5.6" },
      builtinPlugins: {},
      install: false
    });
    for (const side of ["panel", "daemon"].filter((side) => mode === "full" || mode === side))
      assert.equal(
        pinned.manifest.dependencies[`@elementspanel/${side}`],
        side === "panel" ? "3.4.5" : "4.5.6"
      );
    assert.deepEqual(npm.queries(), queries);
  });
}

test("updating built-in plugins only changes side manifests and preserves custom dependencies and data", async (t) => {
  const f = temporary(t);
  const npm = mockNpmView(t);
  const directory = path.join(f.root, "project");
  const name = "@elementspanel/epanel-plugin-i18n";
  await initializer.initialize({
    directory,
    mode: "full",
    install: false,
    versions: { panel: "1.0.1", daemon: "1.0.2" },
    builtinPlugins: {
      panel: { i18n: { name, version: "0.1.0" } },
      daemon: { i18n: { name, version: "0.2.0" } }
    }
  });
  const rootFile = path.join(directory, "package.json");
  const rootBefore = fs.readFileSync(rootFile, "utf8");
  const data = new Map();
  for (const side of ["panel", "daemon"]) {
    const filename = path.join(directory, side, "package.json");
    const manifest = JSON.parse(fs.readFileSync(filename));
    manifest.dependencies["epanel-plugin-custom"] = "file:../external/custom";
    manifest.elementspanel.plugins.custom = "epanel-plugin-custom";
    manifest.description = "Keep this field";
    write(filename, manifest);
    const config = path.join(
      directory,
      side,
      side === "panel" ? "data/SystemConfig/config.json" : "data/Config/global.json"
    );
    data.set(config, fs.readFileSync(config, "utf8"));
    const extra = path.join(directory, side, "data/custom.txt");
    write(extra, `${side} user data`);
    data.set(extra, fs.readFileSync(extra, "utf8"));
  }
  let installed;
  const result = await initializer.updateBuiltinPlugins({
    directory,
    installer: async (target) => {
      installed = target;
      for (const side of ["panel", "daemon"]) {
        const manifest = JSON.parse(fs.readFileSync(path.join(target, side, "package.json")));
        assert.equal(manifest.dependencies[name], npm.pluginVersion);
        assert.equal(manifest.dependencies["epanel-plugin-custom"], "file:../external/custom");
        assert.equal(manifest.elementspanel.plugins.custom, "epanel-plugin-custom");
        assert.equal(manifest.description, "Keep this field");
      }
    }
  });
  assert.equal(result.updated, true);
  assert.equal(installed, directory);
  assert.equal(fs.readFileSync(rootFile, "utf8"), rootBefore);
  for (const [filename, before] of data) assert.equal(fs.readFileSync(filename, "utf8"), before);
  assert.deepEqual(
    npm
      .queries()
      .map((args) => args[1])
      .sort(),
    ["@elementspanel/panel@1.0.1", "@elementspanel/daemon@1.0.2", `${name}@latest`].sort()
  );
});

test("the update CLI selects one side and can leave installation for later", async (t) => {
  const f = temporary(t);
  const npm = mockNpmView(t);
  const directory = path.join(f.root, "project");
  const name = "@elementspanel/epanel-plugin-i18n";
  await initializer.initialize({
    directory,
    mode: "full",
    install: false,
    versions: { panel: "1.0.1", daemon: "1.0.2" },
    builtinPlugins: {
      panel: { i18n: { name, version: "0.1.0" } },
      daemon: { i18n: { name, version: "0.2.0" } }
    }
  });
  const daemonFile = path.join(directory, "daemon/package.json");
  const before = fs.readFileSync(daemonFile, "utf8");
  const result = await execute(
    f,
    path.join(repository, "packages/init-elementspanel/bin.cjs"),
    ["--update-plugins", "--template", "panel", "--no-install", "--language", "zh"],
    directory
  ).closed;
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /已更新/);
  assert.match(result.output, /\n  npm install\n  npm start/);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(directory, "panel/package.json"))).dependencies[name],
    npm.pluginVersion
  );
  assert.equal(fs.readFileSync(daemonFile, "utf8"), before);
  assert.equal(fs.existsSync(path.join(directory, "node_modules")), false);
  assert.deepEqual(
    npm
      .queries()
      .map((args) => args[1])
      .sort(),
    ["@elementspanel/panel@1.0.1", `${name}@latest`].sort()
  );
});

test("isolated plugin installation is independent of host asset hashes and checks public interfaces", async (t) => {
  const f = temporary(t);
  const npm = mockNpmView(t);
  const i18n = "@elementspanel/epanel-plugin-i18n";
  const consoleName = "@elementspanel/epanel-plugin-console";
  const host = {
    version: "1.0.0",
    elementspanel: {
      plugins: { i18n, console: consoleName }, frontendApi: 1,
      frontendModules: ["vue", "@elements-panel/sdk"], frontendAssets: ["assets/new-host-hash.js"]
    }
  };
  npm.metadata("@elementspanel/panel", host);
  npm.metadata(i18n, {
    version: "1.0.7", elementspanel: { id: "i18n", panel: {
      frontendApi: 1, frontendImports: ["vue", "@elements-panel/sdk"],
      frontendExports: { ".": "frontend/exports/index.js" }
    } }
  });
  npm.metadata(consoleName, {
    version: "1.0.10", elementspanel: { id: "console", panel: {
      frontendApi: 1, frontendImports: [i18n]
    } }
  });
  const result = await initializer.initialize({ directory: path.join(f.root, "first"), mode: "panel", install: false });
  assert.equal(result.manifest.dependencies["@elementspanel/panel"], "1.0.0");
  host.version = "1.0.1";
  host.elementspanel.frontendAssets = ["assets/unrelated-hash.js"];
  npm.metadata("@elementspanel/panel", host);
  await initializer.initialize({ directory: path.join(f.root, "second"), mode: "panel", install: false });
  host.elementspanel.frontendModules = [];
  npm.metadata("@elementspanel/panel", host);
  await assert.rejects(
    initializer.initialize({ directory: path.join(f.root, "missing-api"), mode: "panel", install: false }),
    /frontend modules or legacy assets unavailable/
  );
  assert.equal(fs.existsSync(path.join(f.root, "missing-api")), false);
});

test("registry failures and incompatible plugin builds leave manifests untouched", async (t) => {
  const name = "@elementspanel/epanel-plugin-i18n";
  const plugin = {
    version: "9.8.7",
    elementspanel: {
      id: "i18n",
      panel: { frontendAssets: [] },
      daemon: {}
    }
  };
  for (const [label, packageName, metadata, expected] of [
    ["plugin query fails", name, null, /Could not query/],
    [
      "plugin id changes",
      name,
      { ...plugin, elementspanel: { ...plugin.elementspanel, id: "renamed" } },
      /Invalid panel metadata/
    ],
    [
      "panel assets differ",
      name,
      {
        ...plugin,
        elementspanel: {
          ...plugin.elementspanel,
          panel: { frontendAssets: ["assets/i18n-old.js"] }
        }
      },
      /frontend modules or legacy assets unavailable/
    ],
    [
      "old asset metadata is absent",
      name,
      { ...plugin, elementspanel: { ...plugin.elementspanel, panel: {} } },
      /frontend modules or legacy assets unavailable/
    ],
    [
      "daemon metadata is absent",
      name,
      { ...plugin, elementspanel: { id: "i18n", panel: { frontendAssets: [] } } },
      /Invalid daemon metadata/
    ],
    [
      "old runtime catalogue is absent",
      "@elementspanel/panel",
      { version: "1.0.1", dependencies: { [name]: "0.1.0" } },
      /Missing built-in plugin catalogue/
    ]
  ]) {
    await t.test(label, async (t) => {
      const f = temporary(t);
      const npm = mockNpmView(t);
      npm.metadata(packageName, metadata);
      const directory = path.join(f.root, "existing");
      await initializer.initialize({
        directory,
        install: false,
        versions: { panel: "1.0.1", daemon: "1.0.2" },
        builtinPlugins: {
          panel: { i18n: { name, version: "0.1.0" } },
          daemon: { i18n: { name, version: "0.2.0" } }
        }
      });
      const files = ["package.json", "panel/package.json", "daemon/package.json"].map((file) =>
        path.join(directory, file)
      );
      const before = files.map((file) => fs.readFileSync(file, "utf8"));
      let installed = false;
      await assert.rejects(
        initializer.updateBuiltinPlugins({
          directory,
          installer: async () => {
            installed = true;
          }
        }),
        expected
      );
      assert.deepEqual(
        files.map((file) => fs.readFileSync(file, "utf8")),
        before
      );
      assert.equal(installed, false);
      const newProject = path.join(f.root, "new-project");
      await assert.rejects(
        initializer.initialize({ directory: newProject, install: false }),
        expected
      );
      assert.equal(fs.existsSync(newProject), false);
    });
  }
});

test("initializer preserves existing projects and rejects symlink destinations", async (t) => {
  const f = temporary(t);
  const project = path.join(f.root, "existing");
  write(path.join(project, "data/keep.json"), "existing data");
  await assert.rejects(initializer.initialize({ directory: project, install: false }), /not empty/);
  assert.equal(fs.existsSync(path.join(project, "package.json")), false);
  assert.equal(fs.readFileSync(path.join(project, "data/keep.json"), "utf8"), "existing data");
  fs.symlinkSync(project, path.join(f.root, "linked"), "junction");
  await assert.rejects(
    initializer.initialize({ directory: path.join(f.root, "linked"), install: false }),
    /regular directory/
  );
});

test("initializer retains resolved versions after install failure and can skip dependency installation", async (t) => {
  const f = temporary(t);
  const npm = mockNpmView(t);
  const project = path.join(f.root, "retry");
  await assert.rejects(
    initializer.initialize({
      directory: project,
      installer: async () => {
        throw new Error("network unavailable");
      }
    }),
    /network unavailable/
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, "package.json"))).dependencies, {
    "@elementspanel/panel": npm.versions.panel,
    "@elementspanel/daemon": npm.versions.daemon
  });
  assert.ok(fs.existsSync(path.join(project, "daemon")));
  const output = execute(f, path.join(repository, "packages/init-elementspanel/bin.cjs"), [
    "offline",
    "--no-install",
    "--yes",
    "--template",
    "daemon"
  ]);
  const result = await output.closed;
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /\n  cd /);
  assert.match(result.output, /\n  npm install\n  npm start/);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(f.root, "offline/package.json"))).dependencies,
    { "@elementspanel/daemon": npm.versions.daemon }
  );
  assert.equal(fs.existsSync(path.join(f.root, "offline/node_modules")), false);
});

test("initializer rejects failed and invalid npm version queries before writing a project", async (t) => {
  const f = temporary(t);
  for (const [name, versions] of [["unavailable", {}], ["invalid", { panel: "latest" }]]) {
    await t.test(name, async (t) => {
      mockNpmView(t, versions);
      const directory = path.join(f.root, name);
      let installed = false;
      await assert.rejects(
        initializer.initialize({
          directory,
          mode: "panel",
          language: "zh",
          installer: async () => { installed = true; }
        }),
        /无法从 npm 查询 @elementspanel\/panel 的最新版本/
      );
      assert.equal(fs.existsSync(directory), false);
      assert.equal(installed, false);
    });
  }
});

function wizard(answers) {
  const remaining = [...answers];
  const questions = [];
  return {
    questions,
    async question(message) {
      questions.push(message);
      assert.ok(remaining.length, `Unexpected question: ${message}`);
      return remaining.shift();
    }
  };
}

for (const [mode, choice] of [
  ["full", "1"],
  ["panel", "2"],
  ["daemon", "3"]
]) {
  test(`initializer wizard writes the chosen ${mode} ports before optionally installing dependencies`, async (t) => {
    const f = temporary(t);
    mockNpmView(t);
    const directory = path.join(f.root, mode);
    const prompt = wizard([
      directory,
      choice,
      ...(mode !== "daemon" ? ["30001"] : []),
      ...(mode !== "panel" ? ["30002"] : []),
      mode === "full" ? "n" : "y"
    ]);
    const options = await initializer.promptOptions(
      initializer.parseArgs(["--language", "en"]),
      prompt
    );
    let installed = false;
    await initializer.initialize({
      ...options,
      installer: async (target) => {
        installed = true;
        assert.equal(target, directory);
        for (const side of ["panel", "daemon"]) {
          if (mode !== "full" && mode !== side) continue;
          const config = JSON.parse(
            fs.readFileSync(
              path.join(
                target,
                side,
                side === "panel" ? "data/SystemConfig/config.json" : "data/Config/global.json"
              )
            )
          );
          assert.equal(
            side === "panel" ? config.httpPort : config.port,
            side === "panel" ? 30001 : 30002
          );
          assert.equal(config.language, "en_us");
        }
      }
    });
    assert.equal(options.language, "en");
    assert.equal(options.mode, mode);
    assert.equal(installed, mode !== "full");
    for (const side of ["panel", "daemon"]) {
      const selected = mode === "full" || mode === side;
      assert.equal(
        prompt.questions.some((question) => question.startsWith(`${side} listening port`)),
        selected
      );
      assert.equal(fs.existsSync(path.join(directory, side)), selected);
      if (selected) {
        const config = JSON.parse(
          fs.readFileSync(
            path.join(
              directory,
              side,
              side === "panel" ? "data/SystemConfig/config.json" : "data/Config/global.json"
            )
          )
        );
        assert.equal(
          side === "panel" ? config.httpPort : config.port,
          side === "panel" ? 30001 : 30002
        );
      }
    }
  });
}

test("initializer wizard retries invalid directories, choices, ports and installation answers", async (t) => {
  const f = temporary(t);
  const existing = path.join(f.root, "existing");
  const directory = path.join(f.root, "chosen");
  write(path.join(existing, "keep.txt"), "keep");
  const errors = t.mock.method(console, "error", () => {});
  const prompt = wizard([
    existing,
    directory,
    "invalid",
    "constructor",
    "__proto__",
    "1",
    "not-a-port",
    "65536",
    "30001",
    "30001",
    "30002",
    "maybe",
    "no"
  ]);
  const options = await initializer.promptOptions(
    initializer.parseArgs(["--language", "en"]),
    prompt
  );
  assert.equal(options.language, "en");
  assert.equal(options.directory, directory);
  assert.equal(options.panelPort, 30001);
  assert.equal(options.daemonPort, 30002);
  assert.equal(options.install, false);
  assert.equal(fs.existsSync(directory), false);
  assert.equal(fs.readFileSync(path.join(existing, "keep.txt"), "utf8"), "keep");
  assert.equal(errors.mock.callCount(), 8);
});

test("initializer wizard follows the system locale and translates Chinese prompts, errors and completion", async (t) => {
  const f = temporary(t);
  mockNpmView(t);
  const existing = path.join(f.root, "existing");
  const directory = path.join(f.root, "中文向导");
  write(path.join(existing, "keep.txt"), "keep");
  const previousLCAll = process.env.LC_ALL;
  process.env.LC_ALL = "zh_CN.UTF-8";
  t.after(() => {
    process.env.LC_ALL = previousLCAll;
  });
  const errors = t.mock.method(console, "error", () => {});
  const prompt = wizard([
    existing,
    directory,
    "0",
    "1",
    "bad-port",
    "31001",
    "31001",
    "31002",
    "maybe",
    "否"
  ]);
  const options = await initializer.promptOptions(initializer.parseArgs([]), prompt);
  assert.equal(options.language, "zh");
  assert.equal(options.install, false);
  assert.match(prompt.questions[0], /安装目录/);
  assert.ok(prompt.questions.some((question) => question.startsWith("安装内容")));
  assert.ok(prompt.questions.some((question) => question.startsWith("panel 监听端口")));
  assert.ok(prompt.questions.some((question) => question.startsWith("daemon 监听端口")));
  assert.ok(prompt.questions.some((question) => question.startsWith("是否立即安装依赖")));
  assert.equal(errors.mock.callCount(), 5);
  for (const [index, pattern] of [/安装目录非空/, /请选择/, /整数/, /不能相同/, /请输入/].entries())
    assert.match(errors.mock.calls[index].arguments[0], pattern);
  await initializer.initialize(options);
  for (const side of ["panel", "daemon"]) {
    const configFile = path.join(
      directory,
      side,
      side === "panel" ? "data/SystemConfig/config.json" : "data/Config/global.json"
    );
    assert.equal(JSON.parse(fs.readFileSync(configFile)).language, "zh_cn");
  }
  const result = await execute(f, path.join(repository, "packages/init-elementspanel/bin.cjs"), [
    "中文 CLI",
    "--language",
    "zh",
    "--template",
    "daemon",
    "--yes",
    "--no-install"
  ]).closed;
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /已成功初始化面板/);
  assert.match(result.output, /如需启动，请执行：/);
  assert.match(result.output, /\n  npm install\n  npm start/);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.root, "中文 CLI/daemon/data/Config/global.json")))
      .language,
    "zh_cn"
  );
  const invalid = await execute(f, path.join(repository, "packages/init-elementspanel/bin.cjs"), [
    "--panel-port",
    "invalid",
    "--language",
    "zh"
  ]).closed;
  assert.equal(invalid.code, 1, invalid.output);
  assert.match(invalid.output, /监听端口必须是/);
});

test("initializer rejects invalid or conflicting ports before creating the project", async (t) => {
  const f = temporary(t);
  for (const port of ["0", "65536", "1.5", "1e3", "abc"]) {
    assert.throws(() => initializer.parseArgs(["--panel-port", port]), /between 1 and 65535/);
    assert.throws(() => initializer.parseArgs(["--daemon-port", port]), /between 1 and 65535/);
  }
  const directory = path.join(f.root, "conflicting");
  assert.throws(() => initializer.parseArgs(["--language", "de"]), /--language must be/);
  await assert.rejects(
    initializer.initialize({ directory, language: "de", install: false }),
    /--language must be/
  );
  await assert.rejects(
    initializer.initialize({
      directory,
      panelPort: 23333,
      daemonPort: 23333,
      install: false
    }),
    /must be different/
  );
  assert.equal(fs.existsSync(directory), false);
});

test("initializer CLI supports custom ports and omits cd when initializing the current directory", async (t) => {
  const f = temporary(t);
  mockNpmView(t);
  const result = await execute(
    f,
    path.join(repository, "packages/init-elementspanel/bin.cjs"),
    [
      ".",
      "--yes",
      "--no-install",
      "--template",
      "full",
      "--panel-port",
      "1",
      "--daemon-port",
      "65535"
    ],
    f.root,
    { ...process.env, LC_ALL: "zh_CN.UTF-8" }
  ).closed;
  assert.equal(result.code, 0, result.output);
  assert.doesNotMatch(result.output, /\n  cd /);
  assert.match(result.output, /\n  npm install\n  npm start/);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.root, "panel/data/SystemConfig/config.json"))).httpPort,
    1
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.root, "panel/data/SystemConfig/config.json"))).language,
    "zh_cn"
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.root, "daemon/data/Config/global.json"))).port,
    65535
  );
});

function runtimeFixture(t, behavior = {}) {
  const f = temporary(t);
  const project = path.join(f.root, "user project");
  const log = path.join(f.root, "events.jsonl");
  fs.mkdirSync(project);
  write(path.join(project, "package.json"), { private: true });
  const packages = {};
  for (const side of ["panel", "daemon"]) {
    const root = (packages[side] = path.join(f.root, "package store", side));
    write(path.join(root, "package.json"), {
      name: `@elementspanel/${side}`,
      version: "1.0.0",
      dependencies: {}
    });
    fs.cpSync(path.join(repository, "scripts/runtime"), path.join(root, "runtime"), {
      recursive: true
    });
    for (const plugin of [
      "i18n",
      "storage",
      "runtime",
      "server",
      ...(side === "panel" ? ["console"] : [])
    ])
      installNpmPlugin(root, side, plugin, { projectRoot: project });
    write(path.join(root, "public/index.html"), "fixture");
    for (const name of ["pty", "file_zip", "7z"])
      write(
        path.join(
          project,
          side === "daemon" ? "daemon/lib" : "panel/lib",
          `${name}_${process.platform}_${process.arch}${process.platform === "win32" ? ".exe" : ""}`
        ),
        "fixture tool"
      );
    write(
      path.join(root, "bin.cjs"),
      `require('./runtime/cli.cjs').run(${JSON.stringify(side)}, __dirname);`
    );
    write(
      path.join(root, "app.js"),
      `
      const fs = require('node:fs');
      const side = ${JSON.stringify(side)};
      const report = type => fs.appendFileSync(${JSON.stringify(
        log
      )}, JSON.stringify({ type, side, cwd: process.cwd(), packageRoot: process.env.EPANEL_PACKAGE_ROOT, localConfig: process.env.EPANEL_LOCAL_DAEMON_CONFIG, pid: process.pid }) + '\\n');
      report('start');
      process.on('SIGTERM', () => { report('stop'); process.exit(0); });
      ${
        behavior[side] === "fail"
          ? "process.exit(4);"
          : behavior[side] === "hang"
          ? ""
          : "setTimeout(() => { report('ready'); process.send({ type: 'elementspanel:ready' }); }, 10);"
      }
      ${behavior[side] === "crash" ? "setTimeout(() => process.exit(7), 300);" : ""}
    `
    );
  }
  fs.mkdirSync(path.join(project, "node_modules/@elementspanel"), { recursive: true });
  fs.symlinkSync(
    packages.daemon,
    path.join(project, "node_modules/@elementspanel/daemon"),
    "junction"
  );
  const events = () =>
    fs.existsSync(log)
      ? fs
          .readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
  return { ...f, project, packages, events };
}

test("full startup waits for the daemon and shuts down both relocated workers through IPC", async (t) => {
  const f = runtimeFixture(t);
  const command = execute(f, path.join(f.packages.panel, "bin.cjs"), [
    "start",
    "--with-daemon",
    "--cwd",
    f.project
  ]);
  await until(() => f.events().some((event) => event.type === "ready" && event.side === "panel"));
  const events = f.events();
  assert.ok(
    events.findIndex((event) => event.type === "ready" && event.side === "daemon") <
      events.findIndex((event) => event.type === "start" && event.side === "panel")
  );
  for (const side of ["panel", "daemon"]) {
    const start = events.find((event) => event.type === "start" && event.side === side);
    assert.equal(start.cwd, path.join(f.project, side));
    assert.equal(start.packageRoot, f.packages[side]);
  }
  assert.equal(
    events.find((event) => event.side === "panel").localConfig,
    path.join(f.project, "daemon/data/Config/global.json")
  );
  command.child.kill("SIGTERM");
  const result = await command.closed;
  assert.equal(result.code, 0, result.output);
  assert.deepEqual(
    f
      .events()
      .filter((event) => event.type === "stop")
      .map((event) => event.side)
      .sort(),
    ["daemon", "panel"]
  );
  assert.equal(fs.existsSync(path.join(f.packages.panel, "data")), false);
});

for (const side of ["panel", "daemon"]) {
  test(`${side}: runtime updates wait for the reply and restart from the newly resolved package`, async (t) => {
    const f = runtimeFixture(t);
    const trigger = path.join(f.root, "update-runtime");
    const release = path.join(f.root, "update-reply-flushed");
    const name = `@elementspanel/${side}`;
    const installed = path.join(f.project, "node_modules", name);
    if (!fs.existsSync(installed)) fs.symlinkSync(f.packages[side], installed, "junction");
    write(path.join(f.project, "package.json"), { private: true, dependencies: { [name]: "1.0.0" } });
    const npmCLI = path.join(f.root, "npm-cli.cjs");
    const replacement = path.join(f.root, "updated package", side);
    write(npmCLI, `
      const fs = require('node:fs');
      const path = require('node:path');
      const args = process.argv.slice(2);
      const spec = args[args.indexOf('install') + 1];
      if (spec !== ${JSON.stringify(name + "@2.0.0")}) throw new Error('Unexpected npm operation');
      fs.mkdirSync(path.dirname(${JSON.stringify(replacement)}), { recursive: true });
      fs.cpSync(fs.realpathSync(${JSON.stringify(installed)}), ${JSON.stringify(replacement)}, { recursive: true });
      const file = path.join(${JSON.stringify(replacement)}, 'package.json');
      const metadata = JSON.parse(fs.readFileSync(file));
      metadata.version = '2.0.0';
      fs.writeFileSync(file, JSON.stringify(metadata));
      fs.unlinkSync(${JSON.stringify(installed)});
      fs.symlinkSync(${JSON.stringify(replacement)}, ${JSON.stringify(installed)}, 'junction');
      const manifestFile = path.join(process.cwd(), 'package.json');
      const manifest = JSON.parse(fs.readFileSync(manifestFile));
      manifest.dependencies[${JSON.stringify(name)}] = '2.0.0';
      fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    `);
    write(path.join(f.packages[side], "app.js"), String.raw`
      const fs = require('node:fs');
      const path = require('node:path');
      const { createLoader, from } = require(${JSON.stringify(path.join(repository, "scripts/tests/helpers.cjs"))});
      const load = createLoader({
        resolve(id, { filename, load, localRequire }) {
          if (id === 'mcsmanager-common') return Object.assign({}, ...[
            'plugin_manifest', 'plugin_contract', 'plugin_overrides', 'plugin_lifecycle',
            'plugin_revision', 'runtime_paths', 'plugin_modules', 'plugin_watch', 'plugin_npm', 'process_restart'
          ].map(name => load('core/common/src/' + name + '.ts')));
          const target = path.resolve(path.dirname(filename), id) + '.ts';
          return id.startsWith('.') && fs.existsSync(target) ? load(target) : localRequire(id);
        }
      });
      const { Context } = from(${JSON.stringify(side)})('cordis');
      const ctx = new Context();
      const loader = load(${JSON.stringify(side === "panel" ? "core/panel/src/app/plugin/loader.ts" : "core/daemon/src/plugin/loader.ts")}, { './context': { ctx } });
      const report = type => fs.appendFileSync(${JSON.stringify(path.join(f.root, "events.jsonl"))}, JSON.stringify({
        type, side: ${JSON.stringify(side)}, pid: process.pid,
        version: JSON.parse(fs.readFileSync(path.join(process.env.EPANEL_PACKAGE_ROOT, 'package.json'))).version,
        packageRoot: process.env.EPANEL_PACKAGE_ROOT, restarted: process.env.EPANEL_RESTARTED === '1'
      }) + '\n');
      process.on('SIGTERM', async () => { await ctx.stop(); await ctx.plugins.waitForDisposal(); process.exit(0); });
      async function main() {
        await loader[${JSON.stringify(side === "panel" ? "loadPanelPlugins" : "loadDaemonPlugins")} ]();
        await ctx.start();
        report('runtime-start');
        ctx.setInterval(() => {
          if (!fs.existsSync(${JSON.stringify(trigger)})) return;
          fs.unlinkSync(${JSON.stringify(trigger)});
          const reloadAfter = new Promise(resolve => {
            const timer = setInterval(() => {
              if (fs.existsSync(${JSON.stringify(release)})) { clearInterval(timer); resolve(); }
            }, 20);
          });
          void ctx.plugins.runtime.update({ version: '2.0.0', reloadAfter }).then(record => {
            if (record.version !== '2.0.0' || record.restartRequired) throw new Error('Runtime update was not scheduled');
            report('runtime-installed');
          }).catch(error => { console.error(error); process.exit(1); });
        }, 20);
        process.send({ type: 'elementspanel:ready' });
      }
      main().catch(error => { console.error(error); process.exit(1); });
    `);
    const command = execute(f, path.join(f.packages[side], "bin.cjs"), ["start", "--cwd", f.project], f.root, { ...process.env, npm_execpath: npmCLI });
    const starts = () => f.events().filter((event) => event.type === "runtime-start");
    await until(() => starts().length === 1);
    write(trigger, "update");
    await until(() => f.events().some((event) => event.type === "runtime-installed"));
    assert.equal(starts().length, 1, "the old process stays alive while the reply is pending");
    write(release, "flushed");
    await until(() => starts().length === 2);
    assert.equal(starts()[1].version, "2.0.0");
    assert.equal(starts()[1].packageRoot, replacement);
    assert.equal(starts()[1].restarted, true);
    assert.notEqual(starts()[1].pid, starts()[0].pid);
    command.child.kill("SIGTERM");
    const result = await command.closed;
    assert.equal(result.code, 0, result.output);
  });
}

test("daemon process restarts retain real instance PIDs, pipes, output and counters", async (t) => {
  const f = runtimeFixture(t);
  const log = path.join(f.root, "events.jsonl");
  const trigger = path.join(f.root, "restart");
  const release = path.join(f.root, "reply-flushed");
  const program = path.join(f.root, "instance.cjs");
  write(
    program,
    String.raw`
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', data => process.stdout.write('echo:' + data));
    setInterval(() => {}, 1000);
  `
  );
  write(
    path.join(f.packages.daemon, "app.js"),
    String.raw`
    const fs = require('node:fs');
    const { once } = require('node:events');
    const { createLoader } = require(${JSON.stringify(
      path.join(repository, "scripts/tests/helpers.cjs")
    )});
    const { requestProcessRestart } = createLoader()('core/common/src/process_restart.ts');
    const host = globalThis[Symbol.for('elementspanel.instance-process-host')];
    const report = (type, data = {}) => fs.appendFileSync(${JSON.stringify(log)},
      JSON.stringify({ type, side: 'daemon', pid: process.pid, ...data }) + '\n');
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function main() {
      const snapshots = await host.list();
      const previous = snapshots.find(item => item.id === 'running');
      const child = previous ? host.connect(previous) : host.spawn('running', process.execPath,
        [${JSON.stringify(program)}], { cwd: process.cwd(), env: process.env }, {
          startTimestamp: 123456, startCount: 4, autoRestartCount: 2
        });
      child.stdout.on('data', data => report('output', { text: data.toString() }));
      child.on('error', error => { console.error(error); process.exit(1); });
      if (!previous) await once(child, 'spawn');
      report('claimed', { instancePid: child.pid, metadata: child.metadata,
        restarted: process.env.EPANEL_RESTARTED === '1' });
      child.stdin.write('online\n');
      process.on('SIGTERM', () => { report('stop'); process.exit(0); });
      process.send({ type: 'elementspanel:ready' });
      const ctx = { logger: console,
        async parallel(event) {
          report(event);
          child.stdin.write('during-restart\n');
          await delay(100);
        },
        async stop() { clearInterval(poll); report('disposed'); }
      };
      ctx.root = ctx;
      const poll = setInterval(() => {
        if (!fs.existsSync(${JSON.stringify(trigger)})) return;
        fs.unlinkSync(${JSON.stringify(trigger)});
        const ready = async () => {
          while (!fs.existsSync(${JSON.stringify(release)})) await delay(10);
        };
        requestProcessRestart(ctx, async () => report('cleanup-finished'), ready);
        requestProcessRestart(ctx, async () => report('duplicate-restart'), ready);
      }, 20);
    }
    main().catch(error => { console.error(error); process.exit(1); });
  `
  );
  const command = execute(f, path.join(f.packages.panel, "bin.cjs"), [
    "start",
    "--with-daemon",
    "--cwd",
    f.project
  ]);
  const claims = () => f.events().filter((event) => event.type === "claimed");
  await until(() => claims().length === 1);
  const original = claims()[0];
  write(trigger, "restart");
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(claims().length, 1, "the installation reply must finish before restart");
  assert.equal(
    f.events().some((event) => event.type === "process/restarting"),
    false
  );
  write(release, "flushed");
  await until(() => claims().length === 2);
  assert.notEqual(claims()[1].pid, original.pid, "the daemon worker must really exit");
  assert.equal(claims()[1].instancePid, original.instancePid);
  assert.deepEqual(claims()[1].metadata, original.metadata);
  assert.equal(original.restarted, false);
  assert.equal(claims()[1].restarted, true);
  await until(() =>
    f
      .events()
      .some(
        (event) =>
          event.pid === claims()[1].pid &&
          event.type === "output" &&
          event.text.includes("during-restart")
      )
  );
  write(trigger, "restart-again");
  await until(() => claims().length === 3);
  assert.equal(claims()[2].instancePid, original.instancePid);
  assert.equal(new Set(claims().map((event) => event.pid)).size, 3);
  assert.equal(f.events().filter((event) => event.type === "cleanup-finished").length, 2);
  assert.equal(
    f.events().some((event) => event.type === "duplicate-restart"),
    false
  );
  command.child.kill("SIGTERM");
  const result = await command.closed;
  assert.equal(result.code, 0, result.output);
  await until(() => {
    try {
      process.kill(original.instancePid, 0);
      return false;
    } catch (error) {
      return error.code === "ESRCH";
    }
  });
  assert.equal(
    f.events().filter((event) => event.type === "start" && event.side === "panel").length,
    1
  );
});

test("updating the server plugin replaces the panel process while the local daemon keeps running", async (t) => {
  const f = runtimeFixture(t);
  const log = path.join(f.root, "events.jsonl");
  const trigger = path.join(f.root, "restart-panel");
  write(
    path.join(f.packages.panel, "app.js"),
    String.raw`
    const fs = require('node:fs');
    const path = require('node:path');
    const { createHash } = require('node:crypto');
    const { createLoader, from } = require(${JSON.stringify(
      path.join(repository, "scripts/tests/helpers.cjs")
    )});
    const load = createLoader({
      resolve(id, { filename, load, localRequire }) {
        if (id === 'mcsmanager-common') return Object.assign({}, ...[
          'plugin_manifest', 'plugin_contract', 'plugin_overrides', 'plugin_lifecycle',
          'plugin_revision', 'runtime_paths', 'plugin_modules', 'plugin_watch', 'plugin_npm',
          'process_restart'
        ].map(name => load('core/common/src/' + name + '.ts')));
        const target = path.resolve(path.dirname(filename), id) + '.ts';
        return id.startsWith('.') && fs.existsSync(target) ? load(target) : localRequire(id);
      }
    });
    const { Context } = from('panel')('cordis');
    const ctx = new Context();
    const loader = load('core/panel/src/app/plugin/loader.ts', { './context': { ctx } });
    const report = type => fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({
      type, side: 'panel', pid: process.pid,
      session: createHash('sha256').update(process.env.EPANEL_SESSION_SECRET).digest('hex')
    }) + '\n');
    process.on('SIGTERM', async () => {
      report('stop'); await ctx.stop(); await ctx.plugins.waitForDisposal(); process.exit(0);
    });
    async function main() {
      await loader.loadPanelPlugins();
      await ctx.start();
      report('start');
      ctx.setInterval(() => {
        if (!fs.existsSync(${JSON.stringify(trigger)})) return;
        fs.unlinkSync(${JSON.stringify(trigger)});
        void ctx.plugins.reload().catch(error => { console.error(error); process.exit(1); });
      }, 20);
      process.send({ type: 'elementspanel:ready' });
    }
    main().catch(error => { console.error(error); process.exit(1); });
  `
  );
  const command = execute(f, path.join(f.packages.panel, "bin.cjs"), [
    "start",
    "--with-daemon",
    "--cwd",
    f.project
  ]);
  const starts = () =>
    f.events().filter((event) => event.type === "start" && event.side === "panel");
  await until(() => starts().length === 1);
  write(
    path.join(
      f.project,
      "panel/node_modules/@elementspanel/epanel-plugin-server/panel/backend/index.cjs"
    ),
    "exports.apply = ctx => ctx.set('newServerRevision', true);"
  );
  write(trigger, "restart");
  await until(() => starts().length === 2);
  assert.notEqual(starts()[0].pid, starts()[1].pid);
  assert.equal(starts()[0].session, starts()[1].session);
  assert.equal(
    f.events().filter((event) => event.type === "start" && event.side === "daemon").length,
    1
  );
  assert.equal(
    f.events().some((event) => event.type === "stop" && event.side === "daemon"),
    false
  );
  command.child.kill("SIGTERM");
  const result = await command.closed;
  assert.equal(result.code, 0, result.output);
});

test("hosted processes deliver their final large output before the exit event", async (t) => {
  const f = runtimeFixture(t);
  const log = path.join(f.root, "events.jsonl");
  const size = 2 * 1024 * 1024;
  write(path.join(f.packages.daemon, "app.js"), String.raw`
    const fs = require('node:fs');
    const host = globalThis[Symbol.for('elementspanel.instance-process-host')];
    const child = host.spawn('burst', process.execPath,
      ['-e', ${JSON.stringify(`process.stdout.end(Buffer.alloc(${size}, 120))`)}],
      { cwd: process.cwd(), env: process.env }, {});
    let bytes = 0;
    child.stdout.on('data', data => { bytes += data.length; });
    child.on('error', error => { console.error(error); process.exit(1); });
    child.once('close', code => {
      fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ type: 'completed', bytes, code }) + '\n');
      child.release();
    });
    process.on('SIGTERM', () => process.exit(0));
    process.send({ type: 'elementspanel:ready' });
  `);
  const command = execute(f, path.join(f.packages.daemon, "bin.cjs"), [
    "start", "--cwd", f.project
  ]);
  await until(() => f.events().some(event => event.type === "completed"));
  const completed = f.events().find(event => event.type === "completed");
  assert.equal(completed.code, 0);
  assert.equal(completed.bytes, size);
  command.child.kill("SIGTERM");
  const result = await command.closed;
  assert.equal(result.code, 0, result.output);
});

test("a daemon startup failure does not start the panel and returns a nonzero status", async (t) => {
  const f = runtimeFixture(t, { daemon: "fail" });
  const result = await execute(f, path.join(f.packages.panel, "bin.cjs"), [
    "start",
    "--with-daemon",
    "--cwd",
    f.project
  ]).closed;
  assert.equal(result.code, 1, result.output);
  assert.equal(
    f.events().some((event) => event.side === "panel"),
    false
  );
  assert.match(result.output, /before becoming ready/);
});

test("a failed panel stops the local daemon instead of leaving an orphan", async (t) => {
  const f = runtimeFixture(t, { panel: "crash" });
  const result = await execute(f, path.join(f.packages.panel, "bin.cjs"), [
    "start",
    "--with-daemon",
    "--cwd",
    f.project
  ]).closed;
  assert.equal(result.code, 1, result.output);
  assert.ok(f.events().some((event) => event.side === "daemon" && event.type === "stop"));
});

test("startup timeout cancels a worker gracefully", async (t) => {
  const f = runtimeFixture(t, { daemon: "hang" });
  const driver = path.join(f.root, "timeout.cjs");
  write(
    driver,
    `const { startWorkers } = require(${JSON.stringify(
      path.join(repository, "scripts/runtime/cli.cjs")
    )}); startWorkers(${JSON.stringify({
      project: f.project,
      workers: [
        {
          side: "daemon",
          packageRoot: f.packages.daemon,
          directory: path.join(f.project, "daemon")
        }
      ]
    })}, { startupTimeout: 500, shutdownTimeout: 1000 }).then(code => process.exitCode = code);`
  );
  const result = await execute(f, driver).closed;
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /did not become ready/);
  assert.ok(f.events().some((event) => event.type === "stop"));
});

test("single-side modes use their own data and support existing runtime directories", async (t) => {
  for (const side of ["panel", "daemon"]) {
    const f = runtimeFixture(t);
    const runtime = path.join(f.root, "custom installation", side === "panel" ? "web" : "daemon");
    fs.mkdirSync(path.dirname(runtime), { recursive: true });
    fs.renameSync(path.join(f.project, side), runtime);
    if (side === "daemon") {
      for (const name of ["pty", "file_zip", "7z"]) {
        const filename =
          name === "file_zip" && process.platform === "darwin" && process.arch === "x64"
            ? "file_zip_darwin_amd64"
            : `${name}_${process.platform}_${process.arch}${
                process.platform === "win32" ? ".exe" : ""
              }`;
        write(path.join(runtime, "lib", filename), "fixture tool");
      }
    }
    const command = execute(f, path.join(f.packages[side], "bin.cjs"), [
      "start",
      "--cwd",
      f.project,
      `--${side}-dir`,
      runtime
    ]);
    await until(() => f.events().some((event) => event.type === "ready"));
    assert.equal(f.events()[0].cwd, runtime);
    command.child.kill("SIGTERM");
    const result = await command.closed;
    assert.equal(result.code, 0, result.output);
    assert.ok(f.events().every((event) => event.side === side));
  }
});

test("CLI rejects missing companion packages and shared data directories before starting", async (t) => {
  const f = runtimeFixture(t);
  const shared = parseArgs(
    ["start", "--with-daemon", "--cwd", f.project, "--panel-dir", "same", "--daemon-dir", "same"],
    "panel"
  );
  assert.throws(
    () => planWorkers("panel", f.packages.panel, shared),
    /different runtime directories/
  );
  fs.unlinkSync(path.join(f.project, "node_modules/@elementspanel/daemon"));
  // A fresh process avoids Node's module path cache for the removed package link.
  const result = await execute(f, path.join(f.packages.panel, "bin.cjs"), [
    "start",
    "--with-daemon",
    "--cwd",
    f.project
  ]).closed;
  assert.equal(result.code, 1);
  assert.match(result.output, /needs @elementspanel\/daemon/);
  assert.equal(f.events().length, 0);
});

test("CLI reports missing built-in npm dependencies before starting either worker", async (t) => {
  const f = runtimeFixture(t);
  fs.renameSync(
    path.join(f.project, "panel/node_modules/@elementspanel/epanel-plugin-console"),
    path.join(f.root, "removed-console")
  );
  const result = await execute(f, path.join(f.packages.panel, "bin.cjs"), [
    "start",
    "--with-daemon",
    "--cwd",
    f.project
  ]).closed;
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /Incomplete panel installation: missing npm plugin console/);
  assert.equal(f.events().length, 0);
});

test("npm plugin discovery rejects mismatched identities and paths outside the installed package", (t) => {
  const f = temporary(t);
  const host = path.join(f.root, "host");
  const plugin = installNpmPlugin(host, "panel", "sample");
  const filename = path.join(plugin.packageRoot, "package.json");
  const metadata = JSON.parse(fs.readFileSync(filename));
  assert.equal(resolveNpmPlugins(host)[0].directory, plugin.directory);
  write(filename, { ...metadata, version: "2.0.0" });
  assert.equal(resolveNpmPlugins(host)[0].version, "2.0.0");
  write(filename, {
    ...metadata,
    elementspanel: { ...metadata.elementspanel, id: "different-id" }
  });
  assert.throws(() => resolveNpmPlugins(host), /identity or version/);
  write(filename, {
    ...metadata,
    elementspanel: {
      ...metadata.elementspanel,
      panel: { directory: "../../outside", folder: "sample" }
    }
  });
  assert.throws(() => resolveNpmPlugins(host), /escapes its package/);
});

test("hoisted npm plugins share host Cordis and retain their declared private dependencies", async (t) => {
  const f = temporary(t);
  const project = path.join(f.root, "project");
  const host = path.join(project, "node_modules/@elementspanel/panel");
  write(path.join(host, "package.json"), {
    dependencies: { cordis: "1", "host-only": "1", "private-dep": "2" }
  });
  const plugin = installNpmPlugin(host, "panel", "sample", {
    packageRoot: path.join(project, "node_modules/@elementspanel/epanel-plugin-sample"),
    dependencies: { "private-dep": "1" }
  });
  for (const [root, name, value] of [
    [host, "cordis", "host cordis"],
    [host, "host-only", "host dependency"],
    [host, "private-dep", "wrong host dependency"],
    [project, "host-only", "wrong hoisted dependency"],
    [project, "private-dep", "plugin dependency"],
    [plugin.packageRoot, "cordis", "wrong private cordis"]
  ])
    write(
      path.join(root, "node_modules", name, "index.js"),
      `module.exports = ${JSON.stringify(value)};`
    );
  write(
    path.join(plugin.directory, "backend/index.cjs"),
    'module.exports = [require("cordis"), require("host-only"), require("private-dep")];'
  );
  write(
    path.join(plugin.directory, "backend/index.mjs"),
    'import cordis from "cordis"; import host from "host-only"; import local from "private-dep"; export default [cordis, host, local];'
  );
  const hook = installPluginResolution(host, path.join(project, "panel"));
  try {
    const expected = ["host cordis", "host dependency", "plugin dependency"];
    assert.deepEqual(require(path.join(plugin.directory, "backend/index.cjs")), expected);
    assert.deepEqual(
      (await import(pathToFileURL(path.join(plugin.directory, "backend/index.mjs")).href)).default,
      expected
    );
  } finally {
    hook.deregister();
  }
});

test("CJS and ESM plugins use host dependencies while retaining private dependencies and one Cordis", async (t) => {
  const f = temporary(t);
  const host = path.join(f.root, "host");
  const work = path.join(f.root, "work");
  const plugin = path.join(work, "plugins/sample");
  write(path.join(host, "package.json"), {
    dependencies: { cordis: "1", "host-only": "1", "private-dep": "1" },
    elementspanel: { side: "panel", plugins: {} }
  });
  for (const [root, name, value] of [
    [host, "cordis", "host cordis"],
    [host, "host-only", "host dependency"],
    [host, "private-dep", "wrong host dependency"],
    [work, "host-only", "wrong hoisted dependency"],
    [plugin, "cordis", "wrong private cordis"],
    [plugin, "private-dep", "private dependency"]
  ])
    write(
      path.join(root, "node_modules", name, "index.js"),
      `module.exports = ${JSON.stringify(value)};`
    );
  write(
    path.join(plugin, "index.cjs"),
    'module.exports = [require("cordis"), require("host-only"), require("private-dep")];'
  );
  write(
    path.join(plugin, "index.mjs"),
    'import cordis from "cordis"; import host from "host-only"; import local from "private-dep"; export default [cordis, host, local];'
  );
  const hook = installPluginResolution(host, work);
  try {
    const expected = ["host cordis", "host dependency", "private dependency"];
    assert.deepEqual(
      createRequire(path.join(work, "package.json"))(path.join(plugin, "index.cjs")),
      expected
    );
    assert.deepEqual(
      (await import(pathToFileURL(path.join(plugin, "index.mjs")).href)).default,
      expected
    );
  } finally {
    hook.deregister();
  }
});

test("shared transitive modules follow the host Cordis graph instead of a hoisted incompatible version", (t) => {
  const f = temporary(t);
  const host = path.join(f.root, "host");
  const plugin = path.join(f.root, "work/plugins/sample");
  write(path.join(host, "package.json"), {
    dependencies: { cordis: "1" },
    elementspanel: { side: "panel", plugins: {} }
  });
  write(path.join(host, "node_modules/cordis/index.js"), "module.exports = {};");
  write(
    path.join(host, "node_modules/cordis/node_modules/@cordisjs/core/index.js"),
    'module.exports = "matching core";'
  );
  write(
    path.join(host, "node_modules/@cordisjs/core/index.js"),
    'module.exports = "wrong hoisted core";'
  );
  write(path.join(plugin, "index.cjs"), 'module.exports = require("@cordisjs/core");');
  const hook = installPluginResolution(host, path.join(f.root, "work"));
  try {
    assert.equal(require(path.join(plugin, "index.cjs")), "matching core");
  } finally {
    hook.deregister();
  }
});

test("ESM plugins share the actual CJS host Context and Service constructors", async (t) => {
  const f = temporary(t);
  const host = path.join(f.root, "host");
  const plugin = path.join(f.root, "work/plugins/sample");
  write(path.join(host, "package.json"), {
    dependencies: { cordis: "3.18.1" },
    elementspanel: { side: "panel", plugins: {} }
  });
  fs.mkdirSync(path.join(host, "node_modules"));
  fs.symlinkSync(
    path.join(repository, "core/panel/node_modules/cordis"),
    path.join(host, "node_modules/cordis"),
    "junction"
  );
  write(path.join(plugin, "index.mjs"), 'export { Context, Service } from "cordis";');
  const actual = createRequire(path.join(host, "package.json"))("cordis");
  const hook = installPluginResolution(host, path.join(f.root, "work"));
  try {
    const exported = await import(pathToFileURL(path.join(plugin, "index.mjs")).href);
    assert.equal(exported.Context, actual.Context);
    assert.equal(exported.Service, actual.Service);
  } finally {
    hook.deregister();
  }
});
