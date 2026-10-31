const { from, createLoader, deferred, settle } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const { installNpmPlugin } = require("./npm-fixtures.cjs");
const root = path.resolve(__dirname, "../..");
const hostRequire = from("panel");
const ts = hostRequire("typescript");
const { Context } = hostRequire("cordis");
const commonNames = [
  "plugin_manifest",
  "plugin_contract",
  "plugin_overrides",
  "plugin_lifecycle",
  "plugin_revision",
  "runtime_paths",
  "plugin_modules",
  "plugin_watch",
  "plugin_npm"
];
const load = createLoader({
  compiler: ts,
  resolve(id, { filename, localRequire, load }) {
    if (id === "mcsmanager-common")
      return Object.assign({}, ...commonNames.map((name) => load(`core/common/src/${name}.ts`)));
    const target = path.resolve(path.dirname(filename), id) + ".ts";
    return id.startsWith(".") && fs.existsSync(target) ? load(target) : localRequire(id);
  }
});
function fixture(t, side = "panel") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-plugin-runtime-"));
  const previous = process.cwd();
  process.chdir(directory);
  const ctx = new Context();
  const loader = load(
    side === "panel" ? "core/panel/src/app/plugin/loader.ts" : "core/daemon/src/plugin/loader.ts",
    { "./context": { ctx } }
  );
  t.after(async () => {
    await ctx.stop();
    process.chdir(previous);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const write = (id, source, extra = {}) => {
    const target = path.join(directory, "plugins", id);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "index.cjs"), source);
    const { frontend, ...metadata } = extra;
    fs.writeFileSync(
      path.join(target, "plugin.json"),
      JSON.stringify({ id, backend: "index.cjs", ...(frontend ? { frontend } : {}) })
    );
    fs.writeFileSync(
      path.join(target, "package.json"),
      JSON.stringify({ name: `epanel-plugin-${id}`, elementspanel: metadata })
    );
    return target;
  };
  const cap = side === "panel" ? "Panel" : "Daemon";
  return {
    directory,
    ctx,
    loader,
    write,
    start: loader[`load${cap}Plugins`],
    reload: loader[`reload${cap}Plugins`],
    inventory: loader[`get${cap}PluginInventory`],
    enabled: loader[`set${cap}PluginEnabled`],
    remove: loader[`remove${cap}Plugin`],
    configure: loader[`configure${cap}Plugin`]
  };
}
for (const side of ["panel", "daemon"]) {
  test(`${side}: foundation version changes dispose the graph before activating fresh services`, async (t) => {
    const f = fixture(t, side);
    const previousRoot = process.env.EPANEL_PACKAGE_ROOT;
    const packageRoot = path.join(f.directory, "node_modules", "@elementspanel", side);
    process.env.EPANEL_PACKAGE_ROOT = packageRoot;
    t.after(() => {
      if (previousRoot === undefined) delete process.env.EPANEL_PACKAGE_ROOT;
      else process.env.EPANEL_PACKAGE_ROOT = previousRoot;
    });
    const ids = ["i18n", "storage", "runtime", "server", "console", "config", "consumer"];
    const events = (f.ctx.testEvents = []);
    const networkEvents = (f.ctx.networkEvents = []);
    const cleanupStarted = deferred();
    const cleanup = deferred();
    f.ctx.cleanup = async (id) => {
      if (id === "runtime") {
        cleanupStarted.resolve();
        await cleanup.promise;
      }
    };
    const write = (id, version = "1.0.0") => {
      const index = ids.indexOf(id);
      const dependency = index > 0 ? `${ids[index - 1]}Value` : undefined;
      const result = installNpmPlugin(packageRoot, side, id, {
        version,
        source: `
          exports.inject=${JSON.stringify(dependency ? [dependency] : [])};
          exports.apply=(ctx,config)=>{
            ${
              id === "server"
                ? `
              ctx.on("plugins/reloading",()=>ctx.root.networkEvents.push("pause"));
              ${
                side === "daemon"
                  ? `ctx.on("plugins/reloaded",()=>{
                if(!ctx.root.get("consumerValue")) throw new Error("resuming before consumers");
                ctx.root.networkEvents.push("resume");
              });`
                  : ""
              }
              ctx.on("ready",()=>{
                if(!ctx.root.get("consumerValue")) throw new Error("listener started before consumers");
                ctx.root.networkEvents.push("listen");
              });
            `
                : ""
            }
            ctx.root.testEvents.push("apply:${id}:${version}");
            ctx.set("${id}Value",{version:${JSON.stringify(version)},config,dependency:${
              dependency ? `ctx.${dependency}` : "null"
            }});
            ctx.on("dispose",async()=>{
              await ctx.root.cleanup("${id}");
              ctx.root.testEvents.push("dispose:${id}");
            });
          };
        `
      });
      const filename = path.join(result.packageRoot, "package.json");
      const metadata = JSON.parse(fs.readFileSync(filename));
      metadata.elementspanel[side].priority = index;
      fs.writeFileSync(filename, JSON.stringify(metadata));
    };
    ids.forEach((id) => write(id));
    installNpmPlugin(packageRoot, side, "sleeping", {
      source: 'exports.apply=()=>{throw new Error("disabled plugin was activated");};'
    });
    const overrides = path.join(f.directory, "data/plugin-overrides.json");
    fs.mkdirSync(path.dirname(overrides), { recursive: true });
    const preferences = JSON.stringify({
      version: 1,
      plugins: { sleeping: { enabled: false }, consumer: { config: { saved: "keep" } } }
    });
    fs.writeFileSync(overrides, preferences);
    await f.start();
    await f.ctx.start();
    events.length = 0;
    write("runtime", "2.0.0");
    const updating = f.reload();
    await cleanupStarted.promise;
    await settle();
    assert.equal(
      events.some((event) => event.startsWith("apply:")),
      false
    );
    cleanup.resolve();
    await updating;
    assert.deepEqual(
      events.slice(0, ids.length),
      [...ids].reverse().map((id) => `dispose:${id}`)
    );
    assert.deepEqual(
      events.slice(ids.length),
      ids.map((id) => `apply:${id}:${id === "runtime" ? "2.0.0" : "1.0.0"}`)
    );
    for (const id of ["i18n", "storage", "server", "console", "config"]) {
      write(id, "2.0.0");
      await f.reload();
      assert.equal(f.ctx.get(`${id}Value`).version, "2.0.0");
      assert.equal(f.inventory().find((plugin) => plugin.id === id).state, "active");
    }
    write("server", "1.0.0");
    await f.reload();
    assert.equal(f.ctx.serverValue.version, "1.0.0", "downgrades execute the requested code too");
    assert.deepEqual(f.ctx.consumerValue.config, { saved: "keep" });
    assert.equal(f.ctx.consumerValue.dependency, f.ctx.configValue);
    assert.equal(f.inventory().find((plugin) => plugin.id === "sleeping").state, "disabled");
    assert.equal(fs.readFileSync(overrides, "utf8"), preferences);
    assert.equal(f.inventory().filter((plugin) => plugin.state === "active").length, ids.length);
    assert.deepEqual(networkEvents, [
      "listen",
      ...Array.from({ length: 7 }, () =>
        side === "daemon" ? ["pause", "resume", "listen"] : ["pause", "listen"]
      ).flat()
    ]);
  });

  test(`${side}: npm built-ins stay immutable while overrides live outside the package`, async (t) => {
    const f = fixture(t, side);
    const previousRoot = process.env.EPANEL_PACKAGE_ROOT;
    const packageRoot = path.join(f.directory, "node_modules", "@elementspanel", side);
    process.env.EPANEL_PACKAGE_ROOT = packageRoot;
    t.after(() => {
      if (previousRoot === undefined) delete process.env.EPANEL_PACKAGE_ROOT;
      else process.env.EPANEL_PACKAGE_ROOT = previousRoot;
    });
    const { directory: builtin } = installNpmPlugin(packageRoot, side, "config", {
      source: 'exports.apply = ctx => ctx.set("bundledValue", true);',
      frontend: side === "panel" ? "export const fixture = true;" : undefined
    });
    await f.start();
    assert.equal(f.ctx.bundledValue, true);
    assert.equal(f.inventory().find((plugin) => plugin.id === "config").removable, false);
    if (side === "panel") {
      const [entry] = f.loader.getPanelFrontendManifest();
      assert.equal(entry.assetDirectory, "config");
      assert.equal(entry.frontendDirectory, path.join(builtin, "frontend"));
      assert.match(entry.entry, /^\.\/config@[a-f0-9]{24}\/frontend\/index.js$/);
    }
    await f.enabled("config", false);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(f.directory, "data/plugin-overrides.json"))).plugins
        .config.enabled,
      false
    );
    assert.equal(JSON.parse(fs.readFileSync(path.join(builtin, "plugin.json"))).enabled, undefined);
    await assert.rejects(f.remove("config"), /essential plugin/);
    assert.equal(fs.existsSync(path.join(packageRoot, "data")), false);
  });

  test(`${side}: production reload activates new packages and replaces running code`, async (t) => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    t.after(() => {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    });
    const f = fixture(t, side);
    const original = f.write("original", 'exports.apply=ctx=>ctx.set("originalValue",1);');
    await f.start();
    assert.equal(f.ctx.originalValue, 1);

    const added = f.write("added", 'exports.apply=ctx=>ctx.set("addedValue",true);');
    await f.reload();
    assert.equal(f.ctx.addedValue, true);
    assert.equal(f.inventory().find((plugin) => plugin.id === "added").state, "active");

    fs.writeFileSync(
      path.join(original, "index.cjs"),
      'exports.apply=ctx=>ctx.set("originalValue",2);'
    );
    await f.reload();
    assert.equal(f.ctx.originalValue, 2);
    assert.equal(f.inventory().find((plugin) => plugin.id === "original").state, "active");

    fs.rmSync(added, { recursive: true, force: true });
    await f.reload();
    assert.equal(f.ctx.addedValue, undefined);
    assert.equal(
      f.inventory().some((plugin) => plugin.id === "added"),
      false
    );
  });
}
for (const side of ["panel", "daemon"]) {
  test(`${side}: dependencies report pending; enablement survives upgrades without rewriting the package`, async (t) => {
    const f = fixture(t, side);
    const consumer = f.write(
      "consumer",
      'exports.inject=["example"]; exports.apply=ctx=>{ ctx.set("consumer", ctx.example); };'
    );
    const provider = f.write(
      "provider",
      'exports.apply=ctx=>{ ctx.set("example", {value:42}); };',
      { enabled: false }
    );
    const before = fs.readFileSync(path.join(provider, "plugin.json"), "utf8");
    await f.start();
    await f.ctx.events.flush();
    assert.equal(f.inventory().find((p) => p.id === "consumer").state, "pending");
    assert.equal(f.inventory().find((p) => p.id === "consumer").running, false);
    const result = await f.enabled("provider", true);
    assert.equal(result.result.application, "applied");
    assert.equal(f.inventory().find((p) => p.id === "consumer").state, "active");
    assert.equal(fs.readFileSync(path.join(provider, "plugin.json"), "utf8"), before);
    await f.enabled("consumer", false);
    fs.writeFileSync(
      path.join(consumer, "plugin.json"),
      JSON.stringify({ id: "consumer", backend: "index.cjs", version: "2" })
    );
    assert.equal(f.inventory().find((p) => p.id === "consumer").enabled, false);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(f.directory, "data/plugin-overrides.json"))).plugins
        .consumer.enabled,
      false
    );
  });
}
test("queued enable waits for async cleanup and failed activation is reported separately from saving", async (t) => {
  const f = fixture(t);
  let release;
  const control = {
    events: [],
    gate: new Promise((resolve) => {
      release = resolve;
    })
  };
  f.ctx.set("control", control);
  f.write(
    "async",
    'exports.inject=["control"]; exports.apply=ctx=>{ const c=ctx.control; c.events.push("start"); ctx.effect(()=> async()=>{ c.events.push("stop"); await c.gate; c.events.push("stopped"); }); };'
  );
  await f.start();
  const off = f.enabled("async", false);
  const on = f.enabled("async", true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(control.events, ["start", "stop"]);
  release();
  await Promise.all([off, on]);
  assert.deepEqual(control.events, ["start", "stop", "stopped", "start"]);
  f.write("broken", 'exports.apply=()=>{ throw Error("activation failed"); };', { enabled: false });
  const result = await f.enabled("broken", true);
  assert.equal(result.result.saved, true);
  assert.equal(result.result.application, "failed");
  assert.match(result.error, /activation failed/);
});
test("invalid config does not persist; valid overrides reach the plugin and secrets never reach its browser manifest", async (t) => {
  const f = fixture(t);
  const directory = f.write(
    "configured",
    'exports.Config=v=>{if(typeof v.port!=="number")throw Error("bad port");return v;}; exports.apply=(ctx,config)=>{ctx.set("value",config.port)};',
    { config: { port: 1, secret: "private" }, frontend: "frontend/index.js" }
  );
  fs.mkdirSync(path.join(directory, "frontend"));
  fs.writeFileSync(path.join(directory, "frontend/index.js"), "export function apply(){}");
  await f.start();
  await assert.rejects(f.configure("configured", { port: "oops" }), /bad port/);
  assert.equal(fs.existsSync(path.join(f.directory, "data/plugin-overrides.json")), false);
  assert.equal(
    (await f.configure("configured", { port: 2, secret: "new-private" })).result.application,
    "applied"
  );
  assert.equal(f.ctx.value, 2);
  assert.equal(JSON.stringify(f.loader.getPanelFrontendManifest()).includes("private"), false);
});
test("incompatible plugin code never executes", async (t) => {
  const f = fixture(t);
  f.write("future", 'throw Error("MUST NOT EXECUTE");', { elements: { api: 2 } });
  await f.start();
  const record = f.inventory()[0];
  assert.equal(record.state, "failed");
  assert.match(record.error, /Unsupported/);
});

test("panel: the plugin manager no longer deletes source plugins", async (t) => {
  const f = fixture(t);
  const directory = f.write("managed", 'exports.apply=ctx=>{ctx.set("managedValue", true);};');
  await f.start();
  assert.equal(f.ctx.managedValue, true);
  await assert.rejects(f.remove("managed"), /Source plugins cannot be removed/);
  assert.equal(fs.existsSync(directory), true);
  assert.equal(f.ctx.managedValue, true);
});

test("panel: built-in sources stay protected and external workspaces are not discovered", async (t) => {
  const f = fixture(t);
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  t.after(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });
  const panelRoot = path.join(f.directory, "panel");
  const source = path.join(panelRoot, "plugins/source");
  fs.mkdirSync(path.join(panelRoot, "src/app"), { recursive: true });
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, "index.cjs"), "exports.apply=()=>{};");
  fs.writeFileSync(
    path.join(source, "plugin.json"),
    JSON.stringify({ id: "source", backend: "index.cjs" })
  );
  process.chdir(panelRoot);
  const external = path.join(f.directory, "external/custom/panel");
  fs.mkdirSync(external, { recursive: true });
  fs.writeFileSync(path.join(external, "plugin.json"), JSON.stringify({ id: "workspace" }));

  const inventory = f.inventory();
  assert.equal(inventory.find((plugin) => plugin.id === "source").removable, false);
  assert.equal(
    inventory.find((plugin) => plugin.id === "workspace"),
    undefined
  );
  await assert.rejects(f.remove("source"), /Source plugins cannot be removed/);
  await assert.rejects(f.remove("workspace"), /Plugin not found/);
  assert.equal(fs.existsSync(source), true);
  assert.equal(fs.existsSync(path.join(external, "plugin.json")), true);
});

