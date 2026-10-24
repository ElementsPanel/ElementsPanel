const { from, compileSfc, createLoader, settle: tick } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const panelRequire = from("panel");
const frontendRequire = from("frontend");
const ts = panelRequire("typescript");
const vue = frontendRequire("vue");

// Execute source in memory. No project build, listener, database or network.
const load = createLoader({
  compiler: ts,
  resolve(id, { filename, localRequire, load, overrides }) {
    if (id.endsWith(".vue")) return { name: path.basename(id) };
    if (id === "vue") return vue;
    if (id.startsWith(".")) {
      const base = path.resolve(path.dirname(filename), id);
      for (const candidate of [base + ".ts", path.join(base, "index.ts")])
        if (fs.existsSync(candidate)) return load(candidate, overrides);
    }
    return localRequire(id);
  }
});

function translations(Service) {
  return class extends Service {
    constructor(ctx) {
      super(ctx, "i18n", true);
    }
    define() {
      return this.ctx.effect(() => () => {});
    }
    $t(key) {
      return key;
    }
  };
}

function protocolService(Service) {
  return class extends Service {
    handlers = new Map();
    constructor(ctx) {
      super(ctx, "protocol", true);
    }
    on(name, callback) {
      return this.ctx.effect(() => {
        this.handlers.set(name, callback);
        return () => this.handlers.delete(name);
      });
    }
    response(request, data) {
      request.body = data;
    }
    async request(name, data) {
      const request = {};
      await this.handlers.get(name)(request, data);
      return request.body;
    }
  };
}

const systemInfo = () => ({ totalmem: 1024, freemem: 512, cpuUsage: 0.2, memUsage: 0.5 });

test("account profiles retain authentication fields without instance enrichment, including provider failure/replacement", async () => {
  const { getUserProfile } = load("panel/plugins/user/src/backend/service/user_profile.ts");
  const references = [
    { instanceUuid: "one", daemonId: "node" },
    { instanceUuid: "two", daemonId: "other" }
  ];
  const account = {
    uuid: "alice",
    userName: "Alice",
    permission: 1,
    instances: references,
    apiKey: "key",
    passWord: "secret",
    secret: "2fa-secret",
    open2FA: true
  };
  let provider;
  const ctx = {
    identity: { users: { getInstance: (id) => (id === "alice" ? account : undefined) } },
    get: () => provider,
    logger: { warn() {} }
  };
  assert.deepEqual((await getUserProfile(ctx, "alice")).instances, references);
  const plain = await getUserProfile(ctx, "alice", "node", true);
  assert.equal(plain.userName, "Alice");
  assert.equal(plain.instances.length, 1);
  assert.equal(plain.instances[0].status, -1);
  assert.equal(plain.open2FA, true);
  assert.equal(plain.passWord, undefined);
  assert.equal(plain.secret, undefined);
  provider = {
    getDetails: async () => {
      throw new Error("provider unloaded");
    }
  };
  assert.equal((await getUserProfile(ctx, "alice", "node", true)).uuid, "alice");
  provider = {
    getDetails: async (refs) => refs.map((item) => ({ ...item, nickname: "Reloaded", status: 3 }))
  };
  assert.equal(
    (await getUserProfile(ctx, "alice", "node", true)).instances[0].nickname,
    "Reloaded"
  );
  assert.deepEqual(account.instances, references);
  await assert.rejects(getUserProfile(ctx, "missing"), /UID/);
});

