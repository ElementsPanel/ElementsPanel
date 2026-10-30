const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const { createLoader, deferred, settle, from } = require("./helpers.cjs");
const { installNpmPlugin: writePlugin, write } = require("./npm-fixtures.cjs");

function loader(overrides = {}) {
  return createLoader({
    resolve(id, { filename, localRequire, load }) {
      if (Object.hasOwn(overrides, id)) return overrides[id];
      const target = path.resolve(path.dirname(filename), id) + ".ts";
      return id.startsWith(".") && fs.existsSync(target) ? load(target) : localRequire(id);
    }
  });
}

function fixture(t, side = "panel") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "elements plugin npm "));
  const host = path.join(root, "node_modules/@elementspanel", side);
  write(path.join(root, "package.json"), {
    private: true,
    dependencies: {},
    elementspanel: { plugins: {} }
  });
  write(path.join(host, "package.json"), {
    name: `@elementspanel/${side}`,
    elementspanel: { side, plugins: {} }
  });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, host };
}

function npmFixture(t, side = "panel") {
  const f = fixture(t, side);
  const calls = [];
  const state = { invalid: false, gate: undefined };
  const spawn = (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    const index = args.findIndex((arg) => arg === "install" || arg === "uninstall");
    const action = args[index];
    const spec = args[index + 1];
    calls.push({ command, args, options, action, spec });
    setImmediate(async () => {
      try {
        if (state.gate) await state.gate;
        const filename = path.join(options.cwd, "package.json");
        const metadata = JSON.parse(fs.readFileSync(filename));
        if (action === "install") {
          const delimiter = spec.lastIndexOf("@");
          const name = spec.slice(0, delimiter);
          const version =
            spec.slice(delimiter + 1) === "latest" ? "1.0.0" : spec.slice(delimiter + 1);
          const target = path.join(options.cwd, "node_modules", name);
          write(path.join(target, "package.json"), {
            name,
            version,
            elementspanel: {
              id: "sample",
              [side]: {
                directory: side,
                folder: "sample",
                elements: { api: state.invalid && version === "2.0.0" ? 2 : 1 }
              }
            }
          });
          write(path.join(target, side, "plugin.json"), {
            id: "sample",
            version,
            backend: "backend/index.cjs"
          });
          write(
            path.join(target, side, "backend/index.cjs"),
            `exports.apply=ctx=>ctx.set("npmVersion",${JSON.stringify(version)});`
          );
          metadata.dependencies = { ...metadata.dependencies, [name]: version };
        } else {
          delete metadata.dependencies[spec];
          fs.rmSync(path.join(options.cwd, "node_modules", spec), { force: true, recursive: true });
        }
        write(filename, metadata);
        write(path.join(options.cwd, "package-lock.json"), { action, spec });
        child.emit("close", 0);
      } catch (error) {
        child.emit("error", error);
      }
    });
    return child;
  };
  const load = loader({ child_process: { spawn } });
  return { ...f, calls, state, ...load("core/common/src/plugin_npm.ts") };
}

test("npm installs pin the resolved dependency; uninstall removes it and preserves unrelated data", async (t) => {
  const f = npmFixture(t);
  const options = {
    name: "epanel-plugin-sample",
    side: "panel",
    packageRoot: f.host,
    projectRoot: f.root
  };
  const config = path.join(f.root, "panel/data/plugin-overrides.json");
  write(config, { version: 1, plugins: { sample: { config: { token: "keep" } } } });
  const installed = await f.installNpmPlugin(options);
  assert.equal(installed.pluginId, "sample");
  assert.equal(installed.version, "1.0.0");
  let manifest = JSON.parse(fs.readFileSync(path.join(f.root, "package.json")));
  assert.equal(manifest.dependencies[options.name], "1.0.0");
  assert.equal(manifest.elementspanel.plugins.sample, options.name);
  assert.equal(f.calls[0].options.cwd, f.root);
  assert.ok(f.calls[0].args.includes("--ignore-scripts"));
  assert.ok(f.calls[0].args.includes("--save-exact"));
  await f.uninstallNpmPlugin("sample", options);
  manifest = JSON.parse(fs.readFileSync(path.join(f.root, "package.json")));
  assert.equal(manifest.dependencies[options.name], undefined);
  assert.equal(manifest.elementspanel.plugins.sample, undefined);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root, "package-lock.json"))), {
    action: "uninstall",
    spec: options.name
  });
  assert.equal(JSON.parse(fs.readFileSync(config)).plugins.sample.config.token, "keep");
  assert.equal(fs.existsSync(path.join(f.root, ".elementspanel-npm.lock")), false);
});

