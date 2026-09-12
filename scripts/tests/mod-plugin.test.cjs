const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const panelRequire = Module.createRequire(path.join(root, "panel/package.json"));
const daemonRequire = Module.createRequire(path.join(root, "daemon/package.json"));
const ts = panelRequire("typescript");

// Execute TypeScript in memory. This suite neither builds the project nor opens
// a listener; external requests are replaced at their service boundary.
const transpile = (filename, source = fs.readFileSync(filename, "utf8")) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: filename
  }).outputText;
require.extensions[".ts"] = (mod, filename) => mod._compile(transpile(filename), filename);

function load(filename, overrides = {}, source) {
  filename = path.join(root, filename);
  const mod = new Module(filename, module);
  const localRequire = Module.createRequire(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod.require = (id) => (Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id));
  mod._compile(transpile(filename, source), filename);
  return mod.exports;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await settle();
  }
  assert.fail("Plugin lifecycle did not settle");
}

function registrar(Service, name) {
  return class extends Service {
    items = new Set();
    constructor(ctx) {
      super(ctx, name, true);
    }
    add(value) {
      return this.ctx.effect(() => {
        this.items.add(value);
        return () => this.items.delete(value);
      });
    }
    define(value) {
      return this.add(value);
    }
    layoutCard(name, component) {
      return this.add({ name, component });
    }
    instance(value) {
      return this.add(value);
    }
    $t(key) {
      return key;
    }
  };
}

function layoutService() {
  let stored;
  return load("panel/plugins/console/src/backend/layout.ts", {
    "fs-extra": {
      existsSync: (filename) => filename.endsWith("layout.json") && stored !== undefined,
      readFileSync: () => stored,
      ensureDirSync() {},
      writeFileSync: (_filename, data) => {
        stored = data;
      }
    }
  }).LayoutService;
}

async function panelFixture(t) {
  const { Context, Service } = panelRequire("cordis");
  const ctx = new Context();
  t.after(() => ctx.stop());
  const Koa = panelRequire("koa");
  const app = new Koa();
  const { KoaService } = load("panel/plugins/server/src/backend/koa.ts");
  ctx.plugin(KoaService, app);
  ctx.plugin(registrar(Service, "i18n"));
  ctx.plugin(layoutService());
  const policy = { canFileManager: true, allowed: true };
  ctx.set("roles", { USER: 1 });
  ctx.set("identity", {
    accessPolicy: policy,
    of: (requestCtx) => ({ elevated: requestCtx.role === 10 }),
    canAccessInstance: () => policy.allowed
  });
  const pass = () => async (_requestCtx, next) => next();
  ctx.set("middleware", {
    permission:
      ({ level }) =>
      async (requestCtx, next) => {
        if (requestCtx.role < level) requestCtx.status = 403;
        else await next();
      },
    validator: load("panel/src/app/middleware/validator.ts").default,
    speedLimit: pass,
    requestConcurrencyLimiter: pass
  });
  const calls = [];
  const remote = {
    services: { getInstance: (id) => ({ uuid: id }) },
    Request: class {
      constructor(node) {
        this.node = node;
      }
      async request(event, data) {
        calls.push({ node: this.node.uuid, event, data });
        return { forwarded: true };
      }
    }
  };
  const network = [];
  const { ModManagerService } = load("panel/plugins/mod/src/backend/mod_manager.ts", {
    axios: async (config) => {
      network.push(config);
      return { data: [{ project_type: "minecraft", version: "1.21.1" }] };
    }
  });
  const plugin = load("panel/plugins/mod/src/backend/index.ts", {
    "./mod_manager": { ModManagerService }
  });
  const fork = ctx.plugin({ ...plugin, name: "mod" });
  await ctx.start();
  const dispatch = panelRequire("koa-compose")(app.middleware);
  const request = async (url, options = {}) => {
    const requestCtx = {
      path: url,
      method: "GET",
      query: { daemonId: "node", uuid: "instance" },
      request: { body: {} },
      role: 1,
      status: 404,
      set() {},
      ...options
    };
    await dispatch(requestCtx, async () => {});
    return requestCtx;
  };
  return { ctx, fork, policy, remote, calls, network, request };
}