test("backend account routes and the guard survive instance provider removal", async (t) => {
  const { Context, Service } = panelRequire("cordis");
  const ctx = new Context();
  t.after(() => ctx.stop());
  const app = new (panelRequire("koa"))();
  ctx.plugin(load("panel/plugins/server/src/backend/koa.ts").KoaService, app);
  ctx.plugin(translations(Service));
  const pass = () => async (_request, next) => next();
  const account = {
    uuid: "alice",
    userName: "Alice",
    permission: 1,
    instances: [{ instanceUuid: "one", daemonId: "node" }]
  };
  ctx.set("roles", { USER: 1 });
  ctx.set("identity", { users: { getInstance: () => account } });
  ctx.set("middleware", { permission: pass, validator: pass });
  ctx.set("settings", { config: {} });
  ctx.set("settingsForm", { declare() {} });
  for (const name of ["operations", "storage", "globals"]) ctx.set(name, {});
  let scope;
  let initialized = 0;
  const guard = { identify: () => ({ uuid: "alice", role: 1 }) };
  const runtime = {
    core: () => scope,
    ROLE: () => ({ USER: 1 }),
    setPluginContext: (value) => {
      scope = value;
    }
  };
  const general = load("panel/plugins/user/src/backend/routers/general_user_router.ts", {
    "../runtime": runtime,
    "mcsmanager-common": { toBoolean: (value) => value === "true" },
    "../middleware/permission": pass,
    "../service/passport_service": {
      getUserUuid: () => "alice",
      isAjax: () => true,
      getToken: () => "token"
    },
    "../service/permission_service": { isTopPermissionByUuid: () => false },
    "../service/user_service": {}
  });
  const emptyRouter = () => new (panelRequire("@koa/router"))();
  const plugin = load("panel/plugins/user/src/backend/index.ts", {
    "./runtime": runtime,
    "./service/version_adapter": { migrateConfig() {} },
    "./service/auth_settings": { initAuthSettings: async () => {} },
    "./service/user_service": {
      initialize: async () => {
        initialized++;
      }
    },
    "./guard": { createRequestGuard: () => guard },
    "./routers/general_user_router": general,
    "./routers/auth_settings_router": { __esModule: true, default: emptyRouter },
    ...Object.fromEntries(
      ["login", "manage_user", "sso", "user_overview"].map((name) => [
        `./routers/${name}_router`,
        emptyRouter
      ])
    )
  });
  ctx.plugin(plugin);
  await ctx.start();
  const dispatch = panelRequire("koa-compose")(app.middleware);
  const request = async () => {
    const requestCtx = {
      url: "/api/auth/",
      path: "/api/auth/",
      method: "GET",
      query: { advanced: "true" },
      request: {},
      set() {}
    };
    await dispatch(requestCtx, async () => {});
    return requestCtx.body;
  };
  assert.equal((await request()).token, "token");
  const provider = ctx.plugin((child) =>
    child.set("instances", {
      getDetails: async (refs) => refs.map((item) => ({ ...item, status: 3 }))
    })
  );
  await tick();
  assert.equal((await request()).instances[0].status, 3);
  await provider.dispose();
  await tick();
  assert.equal(initialized, 1);
  assert.equal(ctx.guard, guard);
  const profile = await request();
  assert.equal(profile.uuid, "alice");
  assert.equal(profile.token, "token");
  assert.equal(profile.instances[0].status, -1);
});

test("panel instance permission errors translate without undeclared service warnings", async (t) => {
  const { Context, Service } = panelRequire("cordis");
  const ctx = new Context();
  t.after(() => ctx.stop());
  const warnings = [];
  ctx.on("internal/warning", (error) => warnings.push(error.message));
  const app = new (panelRequire("koa"))();
  ctx.plugin(load("panel/plugins/server/src/backend/koa.ts").KoaService, app);
  ctx.plugin(translations(Service));
  const pass = () => async (_request, next) => next();
  ctx.set("roles", { USER: 1, ADMIN: 10 });
  ctx.set("identity", { canAccessInstance: () => false });
  ctx.set("middleware", {
    permission: pass,
    validator: pass,
    speedLimit: pass,
    instanceAccess: pass()
  });
  ctx.set("operations", {});
  ctx.set("remote", {});
  const runtime = load("panel/plugins/instance/src/backend/runtime.ts");
  ctx.plugin(load("panel/plugins/instance/src/backend/index.ts", {
    "./runtime": runtime,
    "../runtime": runtime
  }));
  await ctx.start();
  const request = {
    path: "/api/protected_schedule/",
    method: "GET",
    query: { uuid: "one", daemonId: "node" },
    request: {},
    set() {}
  };
  await panelRequire("koa-compose")(app.middleware)(request, async () => {});
  assert.equal(request.status, 403);
  assert.equal(request.body, "TXT_CODE_permission.forbiddenInstance");
  assert.deepEqual(warnings, []);
});