test("a revision changes when a nested module changes, and public assets never reveal disk paths or serve stale revisions", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-plugin-assets-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, "chunks"));
  fs.writeFileSync(path.join(directory, "index.js"), 'export * from "./chunks/a.js"');
  fs.writeFileSync(path.join(directory, "chunks/a.js"), "export const a=1");
  const { pluginDirectoryRevision } = load("core/common/src/plugin_revision.ts");
  const first = pluginDirectoryRevision(directory);
  assert.equal(pluginDirectoryRevision(directory), first);
  fs.writeFileSync(path.join(directory, "chunks/a.js"), "export const a=2");
  const revision = pluginDirectoryRevision(directory);
  assert.notEqual(revision, first);
  const entries = [
    { metadata: { id: "test" }, assetDirectory: "test", frontendDirectory: directory, revision }
  ];
  let poll, dispose;
  const serve = load("plugins/server/panel/src/backend/plugin_assets.ts", {
    "koa-static": (root) => async (request) => {
      request.body = root;
    },
    "koa-mount": (prefix, middleware) => middleware
  }).pluginAssets({
    plugins: { frontendManifest: () => entries },
    setInterval(fn) {
      poll = fn;
    },
    effect(fn) {
      dispose = fn();
    },
    logger: { warn() {} }
  });
  const request = (target) => ({ path: target, method: "GET", res: new EventEmitter(), set() {} });
  const manifest = request("/plugins/manifest.json");
  await serve(manifest, () => {});
  assert.equal(JSON.stringify(manifest.body).includes(directory), false);
  const stale = request(`/plugins/test@${first}/frontend/index.js`);
  await serve(stale, () => {});
  assert.equal(stale.status, 404);
  const live = request(`/plugins/test@${revision}/frontend/index.js`);
  await serve(live, () => {});
  assert.equal(live.body, directory);
  const events = request("/plugins/events");
  await serve(events, () => {});
  const initial = events.body.read().toString();
  entries.length = 0;
  poll();
  assert.notEqual(events.body.read().toString(), initial);
  dispose();
});