test("panel routes, translations, layout and timers follow dependency lifetime", async (t) => {
  const clear = t.mock.method(global, "clearInterval");
  const fixture = await panelFixture(t);
  const { ctx, fork, remote, network, request } = fixture;
  assert.equal((await request("/api/mod/list")).body, undefined);
  assert.equal(ctx.i18n.items.size, 0);

  const remoteFork = ctx.plugin((scoped) => scoped.set("remote", remote));
  await until(() => ctx.i18n.items.size === 1);
  assert.deepEqual((await request("/api/mod/list")).body, { forwarded: true });
  assert.deepEqual((await request("/api/mod/mc_versions")).body, ["1.21.1"]);
  assert.deepEqual((await request("/api/mod/mc_versions")).body, ["1.21.1"]);
  assert.equal(network.length, 1, "version requests use the plugin cache");
  assert.equal(
    JSON.parse(ctx.layout.get()).some((page) => page.page.endsWith("/mods")),
    true
  );

  remoteFork.dispose();
  await until(() => ctx.i18n.items.size === 0);
  assert.equal((await request("/api/mod/list")).body, undefined);
  assert.equal(
    JSON.parse(ctx.layout.get()).some((page) => page.page.endsWith("/mods")),
    false
  );
  assert.equal(network[0].signal.aborted, true);
  assert.equal(clear.mock.calls.length, 1, "unload clears the daily cache timer");

  ctx.plugin((scoped) => scoped.set("remote", remote));
  await until(() => ctx.i18n.items.size === 1);
  await request("/api/mod/mc_versions");
  assert.equal(network.length, 2, "reactivation starts with a fresh cache");
  fork.dispose();
  await until(() => ctx.i18n.items.size === 0);
  assert.equal(clear.mock.calls.length, 2);
});

test("panel mod API preserves authorization, validation and daemon event names", async (t) => {
  const { ctx, remote, policy, calls, request } = await panelFixture(t);
  ctx.plugin((scoped) => scoped.set("remote", remote));
  await until(() => ctx.i18n.items.size === 1);
  assert.equal((await request("/api/mod/list", { role: 0 })).status, 403);
  policy.allowed = false;
  assert.equal((await request("/api/mod/list")).status, 403);
  policy.allowed = true;
  policy.canFileManager = false;
  assert.equal((await request("/api/mod/list")).status, 403);
  assert.equal((await request("/api/mod/mc_versions")).status, 403);
  policy.canFileManager = true;
  assert.equal((await request("/api/mod/list", { query: {} })).status, 400);
  assert.equal(calls.length, 0);
  await request("/api/mod/list", {
    query: { daemonId: "node", uuid: "instance", pageSize: "500" }
  });
  assert.deepEqual(calls[0], {
    node: "node",
    event: "instance/mods/list",
    data: { instanceUuid: "instance", page: 1, pageSize: 50, folder: "" }
  });
  const unsafe = await request("/api/mod/download", {
    method: "POST",
    request: {
      body: {
        daemonId: "node",
        uuid: "instance",
        fileName: "mod.jar",
        projectType: "mod",
        url: "http://127.0.0.1/private"
      }
    }
  });
  assert.equal(unsafe.status, 400);
  assert.equal(calls.length, 1);
});

test("plugin layout defaults preserve saved customization and do not persist themselves", async (t) => {
  const { Context } = panelRequire("cordis");
  const ctx = new Context();
  t.after(() => ctx.stop());
  ctx.plugin(layoutService());
  await ctx.start();
  ctx.layout.set([{ page: "/custom", items: [] }]);
  const plugin = ctx.plugin({
    inject: ["layout"],
    apply: (scoped) => {
      scoped.layout.provide(() => ({ page: "/mod", items: [] }));
    }
  });
  await settle();
  assert.deepEqual(
    JSON.parse(ctx.layout.get()).map((page) => page.page),
    ["/custom", "/mod"]
  );
  plugin.dispose();
  await settle();
  assert.deepEqual(
    JSON.parse(ctx.layout.get()).map((page) => page.page),
    ["/custom"]
  );
});