test("panel runtime keeps overview and audit services alive when monitor is removed", async (t) => {
  const { Context, Service } = panelRequire("cordis");
  const ctx = new Context();
  t.after(() => ctx.stop());
  const disk = new Map();
  const common = {
    systemInfo,
    GlobalVariable: { get: (_key, fallback) => fallback },
    StorageSubsystem: class {
      fileExists(name) {
        return disk.has(name);
      }
      readFile(name) {
        return disk.get(name);
      }
      writeFile(name, content) {
        disk.set(name, content);
      }
    }
  };
  const runtime = load("panel/plugins/runtime/src/backend/index.ts", {
    "mcsmanager-common": common,
    "./service/log": { setupLogging() {} },
    "./lifecycle": { setupProcessLifecycle() {} },
    "./setting": { initSystemConfig: async () => {}, systemConfig: {}, saveSystemConfig() {} },
    "./version": { initVersionManager() {}, getVersion: () => "test" }
  });
  ctx.plugin(translations(Service));
  ctx.set("storage", {});
  const app = new (panelRequire("koa"))();
  ctx.plugin(load("panel/plugins/server/src/backend/koa.ts").KoaService, app);
  ctx.plugin(runtime);
  ctx.plugin({
    inject: ["koa", "middleware", "roles", "identity", "operations"],
    apply: load("panel/plugins/instance/src/backend/routers/operation_log_router.ts")
      .registerOperationLogRoutes
  });
  const monitor = ctx.plugin(
    load("panel/plugins/monitor/src/backend/index.ts", { "mcsmanager-common": common })
  );
  await ctx.start();
  const dispatch = panelRequire("koa-compose")(app.middleware);
  const request = async (url, method = "GET", body = {}) => {
    const req = {
      url,
      path: url,
      method,
      query: { instanceId: "one", daemonId: "node" },
      request: { body },
      set() {},
      throw(status) {
        throw new Error(String(status));
      }
    };
    await dispatch(req, async () => {});
    return req.body;
  };
  assert.ok((await request("/api/overview/")).chart);
  const operations = ctx.operations;
  await monitor.dispose();
  await tick();
  assert.equal(ctx.operations, operations);
  const overview = await request("/api/overview/");
  assert.ok(overview.system);
  assert.deepEqual(overview.remote, []);
  assert.equal(overview.chart, undefined);
  assert.equal(await request("/api/monitor/operation_logs"), undefined);
  await request("/api/overview/instance_crash", "POST", { instanceId: "one", daemonId: "node" });
  const entries = await request("/api/overview/instance_operation_logs");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, "instance_crash");
  assert.ok(disk.has("operation_logs/global.jsonl"));
});

test("daemon runtime answers capabilities and overview across monitor unload and reload", async (t) => {
  const { Context, Service } = from("daemon")("cordis");
  const ctx = new Context();
  t.after(() => ctx.stop());
  const config = { language: "en_us", allocatablePortRange: [1000, 2000], port: 23333 };
  const runtime = load("daemon/plugins/runtime/src/backend/index.ts", {
    "mcsmanager-common": { systemInfo },
    "./service/log": { setupLogging() {} },
    "./lifecycle": { setupProcessLifecycle() {} },
    "./entity/config": { globalConfiguration: { configure() {}, load() {}, store() {}, config } },
    "./service/version": { initVersionManager() {}, getVersion: () => "test" },
    "./service/dependencies": { checkDependencies() {} },
    "./service/download_manager": { stop() {} },
    "./service/mission_passport": { missionPassport: { dispose() {} } },
    "./service/seven_zip_service": {},
    "./utils/speed_limit": {},
    "./const": {},
    "./common/compress": {},
    "./common/gitignore_matcher": {},
    "fs-extra": { existsSync: () => false, chmodSync() {} },
    i18next: { changeLanguage: async () => {} }
  });
  ctx.plugin(translations(Service));
  ctx.set("storage", {});
  ctx.plugin(protocolService(Service));
  ctx.plugin(runtime);
  ctx.plugin({
    inject: ["features", "overview"],
    apply(scope) {
      scope.features.add("instanceBackup");
      scope.overview.provide(() => ({ instance: { total: 2, running: 1 } }));
    }
  });
  const monitorPlugin = load("daemon/plugins/monitor/src/backend/index.ts", {
    "mcsmanager-common": { systemInfo }
  });
  const monitor = ctx.plugin(monitorPlugin);
  await ctx.start();
  assert.equal((await ctx.protocol.request("info/overview")).cpuMemChart.length, 200);
  const features = ctx.features.all();
  await monitor.dispose();
  await tick();
  const info = await ctx.protocol.request("info/overview");
  assert.deepEqual(ctx.features.all(), features);
  assert.equal(info.features.instanceBackup, true);
  assert.equal(info.instance.total, 2);
  assert.equal(info.config.port, 23333);
  assert.equal(info.system.totalmem, 1024);
  assert.equal(info.cpuMemChart, undefined);
  ctx.plugin(monitorPlugin);
  await tick();
  assert.equal((await ctx.protocol.request("info/overview")).cpuMemChart.length, 200);
});