test("an incompatible npm upgrade rolls the installed package, manifest and lockfile back", async (t) => {
  const f = npmFixture(t);
  const options = {
    name: "epanel-plugin-sample",
    side: "panel",
    packageRoot: f.host,
    projectRoot: f.root
  };
  await f.installNpmPlugin(options);
  const files = ["package.json", "package-lock.json"].map((name) => path.join(f.root, name));
  const before = files.map((filename) => fs.readFileSync(filename, "utf8"));
  f.state.invalid = true;
  await assert.rejects(f.installNpmPlugin({ ...options, version: "2.0.0" }), /Unsupported/);
  assert.deepEqual(
    files.map((filename) => fs.readFileSync(filename, "utf8")),
    before
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.root, "node_modules/epanel-plugin-sample/package.json")))
      .version,
    "1.0.0"
  );
  assert.deepEqual(
    f.calls.map((call) => call.spec),
    ["epanel-plugin-sample@latest", "epanel-plugin-sample@2.0.0", "epanel-plugin-sample@1.0.0"]
  );
});

test("npm protects core packages and serializes operations from different callers", async (t) => {
  const f = npmFixture(t);
  writePlugin(f.host, "panel", "config");
  await assert.rejects(
    f.installNpmPlugin({
      name: "@elementspanel/epanel-plugin-config",
      side: "panel",
      packageRoot: f.host,
      projectRoot: f.root
    }),
    /essential/
  );
  await assert.rejects(
    f.uninstallNpmPlugin("config", { packageRoot: f.host, projectRoot: f.root }),
    /essential/
  );
  assert.equal(f.calls.length, 0);
  const gate = deferred();
  f.state.gate = gate.promise;
  const options = {
    name: "epanel-plugin-sample",
    side: "panel",
    packageRoot: f.host,
    projectRoot: f.root
  };
  const first = f.installNpmPlugin(options);
  while (!f.calls.length) await settle();
  const second = f.installNpmPlugin({ ...options, version: "2.0.0" });
  await settle();
  assert.equal(f.calls.length, 1);
  gate.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(
    f.calls.map((call) => call.spec),
    ["epanel-plugin-sample@latest", "epanel-plugin-sample@2.0.0"]
  );
});

test("optional bundled npm plugins are uninstalled from their owning manifest", async (t) => {
  const f = npmFixture(t);
  const plugin = writePlugin(f.host, "panel", "sample");
  const removed = await f.uninstallNpmPlugin("sample", {
    packageRoot: f.host,
    projectRoot: f.root
  });
  assert.equal(removed.name, plugin.name);
  assert.equal(f.calls[0].options.cwd, f.host);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(f.host, "package.json"))).dependencies[plugin.name],
    undefined
  );
});

test("externally installed npm dependencies are discovered without a manual mapping", (t) => {
  const f = fixture(t);
  const plugin = writePlugin(f.root, "panel", "sample");
  const manifest = JSON.parse(fs.readFileSync(path.join(f.root, "package.json")));
  delete manifest.elementspanel.plugins.sample;
  write(path.join(f.root, "package.json"), manifest);
  const { resolveNpmPlugins } = require("../runtime/npm-plugins.cjs");
  const runtime = resolveNpmPlugins(f.host, "panel");
  assert.equal(runtime[0].defaultEnabled, true);
  const common = loader()("core/common/src/plugin_npm.ts");
  assert.equal(
    common.listNpmPlugins("panel", { packageRoot: f.host, projectRoot: f.root })[0].name,
    plugin.name
  );
});

