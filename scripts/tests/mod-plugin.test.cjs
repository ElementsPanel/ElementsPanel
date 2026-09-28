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
    instance(value) {
      return this.add(value);
    }
    $t(key) {
      return key;
    }
  };
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
    validator: load("panel/plugins/runtime/src/backend/middleware/validator.ts").default,
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

test("panel routes, translations and timers follow dependency lifetime", async (t) => {
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

  remoteFork.dispose();
  await until(() => ctx.i18n.items.size === 0);
  assert.equal((await request("/api/mod/list")).body, undefined);
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

test("Spigot version filenames are safe for batch downloads and match their fallback file", async () => {
  const cases = [
    { name: "Example Plugin", versions: ["1.2.3", "1.2/1.3: stable", '1.4\\beta?*"<>|\u0000'] },
    { name: "CON.unsafe", versions: ["latest"] },
    { name: "插件😀".repeat(100), versions: ["最新版😀".repeat(100)] }
  ];
  for (const resource of cases) {
    const { ModManagerService } = load("panel/plugins/mod/src/backend/mod_manager.ts", {
      axios: async ({ url }) => ({
        data: url.endsWith("/versions")
          ? resource.versions.map((name, id) => ({ name, id }))
          : { name: resource.name }
      })
    });
    const manager = new ModManagerService({
      effect() {},
      setInterval() {},
      logger: { warn: (...args) => assert.fail(args.join(" ")) }
    });
    const versions = await manager.getSpigotVersions("123");
    assert.equal(versions.length, resource.versions.length);
    for (const [index, version] of versions.entries()) {
      const fileName = version.files[0].filename;
      assert.equal(version.files[1].filename, fileName);
      assert.match(fileName, /\.jar$/);
      assert.doesNotMatch(fileName, /[\\/:*?"<>|\x00-\x1f\x7f]/);
      assert.doesNotMatch(fileName, /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i);
      assert.ok(Buffer.byteLength(fileName, "utf8") <= 255);
      assert.equal(Buffer.from(fileName).toString("utf8"), fileName);
      assert.equal(version.name, resource.versions[index], "keep the original display name");
    }
    if (resource.name === "Example Plugin") {
      assert.equal(versions[0].files[0].filename, "Example_Plugin-1.2.3.jar");
      assert.equal(versions[1].files[0].filename, "Example_Plugin-1.2_1.3__stable.jar");
    }
  }
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
  ctx.plugin(load("daemon/plugins/runtime/src/backend/registries.ts").FeaturesService);
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
  assert.equal(ctx.protocol.handlers.size, 7);
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

test("tracked mod downloads expose instance-scoped progress and retain completion after global task cleanup", async (t) => {
  let finish;
  const downloads = {
    task: null,
    downloadingCount: 0,
    downloadFromUrl(_url, target, _fallback, options) {
      assert.equal(options.ifIdle, true);
      assert.equal(options.overwrite, false);
      this.downloadingCount = 1;
      this.task = { path: target, current: 4, total: 10, status: 0 };
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    stop() {
      finish?.();
      this.task = null;
      this.downloadingCount = 0;
    }
  };
  const { ctx, request } = await daemonFixture(t, downloads);
  assert.equal(ctx.features.has("modInstallTasks"), true);
  await request("instance/mods/install_task", {
    instanceUuid: "instance",
    url: "https://cdn.modrinth.com/example.jar",
    fileName: "example.jar",
    type: "plugin"
  });
  const receipt = ctx.protocol.replies.pop().data;
  assert.equal(receipt.accepted, true);
  await until(() => downloads.task !== null);
  const status = async (instanceUuid = "instance") => {
    await request("instance/mods/install_status", { instanceUuid, taskId: receipt.taskId });
    return ctx.protocol.replies.pop().data;
  };
  assert.deepEqual(await status(), {
    taskId: receipt.taskId,
    state: "running",
    path: "plugins/example.jar",
    downloadedBytes: 4,
    totalBytes: 10
  });
  ctx.instances.subsystem.exists = () => true;
  assert.deepEqual(await status("other"), { taskId: receipt.taskId, state: "unknown" });
  downloads.task.current = 10;
  finish();
  downloads.task = null;
  downloads.downloadingCount = 0;
  await settle();
  const complete = await status();
  assert.equal(complete.state, "completed");
  assert.equal(complete.downloadedBytes, 10);
  assert.doesNotMatch(JSON.stringify(complete), /https:|absolute|error/);
});

test("tracked mod downloads protect existing files and busy transfers without cancelling them", async (t) => {
  let called = 0;
  let stopped = 0;
  const downloads = {
    task: { path: "/another-instance/private.jar", current: 5, total: 10 },
    downloadingCount: 1,
    async downloadFromUrl() {
      called++;
    },
    stop() {
      stopped++;
    }
  };
  const { ctx, fork, directory, request } = await daemonFixture(t, downloads);
  fs.writeFileSync(path.join(directory, "mods/existing.jar"), "existing");
  for (const [fileName, reason] of [
    ["existing.jar", "file_exists"],
    ["new.jar", "busy"]
  ]) {
    await request("instance/mods/install_task", {
      instanceUuid: "instance",
      url: "https://cdn.modrinth.com/example.jar",
      fileName,
      type: "mod"
    });
    const { taskId } = ctx.protocol.replies.pop().data;
    let status;
    for (let i = 0; i < 100; i++) {
      await request("instance/mods/install_status", { instanceUuid: "instance", taskId });
      status = ctx.protocol.replies.pop().data;
      if (status.state === "failed") break;
      await settle();
    }
    assert.equal(status.state, "failed");
    assert.equal(status.error, reason);
    assert.doesNotMatch(JSON.stringify(status), /another-instance|private/);
  }
  assert.equal(called, 0);
  assert.equal(fs.readFileSync(path.join(directory, "mods/existing.jar"), "utf8"), "existing");
  fork.dispose();
  await settle();
  assert.equal(stopped, 0);
});

test("tracked downloads validate destinations, preserve folder case and sanitize failures", async (t) => {
  const downloads = {
    task: null,
    downloadingCount: 0,
    async downloadFromUrl(_url, target, _fallback, options) {
      assert.equal(path.basename(path.dirname(target)), "Plugins");
      assert.equal(options.overwrite, true);
      throw new Error("https://user:PRIVATE@internal.example/absolute/path");
    },
    stop() {}
  };
  const { ctx, directory, request } = await daemonFixture(t, downloads);
  fs.mkdirSync(path.join(directory, "Plugins"));
  for (const extra of [{ fileName: "../escape.jar" }, { type: "other" }, { overwrite: "true" }]) {
    await request("instance/mods/install_task", {
      instanceUuid: "instance",
      url: "https://cdn.modrinth.com/example.jar",
      fileName: "example.jar",
      type: "plugin",
      ...extra
    });
    assert.ok(ctx.protocol.replies.pop().error);
  }
  await request("instance/mods/install_task", {
    instanceUuid: "instance",
    url: "https://cdn.modrinth.com/example.jar",
    fileName: "example.jar",
    type: "plugin",
    overwrite: true
  });
  const { taskId } = ctx.protocol.replies.pop().data;
  let status;
  for (let i = 0; i < 100; i++) {
    await request("instance/mods/install_status", { instanceUuid: "instance", taskId });
    status = ctx.protocol.replies.pop().data;
    if (status.state === "failed") break;
    await settle();
  }
  assert.equal(status.path, "Plugins/example.jar");
  assert.equal(status.state, "failed");
  assert.equal(status.error, "download_failed");
  assert.doesNotMatch(JSON.stringify(status), /PRIVATE|internal|absolute/);
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
    "./api": { modListApi() {} },
    "./desktop/DesktopModManager.vue": component,
    "./normal/ModManager.vue": component,
    "./normal/ModManagerAction.vue": component
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