test("node settings cannot write other plugins' configuration; the backup declaration owns its settings", async () => {
  const config = {
    allocatablePortRange: [1000, 2000],
    instanceBackupPath: "original",
    instanceBackupFormat: "zip",
    instanceBackupCompressionLevel: 6,
    instanceBackupMaxSize: 5
  };
  const handlers = new Map();
  let declaration;
  const ctx = {
    settings: { config, save() {}, setLanguage() {} },
    protocol: { on: (name, handler) => handlers.set(name, handler), response() {} },
    i18n: { define() {}, $t: (key) => key },
    settingsForm: {
      declare: (value) => {
        declaration = value;
      }
    },
    tasks: { AsyncTask: class {}, register() {} },
    schedules: { register() {} },
    instances: {},
    archive: {},
    features: { add() {} }
  };
  load("daemon/plugins/node/src/backend/index.ts", {
    "./settings": { registerSettings() {} }
  }).apply(ctx);
  await handlers.get("info/setting")(
    {},
    {
      uploadSpeedRate: 128,
      instanceBackupPath: "wrong-owner",
      instanceBackupFormat: "7z",
      instanceBackupCompressionLevel: 1,
      instanceBackupMaxSize: 0
    }
  );
  assert.equal(config.uploadSpeedRate, undefined);
  assert.equal(config.instanceBackupPath, "original");
  assert.equal(config.instanceBackupFormat, "zip");
  assert.equal(config.instanceBackupCompressionLevel, 6);
  assert.equal(config.instanceBackupMaxSize, 5);
  load("daemon/plugins/backup/src/backend/index.ts").apply(ctx);
  declaration.write({
    instanceBackupPath: "backups",
    instanceBackupFormat: "7z",
    instanceBackupCompressionLevel: 9,
    instanceBackupMaxSize: 20
  });
  assert.deepEqual(declaration.read(), {
    instanceBackupPath: "backups",
    instanceBackupFormat: "7z",
    instanceBackupCompressionLevel: 9,
    instanceBackupMaxSize: 20
  });
  declaration.write({
    instanceBackupFormat: "invalid",
    instanceBackupCompressionLevel: 10,
    instanceBackupMaxSize: -1
  });
  assert.equal(config.instanceBackupFormat, "7z");
  assert.equal(config.instanceBackupCompressionLevel, 9);
  assert.equal(config.instanceBackupMaxSize, 20);
});

function frontendFixture(t) {
  const { Context, Service } = frontendRequire("cordis");
  const ctx = new Context();
  const warnings = [];
  ctx.on("internal/warning", (error) => warnings.push(error.message));
  t.after(async () => {
    await ctx.stop();
    assert.deepEqual(warnings, [], "frontend plugins only access declared services");
  });
  const routes = new Map();
  ctx.plugin(
    class extends Service {
      constructor(ctx) {
        super(ctx, "routes", true);
      }
      add(route) {
        return this.ctx.effect(() => {
          routes.set(route.path, route);
          return () => routes.delete(route.path);
        });
      }
    }
  );
  const services = load("panel/plugins/console/src/plugin/services.ts", {
    cordis: { ...frontendRequire("cordis") },
    "@console/config/router": {}
  });
  ctx.plugin(services.DesktopService);
  ctx.plugin(services.ActionsService);
  ctx.plugin(services.MenusService);
  ctx.plugin(translations(Service));
  ctx.set("console", {});
  ctx.set("ui", { globalComponent() {} });
  ctx.set("slots", { register() {} });
  const state = {
    isAdmin: vue.ref(true),
    isLogged: vue.ref(true),
    authEnabled: vue.ref(false),
    state: {}
  };
  const pluginContext = { ctx, usePluginService: (name) => ctx.get(name) };
  const overrides = {
    "@/lang/i18n": { t: (key) => key },
    "@/stores/useAppStateStore": { useAppStateStore: () => state },
    "@/stores/useAppToolsStore": {
      useAppToolsStore: () => ({ state: { showUserInfoDialog: false } })
    },
    "@/tools/vuetifyModal": { Modal: { confirm() {} } },
    "@/tools/vuetifyToast": { message: { success() {} } },
    "@/config/router": { ROLE: { ADMIN: 10, USER: 1 } },
    "@/plugin/context": pluginContext,
    "./api": {},
    "./session": { restoreSession() {} },
    "./hooks/quickStartFlow": {},
    "./hooks/useInstance": {},
    "./hooks/useInstanceTag": {},
    "./hooks/useSchedule": {},
    "./hooks/useServerConfig": {},
    "./hooks/useGenerateStartCmd": {}
  };
  return { ctx, routes, state, overrides, pluginContext };
}