test("setup workspace symlinks resolve to their real package boundary", async (t) => {
  const f = fixture(t);
  const realRoot = path.join(f.root, "external/sample");
  const plugin = writePlugin(f.root, "panel", "sample", { packageRoot: realRoot });
  fs.mkdirSync(path.join(f.root, "node_modules/@elementspanel"), { recursive: true });
  fs.symlinkSync(realRoot, path.join(f.root, "node_modules", plugin.name), "junction");
  const { resolveNpmPlugins } = require("../runtime/npm-plugins.cjs");
  const [record] = resolveNpmPlugins(f.host, "panel");
  assert.equal(record.packageRoot, realRoot);
  const load = loader();
  const common = load("core/common/src/plugin_npm.ts");
  assert.equal(
    common.listNpmPlugins("panel", { packageRoot: f.host, projectRoot: f.root })[0].packageRoot,
    realRoot
  );
  const modules = load("core/common/src/plugin_modules.ts");
  const entry = path.join(record.directory, "backend/index.cjs");
  write(entry, "exports.value=1;");
  assert.equal((await modules.loadPluginModule(entry, record.packageRoot, "one")).value, 1);
  write(entry, "exports.value=2;");
  modules.forgetPluginModules(record.packageRoot);
  assert.equal((await modules.loadPluginModule(entry, record.packageRoot, "two")).value, 2);
});

test("npm watcher waits for stable manifests and skips an in-progress dependency operation", async (t) => {
  const f = fixture(t);
  let poll,
    reloads = 0,
    busy = false;
  const load = loader({
    "./plugin_npm": {
      npmPluginRoots: () => ({ packageRoot: f.host, projectRoot: f.root }),
      listNpmPlugins: () => [],
      npmPluginOperationPending: () => busy
    }
  });
  load("core/common/src/plugin_watch.ts").watchNpmPlugins(
    {
      setInterval(fn) {
        poll = fn;
      },
      logger: {
        warn(error) {
          throw error;
        }
      }
    },
    "panel",
    async () => {
      reloads++;
    }
  );
  write(path.join(f.root, "package-lock.json"), { version: 1 });
  poll();
  assert.equal(reloads, 0);
  write(path.join(f.root, "package-lock.json"), { version: 200 });
  poll();
  assert.equal(reloads, 0);
  busy = true;
  poll();
  assert.equal(reloads, 0);
  busy = false;
  poll();
  await settle();
  assert.equal(reloads, 1);
  poll();
  assert.equal(reloads, 1);
});

for (const format of ["cjs", "mjs"]) {
  test(`${format}: nested imports and transitive npm dependencies execute the new revision`, async (t) => {
    const f = fixture(t);
    const plugin = path.join(f.root, "plugin");
    const entry = path.join(plugin, "backend", `index.${format}`);
    write(path.join(plugin, "package.json"), {
      name: "epanel-plugin-test",
      dependencies: { "private-one": "1" }
    });
    const first = path.join(plugin, "node_modules/private-one");
    const second = path.join(f.root, "node_modules/private-two");
    write(path.join(first, "package.json"), {
      name: "private-one",
      version: "1.0.0",
      main: `index.${format}`,
      dependencies: { "private-two": "1" }
    });
    write(path.join(second, "package.json"), {
      name: "private-two",
      version: "1.0.0",
      main: `index.${format}`
    });
    const valueSource = (value) =>
      format === "mjs" ? `export default ${value};` : `module.exports=${value};`;
    write(path.join(plugin, "backend", `helper.${format}`), valueSource(1));
    write(path.join(second, `index.${format}`), valueSource(10));
    write(
      path.join(first, `index.${format}`),
      format === "mjs"
        ? 'export { default } from "private-two";'
        : 'module.exports=require("private-two");'
    );
    write(
      entry,
      format === "mjs"
        ? `import helper from "./helper.${format}"; import dependency from "private-one"; export const value=helper+dependency;`
        : `exports.value=require("./helper.${format}")+require("private-one");`
    );
    const modules = loader()("core/common/src/plugin_modules.ts");
    const revision = modules.pluginBackendRevision(entry, plugin);
    assert.equal((await modules.loadPluginModule(entry, plugin, revision)).value, 11);
    write(path.join(plugin, "backend", `helper.${format}`), valueSource(2));
    write(path.join(second, `index.${format}`), valueSource(20));
    write(path.join(second, "package.json"), {
      name: "private-two",
      version: "2.0.0",
      main: `index.${format}`
    });
    const updated = modules.pluginBackendRevision(entry, plugin);
    assert.notEqual(updated, revision);
    modules.forgetPluginModules(plugin);
    assert.equal((await modules.loadPluginModule(entry, plugin, updated)).value, 22);
  });
}