function temporaryDirectory(t) {
  const parent = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "elements-mod-test-"));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), parent);
    assert.ok(path.basename(directory).startsWith("elements-mod-test-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

async function daemonFixture(t, downloads = { task: null, downloadingCount: 0, stop() {} }) {
  const { Context, Service } = daemonRequire("cordis");
  const ctx = new Context();
  t.after(() => ctx.stop());
  class Protocol extends Service {
    handlers = new Map();
    replies = [];
    constructor(ctx) {
      super(ctx, "protocol", true);
    }
    on(event, handler) {
      return this.ctx.effect(() => {
        this.handlers.set(event, handler);
        return () => this.handlers.delete(event);
      });
    }
    response(_ctx, data) {
      this.replies.push({ data });
    }
    responseError(_ctx, error) {
      this.replies.push({ error });
    }
    error(_ctx, _event, error) {
      this.replies.push({ error });
    }
  }
  ctx.plugin(Protocol);
  ctx.plugin(load("daemon/plugins/monitor/src/backend/registries.ts").FeaturesService);
  ctx.set("instances", { subsystem: { exists: (uuid) => uuid === "instance" } });
  ctx.set("transfer", { downloads });
  const directory = temporaryDirectory(t);
  fs.mkdirSync(path.join(directory, "mods"));
  const files = {
    getFileManager: () => ({
      checkPath: (filename) =>
        !path.relative(directory, path.resolve(directory, filename)).startsWith(".."),
      toAbsolutePath: (filename) => path.resolve(directory, filename)
    }),
    uploads: { getUploads: () => new Map() }
  };
  const filesFork = ctx.plugin((scoped) => scoped.set("files", files));
  const plugin = load("daemon/plugins/mod/src/backend/index.ts");
  const fork = ctx.plugin({ ...plugin, name: "mod" });
  await ctx.start();
  const request = (event, data) => ctx.protocol.handlers.get(event)({}, data);
  return { ctx, fork, filesFork, directory, request };
}

test("daemon mod routes use instance/file services and disappear when a dependency is removed", async (t) => {
  const { ctx, filesFork, directory, request } = await daemonFixture(t);
  assert.equal(ctx.features.has("modManager"), true);
  assert.equal(ctx.protocol.handlers.size, 5);
  await request("instance/mods/list", { instanceUuid: "missing" });
  assert.match(ctx.protocol.replies.pop().error.err, /does not exist/);
  await request("instance/mods/list", { instanceUuid: "instance" });
  assert.deepEqual(ctx.protocol.replies.pop().data.folders, ["mods"]);
  fs.writeFileSync(path.join(directory, "mods/example.jar"), "test fixture");
  await request("instance/mods/toggle", { instanceUuid: "instance", fileName: "example.jar" });
  assert.equal(ctx.protocol.replies.pop().data, true);
  assert.equal(fs.existsSync(path.join(directory, "mods/example.jar.disabled")), true);
  await request("instance/mods/delete", {
    instanceUuid: "instance",
    fileName: "example.jar.disabled"
  });
  assert.equal(ctx.protocol.replies.pop().data, true);
  assert.equal(fs.existsSync(path.join(directory, "mods/example.jar.disabled")), false);
  filesFork.dispose();
  await until(() => !ctx.features.has("modManager"));
  assert.equal(ctx.protocol.handlers.size, 0);
  assert.ok(ctx.instances, "instance management remains available");
});

test("daemon unload cancels its own download and leaves an unrelated transfer running", async (t) => {
  for (const unrelated of [false, true]) {
    let finish;
    let stopped = 0;
    const downloads = {
      task: null,
      downloadingCount: 0,
      downloadFromUrl(_url, targetPath) {
        this.task = { path: targetPath };
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      stop() {
        stopped++;
        this.task = null;
        finish();
      }
    };
    const { fork, request } = await daemonFixture(t, downloads);
    await request("instance/mods/install", {
      instanceUuid: "instance",
      url: "https://example.com/mod.jar",
      fileName: "mod.jar",
      type: "mod"
    });
    await until(() => downloads.task !== null);
    if (unrelated) downloads.task = { path: "other-feature.jar" };
    fork.dispose();
    await settle();
    assert.equal(stopped, unrelated ? 0 : 1);
    finish();
  }
});

test("frontend registration and feature gating follow the mod and file plugin lifetimes", async (t) => {
  const { Context, Service } = panelRequire("cordis");
  const ctx = new Context();
  t.after(() => ctx.stop());
  for (const name of ["i18n", "routes", "ui", "actions"]) ctx.plugin(registrar(Service, name));
  for (const name of ["console", "desktop", "instance"]) ctx.set(name, {});
  const user = { state: { settings: { canFileManager: true } }, isAdmin: { value: false } };
  const component = {};
  const plugin = load("panel/plugins/mod/src/frontend.ts", {
    "@/lang/i18n": { t: (key) => key },
    "@/stores/useAppStateStore": { useAppStateStore: () => user },
    "@/views/LayoutContainer.vue": component,
    "./api": { modListApi() {} },
    "./desktop/DesktopModManager.vue": component,
    "./normal/ModManager.vue": component,
    "./normal/ModManagerAction.vue": component,
    "./normal/ModManagerPage.vue": component
  });
  ctx.plugin({ ...plugin, name: "mod" });
  await ctx.start();
  assert.equal(ctx.get("mod"), undefined);
  const fileFork = ctx.plugin((scoped) => scoped.set("file", {}));
  await until(() => ctx.get("mod"));
  const action = [...ctx.actions.items][0];
  const state = {
    daemon: { features: { modManager: true } },
    instanceInfo: { config: { type: "minecraft/java" } },
    isGlobalTerminal: false
  };
  assert.equal(action.condition(state), true);
  assert.equal(action.condition({ ...state, daemon: { features: {} } }), false);
  assert.equal(action.condition({ ...state, isGlobalTerminal: true }), false);
  user.state.settings.canFileManager = false;
  assert.equal(action.condition(state), false);
  user.isAdmin.value = true;
  assert.equal(action.condition(state), true);
  assert.equal([...ctx.routes.items][0].path, "/instances/terminal/mods");
  assert.equal([...ctx.ui.items][0].name, "InstanceModManager");
  fileFork.dispose();
  await until(() => ctx.get("mod") === undefined);
  for (const name of ["i18n", "routes", "ui", "actions"]) assert.equal(ctx.get(name).items.size, 0);
});

test("every panel locale includes the same nonempty mod translations", () => {
  const languages = path.join(root, "panel/plugins/i18n/src/languages");
  const directory = path.join(root, "panel/plugins/mod/src/i18n");
  const locales = fs
    .readdirSync(languages)
    .filter((file) => file.endsWith(".json"))
    .sort();
  assert.deepEqual(
    fs
      .readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort(),
    locales
  );
  const expected = Object.keys(
    JSON.parse(fs.readFileSync(path.join(directory, "en_US.json")))
  ).sort();
  for (const locale of locales) {
    const messages = JSON.parse(fs.readFileSync(path.join(directory, locale)));
    assert.deepEqual(Object.keys(messages).sort(), expected, locale);
    for (const key of expected) {
      assert.equal(typeof messages[key], "string", `${locale}: ${key}`);
      assert.ok(messages[key].length > 0, `${locale}: ${key}`);
    }
  }
});

test("live-enabled mod page renders a fallback while preserving existing custom layouts", async () => {
  const frontendRequire = Module.createRequire(path.join(root, "frontend/package.json"));
  const vue = frontendRequire("vue");
  const { parse, compileScript } = frontendRequire("@vue/compiler-sfc");
  const { renderToString } = frontendRequire("@vue/server-renderer");
  const filename = "panel/plugins/mod/src/normal/ModManagerPage.vue";
  const { descriptor } = parse(fs.readFileSync(path.join(root, filename), "utf8"));
  const compiled = compileScript(descriptor, { id: "mod-page-test", inlineTemplate: true });
  const globalLayoutConfig = vue.ref([]);
  const page = load(
    filename,
    {
      vue,
      "@/lang/i18n": { t: (key) => key },
      "@/stores/useLayoutConfig": { useLayoutConfigStore: () => ({ globalLayoutConfig }) },
      "@/views/LayoutContainer.vue": { render: () => vue.h("p", "saved-layout") },
      "./ModManager.vue": { props: ["card"], setup: (props) => () => vue.h("p", props.card.type) }
    },
    compiled.content
  ).default;
  assert.match(await renderToString(vue.createSSRApp(page)), /InstanceModManager/);
  globalLayoutConfig.value.push({ page: "/instances/terminal/mods", items: [] });
  assert.match(await renderToString(vue.createSSRApp(page)), /saved-layout/);
});

test("legacy mod windows restore under the action ID without losing layout or opening duplicates", () => {
  const { migrateLegacyInstanceWindow } = load("panel/plugins/desktop/src/legacyWindows.ts");
  const saved = {
    id: "mod-manager-instance",
    content: "mod-manager",
    instanceId: "instance",
    daemonId: "node",
    x: 120,
    width: 900
  };
  const migrated = migrateLegacyInstanceWindow(saved);
  assert.deepEqual(migrated, {
    ...saved,
    id: "instance-action-mod-manager-instance",
    content: "instance-action:mod-manager"
  });
  assert.equal(migrateLegacyInstanceWindow(migrated), migrated);
  assert.equal(saved.content, "mod-manager", "the stored source is not mutated");
});