test("user frontend retains login and account routes while optional instance grants follow dependencies", async (t) => {
  const { ctx, routes, overrides } = frontendFixture(t);
  ctx.plugin(load("panel/plugins/user/src/frontend.ts", overrides));
  await ctx.start();
  const user = ctx.user;
  for (const route of ["/login", "/sso/bind", "/users", "/customer"]) assert.ok(routes.has(route));
  assert.equal(routes.has("/users/resources"), false);
  ctx.plugin((scope) => scope.set("node", {}));
  const instance = ctx.plugin((scope) => scope.set("instance", {}));
  await tick();
  assert.ok(routes.has("/users/resources"));
  await instance.dispose();
  await tick();
  assert.equal(ctx.user, user);
  assert.ok(routes.has("/login"));
  assert.ok(routes.has("/users"));
  assert.equal(routes.has("/users/resources"), false);
  ctx.plugin((scope) => scope.set("instance", {}));
  await tick();
  assert.ok(routes.has("/users/resources"));
});

function setupSfc(relative, overrides) {
  const content = compileSfc(relative);
  const scope = vue.effectScope();
  const unmounts = [];
  const component = load(
    relative,
    {
      ...overrides,
      "vuetify/components": {},
      vue: { ...vue, onMounted() {}, onUnmounted: (fn) => unmounts.push(fn) }
    },
    content
  ).default;
  return {
    state: scope.run(() => component.setup({}, { expose() {} })),
    dispose() {
      unmounts.forEach((callback) => callback());
      scope.stop();
    }
  };
}

test("desktop user CRUD loads without resource providers and a late assignment response cannot reopen its UI", async (t) => {
  const oldWindow = global.window;
  global.window = { innerWidth: 1280, innerHeight: 720, removeEventListener() {} };
  const instance = vue.shallowRef();
  const node = vue.shallowRef();
  let assignmentReply;
  let resourceRequests = 0;
  const api = (value) => () => ({
    state: vue.ref(value),
    isLoading: vue.ref(false),
    execute: async () => vue.ref(value)
  });
  const resources = api([]);
  const resourceApi = () => {
    resourceRequests++;
    return resources();
  };
  const fixture = setupSfc("panel/plugins/user/src/desktop/DesktopUsers.vue", {
    "@/lang/i18n": { t: (key) => key },
    "@/plugin/context": {
      usePluginService: (name) => (name === "instance" ? instance.value : node.value)
    },
    "@/services/apis": {
      getUserInfo: api({ total: 1, data: [{ uuid: "alice", userName: "Alice" }] }),
      addUser: api(),
      deleteUser: api(),
      editUserInfo: api(),
      updateUserInstance: api(),
      remoteInstances: resourceApi,
      remoteNodeList: resourceApi,
      userInfoApiAdvanced: () => ({
        execute: () =>
          new Promise((resolve) => {
            assignmentReply = resolve;
          })
      })
    },
    "@/tools/nodes": {},
    "@/types/const": { INSTANCE_STATUS: {} },
    "@/tools/desktopNotice": {}
  });
  t.after(() => {
    fixture.dispose();
    global.window = oldWindow;
  });
  const state = fixture.state;
  await state.fetchUsers();
  assert.equal(state.users.value[0].userName, "Alice");
  assert.equal(resourceRequests, 0);
  assert.equal(state.canAssignInstances.value, false);
  instance.value = {};
  node.value = {};
  const opening = state.openAssignDialog({ uuid: "alice" });
  assert.equal(resourceRequests, 2);
  instance.value = undefined;
  assignmentReply({ value: { instances: [{ instanceUuid: "one", daemonId: "node" }] } });
  await opening;
  assert.equal(state.showAssignDialog.value, false);
  assert.deepEqual(state.assignedInstances.value, []);
  assert.equal(state.nodeRequest.value, undefined);
  await state.fetchUsers();
  assert.equal(state.users.value[0].userName, "Alice");
});