test("settings changes and enable cycles apply the updated backend revision", async (t) => {
  const f = fixture(t);
  const directory = f.write("versioned", 'exports.apply=ctx=>ctx.set("versionedValue",1);');
  await f.start();
  fs.writeFileSync(
    path.join(directory, "index.cjs"),
    'exports.apply=ctx=>ctx.set("versionedValue",2);'
  );
  assert.equal((await f.configure("versioned", { option: true })).result.application, "applied");
  assert.equal(f.ctx.get("versionedValue"), 2);
  await f.enabled("versioned", false);
  assert.equal((await f.enabled("versioned", true)).result.application, "applied");
  assert.equal(f.ctx.get("versionedValue"), 2);
});

for (const side of ["panel", "daemon"]) {
  test(`${side}: replacing a nested backend waits for async cleanup`, async (t) => {
    const f = fixture(t, side);
    let release;
    const control = {
      events: [],
      gate: new Promise((resolve) => {
        release = resolve;
      })
    };
    f.ctx.set("control", control);
    const directory = f.write(
      "nested",
      'exports.inject=["control"]; exports.apply=ctx=>{const c=ctx.control; c.events.push(require("./helper.cjs")); ctx.effect(()=>async()=>{c.events.push("stop"); await c.gate; c.events.push("stopped")});};'
    );
    fs.writeFileSync(path.join(directory, "helper.cjs"), 'module.exports="old";');
    await f.start();
    fs.writeFileSync(path.join(directory, "helper.cjs"), 'module.exports="new";');
    const pending = f.reload();
    await new Promise(setImmediate);
    assert.deepEqual(control.events, ["old", "stop"]);
    release();
    await pending;
    assert.deepEqual(control.events, ["old", "stop", "stopped", "new"]);
    assert.equal(f.inventory().find((plugin) => plugin.id === "nested").state, "active");
  });
}

test("settings forms validate server-side before the plugin writes and report restart-only settings", async (t) => {
  const f = fixture(t);
  await f.start();
  const { SettingsFormService } = load("plugins/config/panel/src/backend/settings.ts");
  f.ctx.plugin(SettingsFormService);
  let writes = 0;
  f.ctx.plugin({
    name: "settings-example",
    inject: ["settingsForm"],
    apply(ctx) {
      ctx.settingsForm.declare({
        restartRequired: true,
        fields: () => [
          { key: "port", title: "Port", type: "number", min: 1, max: 65535, required: true }
        ],
        read: () => ({ port: 1234 }),
        write() {
          writes++;
        }
      });
    }
  });
  await f.ctx.events.flush();
  await assert.rejects(f.ctx.settingsForm.write("settings-example", { port: "1234" }), /invalid/);
  await assert.rejects(f.ctx.settingsForm.write("settings-example", { port: Infinity }), /invalid/);
  assert.equal(writes, 0);
  const result = await f.ctx.settingsForm.write("settings-example", { port: 1234 });
  assert.equal(writes, 1);
  assert.deepEqual(result, { saved: true, application: "restart-required" });
});
