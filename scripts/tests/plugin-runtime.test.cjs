const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const root = path.resolve(__dirname, "../..");
const hostRequire = Module.createRequire(path.join(root, "panel/package.json"));
const ts = hostRequire("typescript");
const { Context } = hostRequire("cordis");
const commonNames = [
  "plugin_manifest",
  "plugin_contract",
  "plugin_overrides",
  "plugin_lifecycle",
  "plugin_revision"
];
function load(relative, overrides = {}) {
  const filename = path.join(root, relative);
  const mod = new Module(filename, module);
  const localRequire = Module.createRequire(filename);
  mod.require = (id) => {
    if (Object.hasOwn(overrides, id)) return overrides[id];
    if (id === "mcsmanager-common")
      return Object.assign({}, ...commonNames.map((name) => load(`common/src/${name}.ts`)));
    const target = path.resolve(path.dirname(filename), id) + ".ts";
    if (id.startsWith(".") && fs.existsSync(target)) return load(path.relative(root, target));
    return localRequire(id);
  };
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      }
    }).outputText,
    filename
  );
  return mod.exports;
}
function fixture(t, side = "panel") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-plugin-runtime-"));
  const previous = process.cwd();
  process.chdir(directory);
  const ctx = new Context();
  const loader = load(
    side === "panel" ? "panel/src/app/plugin/loader.ts" : "daemon/src/plugin/loader.ts",
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
    fs.writeFileSync(
      path.join(target, "plugin.json"),
      JSON.stringify({ id, backend: "index.cjs", ...extra })
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
    inventory: loader[`get${cap}PluginInventory`],
    enabled: loader[`set${cap}PluginEnabled`],
    configure: loader[`configure${cap}Plugin`]
  };
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
test("a revision changes when a nested module changes, and public assets never reveal disk paths or serve stale revisions", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-plugin-assets-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, "chunks"));
  fs.writeFileSync(path.join(directory, "index.js"), 'export * from "./chunks/a.js"');
  fs.writeFileSync(path.join(directory, "chunks/a.js"), "export const a=1");
  const { pluginDirectoryRevision } = load("common/src/plugin_revision.ts");
  const first = pluginDirectoryRevision(directory);
  assert.equal(pluginDirectoryRevision(directory), first);
  fs.writeFileSync(path.join(directory, "chunks/a.js"), "export const a=2");
  const revision = pluginDirectoryRevision(directory);
  assert.notEqual(revision, first);
  const entries = [
    { metadata: { id: "test" }, assetDirectory: "test", frontendDirectory: directory, revision }
  ];
  let poll, dispose;
  const serve = load("panel/plugins/server/src/backend/plugin_assets.ts", {
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

test("code replacement cannot be hidden by a settings update or a disable/enable cycle", async (t) => {
  const f = fixture(t);
  const directory = f.write("versioned", 'exports.apply=ctx=>ctx.set("versionedValue",1);');
  await f.start();
  fs.writeFileSync(
    path.join(directory, "index.cjs"),
    'exports.apply=ctx=>ctx.set("versionedValue",2);'
  );
  assert.equal(
    (await f.configure("versioned", { option: true })).result.application,
    "restart-required"
  );
  assert.equal(f.ctx.get("versionedValue"), 1);
  await f.enabled("versioned", false);
  assert.equal((await f.enabled("versioned", true)).result.application, "restart-required");
  assert.equal(f.ctx.get("versionedValue"), undefined);
});

test("user installation precedence applies only to the same market owner", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-plugin-discovery-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { discoverPluginsFromRoots } = load("common/src/plugin_manifest.ts");
  const builtin = path.join(directory, "plugins");
  const data = path.join(directory, "data/plugins");
  for (const root of [builtin, data]) {
    fs.mkdirSync(path.join(root, "sample"), { recursive: true });
    fs.writeFileSync(path.join(root, "sample/plugin.json"), '{"id":"sample"}');
  }
  const roots = [{ directory: builtin }, { directory: data, overrideManaged: true }];
  fs.writeFileSync(path.join(data, "sample/.market-install.json"), '{"pluginId":"market-one"}');
  assert.equal(
    discoverPluginsFromRoots(roots, { entryFields: [] })[0].directory,
    path.join(builtin, "sample")
  );
  fs.writeFileSync(path.join(builtin, "sample/.market-install.json"), '{"pluginId":"market-one"}');
  assert.equal(
    discoverPluginsFromRoots(roots, { entryFields: [] })[0].directory,
    path.join(data, "sample")
  );
});

test("settings forms validate server-side before the plugin writes and report restart-only settings", async (t) => {
  const f = fixture(t);
  await f.start();
  const { SettingsFormService } = load("panel/plugins/config/src/backend/settings.ts");
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