test("desktop shell opens/restores contributed windows and survives provider removal", async (t) => {
  const { ctx, routes, overrides, state: app } = frontendFixture(t);
  const originalDocument = global.document;
  global.document = {
    createElement: () => ({ dataset: {}, remove() {} }),
    head: { appendChild() {} },
    body: { classList: { remove() {} } },
    removeEventListener() {}
  };
  const desktopPlugin = ctx.plugin(
    load("panel/plugins/desktop/src/frontend.ts", {
      ...overrides,
      "./theme.scss?inline": "",
      "vuetify/components": {}
    })
  );
  await ctx.start();
  assert.ok(routes.has("/desktop"));
  const windowShell = ctx.desktop.window;
  assert.ok(ctx.desktop.confirmation);
  assert.equal(ctx.desktop.open({ id: "missing", view: "instance-console" }), false);
  ctx.plugin((scope) => scope.set("node", {}));
  const instancePlugin = load("panel/plugins/instance/src/frontend.ts", overrides);
  const instance = ctx.plugin(instancePlugin);
  const terminal = ctx.plugin((scope) => scope.set("terminal", {}));
  const config = ctx.plugin(load("panel/plugins/config/src/frontend.ts", overrides));
  await tick();
  let savedLayout = { windows: [], shortcuts: [] };
  const shell = setupSfc("panel/plugins/desktop/src/Desktop.vue", {
    ...overrides,
    "./api": {
      getDesktopLayoutConfig: () => ({ execute: async () => ({ value: savedLayout }) }),
      setDesktopLayoutConfig: () => ({ execute: async () => {} })
    },
    "@/stores/useAppConfigStore": { useAppConfigStore: () => ({ isDarkTheme: vue.ref(false) }) },
    "@/services/apis/index": {},
    "@/services/apis/appearance": {},
    "vue-router": { useRouter: () => ({ push() {} }) }
  });
  t.after(() => {
    shell.dispose();
    global.document = originalDocument;
  });
  const { windows } = shell.state;
  assert.equal(ctx.desktop.open({ id: "bad", view: "instance-console" }), false);
  assert.equal(ctx.desktop.open({ id: "bad-config", view: "node-plugin-config" }), false);
  assert.equal(ctx.desktop.open({ id: "bad-settings", view: "instance-settings", props: { instanceId: "one" } }), false);
  const configRequest = {
    id: "node-plugin-config-node", view: "node-plugin-config",
    props: { scope: "node", daemonId: "node" }
  };
  assert.equal(ctx.desktop.open(configRequest), true);
  const configWindow = windows.get(configRequest.id);
  configWindow.minimized = true;
  assert.equal(ctx.desktop.open(configRequest), true);
  assert.equal(windows.get(configRequest.id), configWindow);
  assert.equal(configWindow.minimized, false);
  assert.equal(
    ctx.instance.openConsole({ instanceUuid: "one", config: { nickname: "One" } }, "node"),
    true
  );
  assert.equal(windows.get("console-one").props.daemonId, "node");
  const consoleView = ctx.desktop.views.find((view) => view.id === "instance-console");
  const renderConsole = consoleView.component.setup({}, {
    attrs: { instanceId: "one", daemonId: "node" }, emit() {}
  });
  renderConsole().props.onOpenInstanceSettings("one", "node");
  const settingsWindow = windows.get("instance-settings-one");
  assert.equal(settingsWindow.content, "instance-settings");
  assert.deepEqual(settingsWindow.props, { instanceId: "one", daemonId: "node" });
  settingsWindow.minimized = true;
  renderConsole().props.onOpenInstanceSettings("one", "node");
  assert.equal(windows.get(settingsWindow.id), settingsWindow);
  assert.equal(settingsWindow.minimized, false);
  shell.state.openWindow("instances");
  assert.ok(windows.has("instances"));
  savedLayout = {
    shortcuts: ["instances"],
    windows: [
      { id: "schedule-one", content: "schedule", instanceId: "one", daemonId: "node" },
      { id: settingsWindow.id, content: settingsWindow.content, props: settingsWindow.props },
      { id: configRequest.id, content: configRequest.view, props: configRequest.props },
      { id: "bad", content: "schedule" },
      { id: "removed", content: "uninstalled-feature" }
    ]
  };
  await shell.state.loadDesktopLayout();
  assert.equal(windows.size, 3);
  assert.deepEqual(windows.get(settingsWindow.id).props, settingsWindow.props);
  assert.equal(windows.get("schedule-one").props.instanceId, "one");
  assert.deepEqual(windows.get(configRequest.id).props, configRequest.props);
  ctx.instance.openConsole({ instanceUuid: "one" }, "node");
  await terminal.dispose();
  await tick();
  assert.equal(windows.has("console-one"), false);
  assert.ok(windows.has("schedule-one"));
  await instance.dispose();
  await tick();
  assert.equal(windows.size, 1);
  assert.ok(windows.has(configRequest.id));
  await config.dispose();
  await tick();
  assert.equal(windows.size, 0);
  assert.equal(
    ctx.desktop.apps.some((item) => item.id === "instances"),
    false
  );
  assert.equal(ctx.desktop.window, windowShell);
  assert.ok(routes.has("/desktop"));
  ctx.plugin(instancePlugin);
  await tick();
  shell.state.openWindow("instances");
  assert.ok(windows.has("instances"));
  app.isAdmin.value = false;
  await vue.nextTick();
  assert.equal(windows.has("instances"), false);
  await desktopPlugin.dispose();
  await tick();
  assert.equal(ctx.desktop.confirmation, undefined);
  assert.equal(ctx.desktop.window, undefined);
  assert.equal(routes.has("/desktop"), false);
});