for (const side of ["panel", "daemon"]) {
  test(`${side}: npm management activates, updates and disposes the actual dependency`, async (t) => {
    const f = npmFixture(t, side);
    const previous = {
      cwd: process.cwd(),
      package: process.env.EPANEL_PACKAGE_ROOT,
      project: process.env.EPANEL_PROJECT_ROOT
    };
    const work = path.join(f.root, side);
    fs.mkdirSync(work);
    process.chdir(work);
    process.env.EPANEL_PACKAGE_ROOT = f.host;
    process.env.EPANEL_PROJECT_ROOT = f.root;
    write(
      path.join(f.host, "runtime/npm-plugins.cjs"),
      fs.readFileSync(path.join(__dirname, "../runtime/npm-plugins.cjs"), "utf8")
    );
    const { Context } = from(side)("cordis");
    const ctx = new Context();
    t.after(async () => {
      await ctx.stop();
      process.chdir(previous.cwd);
      for (const [key, value] of [
        ["EPANEL_PACKAGE_ROOT", previous.package],
        ["EPANEL_PROJECT_ROOT", previous.project]
      ]) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    const loadCommon = loader();
    const common = Object.assign(
      {},
      ...[
        "plugin_manifest",
        "plugin_contract",
        "plugin_overrides",
        "plugin_lifecycle",
        "plugin_revision",
        "runtime_paths",
        "plugin_modules",
        "plugin_watch"
      ].map((name) => loadCommon(`core/common/src/${name}.ts`)),
      f
    );
    const load = loader({ "mcsmanager-common": common });
    const plugin = load(
      side === "panel" ? "core/panel/src/app/plugin/loader.ts" : "core/daemon/src/plugin/loader.ts",
      { "./context": { ctx } }
    );
    await plugin[side === "panel" ? "loadPanelPlugins" : "loadDaemonPlugins"]();
    const first = await ctx.plugins.install({ name: "epanel-plugin-sample" });
    assert.equal(first.state, "active");
    assert.equal(first.removable, true);
    assert.equal(first.packageName, "epanel-plugin-sample");
    assert.equal(ctx.npmVersion, "1.0.0");
    const updated = await ctx.plugins.install({ name: "epanel-plugin-sample", version: "2.0.0" });
    assert.equal(updated.result.application, "applied");
    assert.equal(ctx.npmVersion, "2.0.0");
    await ctx.plugins.setEnabled("sample", false);
    const disabled = await ctx.plugins.install({ name: "epanel-plugin-sample", version: "3.0.0" });
    assert.equal(disabled.enabled, false);
    assert.equal(ctx.npmVersion, undefined);
    await ctx.plugins.setEnabled("sample", true);
    assert.equal(ctx.npmVersion, "3.0.0");
    let poll;
    const synchronized = deferred();
    common.watchNpmPlugins(
      {
        setInterval(callback) {
          poll = callback;
        },
        logger: ctx.logger
      },
      side,
      async () => {
        await ctx.plugins.reload();
        synchronized.resolve();
      }
    );
    await common.installNpmPlugin({ name: "epanel-plugin-sample", version: "4.0.0", side });
    assert.equal(ctx.npmVersion, "3.0.0", "external npm writes are applied by the watcher");
    poll();
    poll();
    await synchronized.promise;
    assert.equal(ctx.npmVersion, "4.0.0");
    await ctx.plugins.configure("sample", { keep: "setting" });
    await ctx.plugins.remove("sample");
    assert.equal(ctx.npmVersion, undefined);
    assert.equal(ctx.plugins.inventory().length, 0);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(work, "data/plugin-overrides.json"))).plugins.sample
        .config.keep,
      "setting"
    );
  });
}
