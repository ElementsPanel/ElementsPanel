const { from, createLoader, transpile, settle } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const panelRequire = from("panel");
const daemonRequire = from("daemon");
const ts = panelRequire("typescript");

// Execute TypeScript in memory. This suite neither builds the project nor opens
// a listener; external requests are replaced at their service boundary.

require.extensions[".ts"] = (mod, filename) => mod._compile(transpile(filename), filename);

const load = createLoader({ compiler: ts });

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

async function panelFixture(t, options = {}) {
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
    axios:
      options.axios ||
      (async (config) => {
        network.push(config);
        return { data: [{ project_type: "minecraft", version: "1.21.1" }] };
      })
  });
  const plugin = load("panel/plugins/mod/src/backend/index.ts", {
    "./mod_manager": { ModManagerService }
  });
  // Optional services the plugin resolves lazily; set before start so the
  // injects fire deterministically.
  if (options.storage) ctx.set("storage", options.storage);
  if (options.settingsForm) ctx.set("settingsForm", options.settingsForm);
  const fork = ctx.plugin({ ...plugin, name: "mod-manager" });
  await ctx.start();
  const dispatch = panelRequire("koa-compose")(app.middleware);
  const request = async (url, requestOptions = {}) => {
    const requestCtx = {
      path: url,
      method: "GET",
      query: { daemonId: "node", uuid: "instance" },
      request: { body: {} },
      role: 1,
      status: 404,
      set() {},
      ...requestOptions
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
  const fork = ctx.plugin({ ...plugin, name: "mod-manager" });
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
  const availability = load("panel/plugins/console/src/hooks/useInstanceActionAvailability.ts", {
    "@/hooks/useInstance": {
      TYPE_MINECRAFT_JAVA: "minecraft/java",
      TYPE_MINECRAFT_BEDROCK: "minecraft/bedrock"
    }
  });
  const plugin = load("panel/plugins/mod/src/frontend.ts", {
    "@/lang/i18n": { t: (key) => key },
    "@/hooks/useInstanceActionAvailability": availability,
    "@/stores/useAppStateStore": { useAppStateStore: () => user },
    "./api": { modListApi() {} },
    "./desktop/DesktopModManager.vue": component,
    "./normal/ModManager.vue": component,
    "./normal/ModManagerAction.vue": component
  });
  ctx.plugin({ ...plugin, name: "mod-manager" });
  await ctx.start();
  assert.equal(ctx.get("mod-manager"), undefined);
  const fileFork = ctx.plugin((scoped) => scoped.set("file", {}));
  await until(() => ctx.get("mod-manager"));
  const action = [...ctx.actions.items][0];
  const state = {
    instanceId: "instance",
    daemonId: "node",
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
  await until(() => ctx.get("mod-manager") === undefined);
  for (const name of ["i18n", "routes", "ui", "actions"]) assert.equal(ctx.get(name).items.size, 0);
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

function mirrorManager(respond, preference) {
  const requests = [];
  let dispose;
  const { ModManagerService } = load("panel/plugins/mod/src/backend/mod_manager.ts", {
    axios: async (config) => {
      requests.push(config);
      return await respond(config, requests.length);
    }
  });
  const manager = new ModManagerService(
    {
      effect(callback) { dispose = callback(); },
      setInterval() {},
      sleep: async () => {},
      logger: { warn() {} }
    },
    preference
  );
  return { manager, requests, dispose: () => dispose() };
}

test("Modrinth search, metadata, version lists and hash lookup use MCIM with ElementsPanel UA", async () => {
  const responses = {
    "/tag/game_version": [{ version: "1.21.1", version_type: "release" }],
    "/search": { hits: [
      { project_id: "sodium", title: "Sodium", project_type: "mod" },
      { project_id: "pack", title: "Modpack", project_type: "modpack" },
      { project_id: "server", title: "Java Server", project_type: "minecraft_java_server" }
    ], total_hits: 1 },
    "/project/sodium": { id: "sodium", project_type: "mod", title: "Sodium" },
    "/project/sodium/version": [{
      id: "v1", files: [{ url: "https://cdn.modrinth.com/data/sodium/versions/v1/mod.jar", filename: "mod.jar", primary: true }]
    }],
    "/version_file/hash": { id: "v1", project_id: "sodium" },
    "/version_files": { hash2: { id: "v1", project_id: "sodium" } },
    "/projects": [{ id: "sodium", title: "Sodium" }]
  };
  const f = mirrorManager(({ url }) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://mod.mcimirror.top");
    assert.ok(parsed.pathname.startsWith("/modrinth/v2/"));
    const key = parsed.pathname.slice("/modrinth/v2".length);
    assert.ok(Object.hasOwn(responses, key), key);
    return { data: responses[key] };
  });
  assert.deepEqual(await f.manager.getMinecraftVersions(), ["1.21.1"]);
  const search = await f.manager.searchProjects("sodium", 0, 10, { source: "modrinth" });
  assert.deepEqual(search.hits.map((hit) => [hit.id, hit.source]), [["sodium", "Modrinth"]]);
  const versions = await f.manager.getProjectVersions("sodium", "Modrinth");
  assert.equal(versions[0].files[0].url, "https://mod.mcimirror.top/data/sodium/versions/v1/mod.jar");
  assert.equal(versions[0].files[0].fallbackUrl, "https://cdn.modrinth.com/data/sodium/versions/v1/mod.jar");
  assert.equal((await f.manager.getInfoByHash("hash")).project.id, "sodium");
  assert.equal((await f.manager.getInfosByHashes(["hash2"])).hash2.project.id, "sodium");
  assert.equal(responses["/project/sodium/version"][0].files[0].fallbackUrl, undefined, "leave upstream responses untouched");
  for (const request of f.requests) {
    assert.equal(request.headers["User-Agent"], "ElementsPanel");
    assert.equal(request.headers["x-api-key"], undefined);
  }
});

test("CurseForge MCIM requests need no API key and only supported file hosts gain a mirror fallback", async () => {
  const f = mirrorManager(({ url }) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://mod.mcimirror.top");
    if (parsed.pathname === "/curseforge/v1/mods/search") {
      return { data: { data: [
        { id: 238222, name: "Example", classId: 6 },
        { id: 447100, name: "Modpack", classId: 4471 }
      ], pagination: { totalCount: 1 } } };
    }
    if (parsed.pathname === "/curseforge/v1/mods/238222") {
      return { data: { data: { id: 238222, name: "Example", classId: 6 } } };
    }
    assert.equal(parsed.pathname, "/curseforge/v1/mods/238222/files");
    return { data: { data: ["edge.forgecdn.net", "mediafilez.forgecdn.net"].map((host, index) => ({
      id: index + 1, fileName: "mod.jar", gameVersions: ["1.21.1", "Fabric"],
      downloadUrl: `https://${host}/files/1/2/mod.jar`
    })) } };
  });
  const search = await f.manager.searchProjects("Example", 0, 10, { source: "curseforge", type: "mod" });
  assert.deepEqual(search.hits.map((hit) => [hit.id, hit.source]), [["238222", "CurseForge"]]);
  const versions = await f.manager.getProjectVersions("238222", "CurseForge");
  assert.equal(versions[0].files[0].url, "https://mod.mcimirror.top/files/1/2/mod.jar");
  assert.equal(versions[0].files[0].fallbackUrl, "https://edge.forgecdn.net/files/1/2/mod.jar");
  assert.equal(versions[1].files[0].url, "https://mediafilez.forgecdn.net/files/1/2/mod.jar");
  assert.equal(versions[1].files[0].fallbackUrl, undefined);
  for (const request of f.requests) {
    assert.equal(request.headers["User-Agent"], "ElementsPanel");
    assert.equal(request.headers["x-api-key"], undefined);
    assert.equal(request.headers.Accept, "application/json");
  }
});

test("MCIM misses and outages fall back to existing APIs without polling the mirror or losing request data", async () => {
  for (const status of [404, 503]) {
    const f = mirrorManager(({ url }) => {
      if (new URL(url).hostname === "mod.mcimirror.top") throw { response: { status } };
      if (url === "https://api.modrinth.com/v2/version_files") return { data: {} };
      assert.equal(url, "https://api.curse.tools/v1/cf/mods/search");
      return { data: { data: [], pagination: { totalCount: 0 } } };
    });
    await f.manager.getInfosByHashes(["sha1"]);
    await f.manager.searchProjects("test", 10, 5, { source: "curseforge", type: "mod" });
    assert.equal(f.requests.length, 4);
    assert.deepEqual(f.requests[0].data, f.requests[1].data);
    assert.deepEqual(f.requests[2].params, f.requests[3].params);
    assert.equal(f.requests[2].headers["x-api-key"], undefined);
    assert.ok(f.requests[3].headers["x-api-key"]);
    assert.ok(f.requests.every((request) => request.headers["User-Agent"] === "ElementsPanel"));
  }
  const cancelled = mirrorManager(() => {
    cancelled.dispose();
    throw { code: "ERR_CANCELED" };
  });
  await cancelled.manager.searchProjects("test", 0, 10, { source: "modrinth" });
  assert.equal(cancelled.requests.length, 1);
});

test("official source preference requests official APIs first and falls back to the mirror", async () => {
  const f = mirrorManager(({ url }) => {
    const parsed = new URL(url);
    if (parsed.origin === "https://api.modrinth.com") {
      return { data: { hits: [{ project_id: "sodium", title: "Sodium", project_type: "mod" }], total_hits: 1 } };
    }
    throw new Error(`Unexpected request to ${url}`);
  }, "official");
  const search = await f.manager.searchProjects("sodium", 0, 10, { source: "modrinth" });
  assert.equal(search.hits[0].source, "Modrinth");
  assert.equal(f.requests.length, 1, "a reachable official API needs no fallback");
  assert.equal(new URL(f.requests[0].url).origin, "https://api.modrinth.com");
  assert.equal(f.requests[0].headers["x-api-key"], undefined);

  const outage = mirrorManager(({ url }) => {
    const parsed = new URL(url);
    if (parsed.origin === "https://api.curse.tools") throw { response: { status: 503 } };
    assert.equal(parsed.origin, "https://mod.mcimirror.top");
    return { data: { data: [{ id: 238222, name: "Example", classId: 6 }], pagination: { totalCount: 1 } } };
  }, "official");
  const fallbackSearch = await outage.manager.searchProjects("Example", 0, 10, { source: "curseforge", type: "mod" });
  assert.equal(fallbackSearch.hits[0].source, "CurseForge");
  assert.equal(outage.requests.length, 2);
  assert.equal(outage.requests[0].url, "https://api.curse.tools/v1/cf/mods/search");
  assert.ok(outage.requests[0].headers["x-api-key"], "the official CurseForge API needs its key on the primary request");
  assert.equal(outage.requests[1].url, "https://mod.mcimirror.top/curseforge/v1/mods/search");
  assert.equal(outage.requests[1].headers["x-api-key"], undefined, "the mirror proxies the key");
  assert.deepEqual(outage.requests[0].params, outage.requests[1].params);
  for (const request of outage.requests) {
    assert.equal(request.headers["User-Agent"], "ElementsPanel");
    assert.equal(request.headers.Accept, "application/json");
  }
});

test("MCIM file mapping preserves encoded paths and excludes lookalike hosts, credentials and custom ports", () => {
  const { withMirrorDownload } = load("panel/plugins/mod/src/backend/mcim.ts");
  const original = { url: "https://cdn.modrinth.com/data/a/versions/b/file%20name.jar?token=example", filename: "file name.jar", hashes: { sha1: "hash" } };
  const mirrored = withMirrorDownload(original, "official");
  assert.equal(mirrored.fallbackUrl, "https://mod.mcimirror.top/data/a/versions/b/file%20name.jar?token=example");
  assert.equal(mirrored.url, original.url);
  assert.deepEqual(mirrored.hashes, original.hashes);
  for (const url of [
    "https://cdn.modrinth.com.evil.example/file.jar", "https://edge.forgecdn.net:8443/file.jar",
    "https://user:password@cdn.modrinth.com/file.jar", "https://mediafilez.forgecdn.net/file.jar",
    "https://api.spiget.org/v2/resources/1/download", "https://mod.mcimirror.top/data/a/file.jar", "invalid"
  ]) assert.equal(withMirrorDownload({ url }, "official").fallbackUrl, undefined);
});

test("download URLs put the preferred source first and keep the other one as fallback", () => {
  const { withMirrorDownload } = load("panel/plugins/mod/src/backend/mcim.ts");
  const file = { url: "https://cdn.modrinth.com/data/a/versions/b/mod.jar", filename: "mod.jar", primary: true };
  const mirrorFirst = withMirrorDownload(file, "mirror");
  assert.equal(mirrorFirst.url, "https://mod.mcimirror.top/data/a/versions/b/mod.jar");
  assert.equal(mirrorFirst.fallbackUrl, file.url);
  assert.equal(mirrorFirst.filename, "mod.jar");
  assert.equal(mirrorFirst.primary, true);
  const officialFirst = withMirrorDownload(file, "official");
  assert.equal(officialFirst.url, file.url);
  assert.equal(officialFirst.fallbackUrl, "https://mod.mcimirror.top/data/a/versions/b/mod.jar");
  // A file the mirror cannot proxy keeps its single URL in either mode.
  const unproxied = { url: "https://mediafilez.forgecdn.net/files/1/2/mod.jar", filename: "mod.jar" };
  assert.deepEqual(withMirrorDownload(unproxied, "mirror"), unproxied);
  assert.deepEqual(withMirrorDownload(unproxied, "official"), unproxied);
});

test("a client URL pair is re-ordered by the current preference before it reaches the daemon", async (t) => {
  const { preferDownload } = load("panel/plugins/mod/src/backend/mcim.ts");
  const officialUrl = "https://cdn.modrinth.com/data/a/versions/b/mod.jar";
  const mirrorUrl = "https://mod.mcimirror.top/data/a/versions/b/mod.jar";
  // Stale pairs are ordered either way, whichever side the client listed first.
  assert.deepEqual(
    preferDownload(officialUrl, mirrorUrl, "mirror"),
    { url: mirrorUrl, fallbackUrl: officialUrl }
  );
  assert.deepEqual(
    preferDownload(mirrorUrl, officialUrl, "official"),
    { url: officialUrl, fallbackUrl: mirrorUrl }
  );
  assert.deepEqual(
    preferDownload(officialUrl, mirrorUrl, "official"),
    { url: officialUrl, fallbackUrl: mirrorUrl }
  );
  // Pairs without a mirror counterpart (SpigotMC's CDNs) keep the client order.
  const spigot = [
    "https://cdn.spiget.org/file/1/mod.jar",
    "https://api.spiget.org/v2/resources/1/download"
  ];
  assert.deepEqual(preferDownload(...spigot, "official"), {
    url: spigot[0],
    fallbackUrl: spigot[1]
  });
});

test("the download route applies the live preference to stale version lists", async (t) => {
  const stored = new Map();
  const storage = {
    getStorage: () => ({
      load: async (category, _classz, uuid) => stored.get(`${category}:${uuid}`) ?? null,
      store: async (category, uuid, object) => void stored.set(`${category}:${uuid}`, object)
    })
  };
  let declaration;
  const settingsForm = {
    declare: (form) => {
      declaration = form;
      return () => {};
    }
  };
  const { ctx, remote, calls, request } = await panelFixture(t, { storage, settingsForm });
  ctx.plugin((scoped) => scoped.set("remote", remote));
  await until(() => declaration);

  const officialUrl = "https://cdn.modrinth.com/data/a/versions/b/mod.jar";
  const mirrorUrl = "https://mod.mcimirror.top/data/a/versions/b/mod.jar";
  const download = (url, fallbackUrl) =>
    request("/api/mod/download", {
      method: "POST",
      request: {
        body: {
          daemonId: "node",
          uuid: "instance",
          fileName: "mod.jar",
          projectType: "mod",
          url,
          fallbackUrl
        }
      }
    });

  // The default preference is the mirror, so a list fetched with the official
  // CDN first still downloads through the mirror.
  await download(officialUrl, mirrorUrl);
  assert.equal(calls[0].data.url, mirrorUrl);
  assert.equal(calls[0].data.fallbackUrl, officialUrl);

  // Switching the form takes effect for the next download without a reload.
  await declaration.write({ sourcePreference: "official" });
  await download(mirrorUrl, officialUrl);
  assert.equal(calls[1].data.url, officialUrl);
  assert.equal(calls[1].data.fallbackUrl, mirrorUrl);

  // SpigotMC has no mirror variant, so its two CDNs stay in the client order.
  const spigot = ["https://cdn.spiget.org/file/1/mod.jar", "https://api.spiget.org/v2/resources/1/download"];
  await download(...spigot);
  assert.equal(calls[2].data.url, spigot[0]);
  assert.equal(calls[2].data.fallbackUrl, spigot[1]);
});

test("the stored source preference loads at startup and the settings form switches it live", async (t) => {
  const stored = new Map();
  const storage = {
    getStorage: () => ({
      load: async (category, _classz, uuid) => stored.get(`${category}:${uuid}`) ?? null,
      store: async (category, uuid, object) => void stored.set(`${category}:${uuid}`, object)
    })
  };
  let declaration;
  const settingsForm = {
    declare: (form) => {
      declaration = form;
      return () => {
        declaration = undefined;
      };
    }
  };
  const requests = [];
  const axios = async (config) => {
    requests.push(config);
    return { data: { hits: [], total_hits: 0 } };
  };
  const searchOrigin = async (fixture) => {
    await fixture.request("/api/mod/search", { query: { query: "sodium", source: "modrinth" } });
    return new URL(requests[requests.length - 1].url).origin;
  };

  const first = await panelFixture(t, { storage, settingsForm, axios });
  const warnings = [];
  first.ctx.on("internal/warning", (error) => warnings.push(error.message));
  first.ctx.plugin((scoped) => scoped.set("remote", first.remote));
  await until(() => declaration);

  // The form is one select with both options, titled from the plugin catalogue.
  const fields = declaration.fields();
  assert.equal(fields.length, 1);
  assert.equal(fields[0].key, "sourcePreference");
  assert.equal(fields[0].type, "select");
  assert.equal(fields[0].title, "TXT_CODE_MOD_SOURCE_PREFERENCE");
  assert.equal(fields[0].description, "TXT_CODE_MOD_SOURCE_PREFERENCE_DESC");
  assert.deepEqual(fields[0].options, [
    { value: "mirror", label: "TXT_CODE_MOD_SOURCE_MIRROR" },
    { value: "official", label: "TXT_CODE_MOD_SOURCE_OFFICIAL" }
  ]);

  // Nothing stored yet: the mirror is the default.
  assert.deepEqual(await declaration.read(), { sourcePreference: "mirror" });
  assert.equal(await searchOrigin(first), "https://mod.mcimirror.top");

  // Writing persists the choice and switches the running service without a restart.
  await declaration.write({ sourcePreference: "official" });
  assert.deepEqual(warnings, [], "loading and saving settings use declared services");
  assert.deepEqual(stored.get("ModManagerSettings:config"), { sourcePreference: "official" });
  assert.deepEqual(await declaration.read(), { sourcePreference: "official" });
  assert.equal(await searchOrigin(first), "https://api.modrinth.com");

  // A value outside the declared options is refused instead of persisted.
  await assert.rejects(declaration.write({ sourcePreference: "bogus" }));
  assert.deepEqual(stored.get("ModManagerSettings:config"), { sourcePreference: "official" });

  // A fresh plugin instance starts on the stored preference.
  const second = await panelFixture(t, { storage, settingsForm, axios });
  second.ctx.plugin((scoped) => scoped.set("remote", second.remote));
  await until(() => declaration.read().sourcePreference === "official");
  assert.equal(await searchOrigin(second), "https://api.modrinth.com");
});