test("instance hook compatibility resolves current providers and never retains the unloaded implementation", () => {
  const provider = vue.shallowRef();
  const facade = load("panel/plugins/console/src/hooks/instanceService.ts", {
    "@/plugin/context": { usePluginService: () => provider.value }
  });
  const call = facade.instanceHook("useInstanceInfo");
  const data = facade.instanceData("INSTANCE_CONFIGS", []);
  const size = vue.computed(() => data.length);
  assert.throws(() => call(), /not loaded/);
  assert.equal(size.value, 0);
  provider.value = { hooks: { useInstanceInfo: (id) => "old:" + id, INSTANCE_CONFIGS: ["old"] } };
  assert.equal(call("one"), "old:one");
  assert.deepEqual([...data], ["old"]);
  assert.equal(size.value, 1);
  provider.value = undefined;
  assert.throws(() => call(), /not loaded/);
  assert.equal(size.value, 0);
  provider.value = {
    hooks: { useInstanceInfo: (id) => "new:" + id, INSTANCE_CONFIGS: ["new", "extra"] }
  };
  assert.equal(call("one"), "new:one");
  assert.deepEqual([...data], ["new", "extra"]);
  assert.deepEqual(Object.keys(data), ["0", "1"]);
  assert.equal(size.value, 2);
});

function daemonSettingsFixture(plugin, initialConfig = {}) {
  const config = structuredClone(initialConfig);
  const saved = [];
  const handlers = new Map();
  let declaration;
  let overview;
  const ctx = {
    settings: { config, save: () => saved.push(structuredClone(config)) },
    i18n: { $t: (key) => key },
    inject: (_names, callback) => callback(ctx),
    settingsForm: { declare: (value) => { declaration = value; } },
    overview: { provide: (provider) => { overview = provider; } },
    protocol: {
      on: (event, handler) => handlers.set(event, handler),
      response: (request, value) => { request.body = value; },
      responseError: (_request, error) => { throw error; }
    }
  };
  load(`daemon/plugins/${plugin}/src/backend/settings.ts`).registerSettings(ctx);
  const { validatePluginSettings } = load("common/src/plugin_contract.ts");
  return {
    config, saved, handlers,
    read: () => declaration.read(),
    overview: () => overview(),
    write: (values) => {
      validatePluginSettings(declaration.fields(), values);
      declaration.write(values);
    }
  };
}

test("file, terminal and instance forms retain stored settings and reject invalid changes atomically", () => {
  const file = daemonSettingsFixture("file", {
    uploadSpeedRate: 40, downloadSpeedRate: 128, maxDownloadFromUrlFileCount: 3,
    outputBufferSize: 256
  });
  file.write(file.read()); // Existing rates outside the former dropdown remain editable.
  file.write({ uploadSpeedRate: 0, downloadSpeedRate: 32, maxDownloadFromUrlFileCount: 0, outputBufferSize: 512 });
  assert.equal(file.config.outputBufferSize, 256);
  assert.equal(file.config.uploadSpeedRate, 0);
  assert.equal(file.config.maxDownloadFromUrlFileCount, 0);
  const beforeFile = structuredClone(file.config);
  assert.throws(() => file.write({ uploadSpeedRate: 128, maxDownloadFromUrlFileCount: 1.5 }));
  assert.throws(() => file.write({ downloadSpeedRate: -1 }));
  assert.deepEqual(file.config, beforeFile);
  assert.equal(file.saved.length, 2);

  const terminal = daemonSettingsFixture("terminal", { outputBufferSize: 256 });
  for (const invalid of [15, 4097, 32.5, Infinity, "256"]) {
    assert.throws(() => terminal.write({ outputBufferSize: invalid }));
  }
  assert.equal(terminal.saved.length, 0);
  terminal.write({ outputBufferSize: 4096 });
  assert.equal(terminal.config.outputBufferSize, 4096);

  const instance = daemonSettingsFixture("instance", {
    enableSoftShutdown: true, softShutdownSkipDocker: false, softShutdownWaitSeconds: 45
  });
  const beforeInstance = instance.read();
  for (const invalid of [0, 601, 1.5, Infinity, "30"]) {
    assert.throws(() => instance.write({ enableSoftShutdown: false, softShutdownWaitSeconds: invalid }));
    assert.deepEqual(instance.read(), beforeInstance);
  }
  instance.write({ enableSoftShutdown: false, softShutdownSkipDocker: true, softShutdownWaitSeconds: 60 });
  assert.deepEqual(instance.saved[0], {
    enableSoftShutdown: false, softShutdownSkipDocker: true, softShutdownWaitSeconds: 60
  });
});

