const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const { installNpmPlugin } = require("./npm-fixtures.cjs");
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
    const versions = { panel: "1.2.3", daemon: "2.3.4" };
    const result = await initializer.initialize({
      directory,
      mode,
      versions,
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
    assert.equal(
      result.manifest.scripts.start,
      mode === "full"
        ? "epanel start --with-daemon"
        : mode === "panel"
        ? "epanel start"
        : "epanel-daemon start"
    );
  });
}

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

test("initializer retains a complete project after install failure and supports offline generation", async (t) => {
  const f = temporary(t);
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
  assert.ok(
    JSON.parse(fs.readFileSync(path.join(project, "package.json"))).dependencies[
      "@elementspanel/panel"
    ]
  );
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
  assert.equal(fs.existsSync(path.join(f.root, "offline/node_modules")), false);
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
      installNpmPlugin(root, side, plugin);
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
    const runtime = path.join(f.root, "old installation", side === "panel" ? "web" : "daemon");
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
    path.join(f.packages.panel, "node_modules/@elementspanel/epanel-plugin-console"),
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
    dependencies: { cordis: "1", "host-only": "1", "private-dep": "1" }
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
  write(path.join(host, "package.json"), { dependencies: { cordis: "1" } });
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
  write(path.join(host, "package.json"), { dependencies: { cordis: "3.18.1" } });
  fs.mkdirSync(path.join(host, "node_modules"));
  fs.symlinkSync(
    path.join(repository, "panel/node_modules/cordis"),
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