test("node mappings migrate once, validate before saving and preserve an intentionally empty list", () => {
  const node = daemonSettingsFixture("node");
  assert.deepEqual(node.overview(), { remoteMappings: null });
  const legacy = [{
    from: { ip: "panel.example", port: 443, prefix: "/panel" },
    to: { ip: "node.example", port: 443, prefix: "/node" }
  }];
  const request = {};
  node.handlers.get("node/mappings")(request, { remoteMappings: legacy });
  assert.deepEqual(request.body, legacy);
  assert.equal(node.saved.length, 1);
  assert.notEqual(node.config.remoteMappings, legacy);
  const editable = node.read();
  editable.remoteMappings[0].toPort = 8443;
  node.write(editable);
  assert.equal(node.config.remoteMappings[0].to.port, 8443);
  const saved = structuredClone(node.config.remoteMappings);
  for (const invalid of [0, 65536, 443.5, "443"]) {
    editable.remoteMappings[0].toPort = invalid;
    assert.throws(() => node.write(editable));
    assert.deepEqual(node.config.remoteMappings, saved);
  }
  node.write({ remoteMappings: [] });
  node.handlers.get("node/mappings")(request, { remoteMappings: legacy });
  assert.deepEqual(request.body, []);
  assert.deepEqual(node.overview(), { remoteMappings: [] });
  assert.equal(node.saved.length, 3);
});

test("daemon settings declarations keep their plugin ownership and leave when the plugin unloads", async (t) => {
  const { Context, Service } = from("daemon")("cordis");
  const ctx = new Context();
  t.after(() => ctx.stop());
  const warnings = [];
  ctx.on("internal/warning", (error) => warnings.push(error.message));
  ctx.plugin(translations(Service));
  ctx.set("settings", { config: { outputBufferSize: 256 }, save() {} });
  ctx.set("plugins", { runExclusive: (operation) => operation(), configuration: (id) => ({ id, fields: [], values: {} }) });
  const { SettingsFormService } = load("daemon/plugins/config/src/backend/settings.ts", {
    "mcsmanager-common": load("common/src/plugin_contract.ts")
  });
  ctx.plugin({
    name: "config",
    inject: ["plugins"],
    apply(scope) {
      scope.plugin(SettingsFormService);
    }
  });
  const plugin = ctx.plugin({
    name: "terminal",
    inject: ["settings", "i18n"],
    apply: load("daemon/plugins/terminal/src/backend/settings.ts").registerSettings
  });
  await ctx.start();
  assert.deepEqual(ctx.settingsForm.declared(), ["terminal"]);
  assert.equal((await ctx.settingsForm.read("terminal")).values.outputBufferSize, 256);
  await ctx.settingsForm.write("terminal", { outputBufferSize: 1024 });
  assert.equal(ctx.settings.config.outputBufferSize, 1024);
  await plugin.dispose();
  await tick();
  assert.deepEqual(ctx.settingsForm.declared(), []);
  assert.deepEqual(warnings, []);
});

test("daemon storage preserves migrated and cleared mappings across reloads", () => {
  const { Config } = load("daemon/plugins/runtime/src/backend/entity/config.ts");
  const { default: Storage } = load("common/src/system_storage.ts");
  const storage = new Storage();
  let saved;
  storage.writeFile = (_name, content) => { saved = content; };
  storage.readFile = () => saved;
  storage.fileExists = () => true;
  const config = new Config();
  assert.equal(config.remoteMappings, undefined);
  for (const mappings of [[{
    from: { ip: "panel.example", port: 443, prefix: "" },
    to: { ip: "node.example", port: 8443, prefix: "/daemon" }
  }], []]) {
    config.remoteMappings = mappings;
    storage.store("Config", "global", config);
    assert.deepEqual(storage.load("Config", Config, "global").remoteMappings, mappings);
  }
});
