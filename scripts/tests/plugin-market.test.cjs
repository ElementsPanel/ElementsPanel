const { from, createLoader, compileSfc } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const { test } = require("node:test");

const panelRequire = from("panel");
const frontendRequire = from("frontend");
const ts = panelRequire("typescript");
const vue = frontendRequire("vue");

// Load source in memory: no project build, network listener or plugin installation.
const load = createLoader({
  compiler: ts,
  transform: (source, filename, inlineTemplate = false) =>
    filename.endsWith(".vue") ? compileSfc(filename, { inlineTemplate }) : source
});

function version(number) {
  return {
    id: number,
    version: number,
    status: "approved",
    changelog: "notes",
    sizeBytes: 20,
    fileCount: 2,
    submittedAt: 1
  };
}

const operationState = load("plugins/market/panel/src/operations.ts", {
  vue,
  "@/plugin/context": { ctx: { plugins: { refresh: async () => {} } } },
  "./api": {}
});
const targetHelpers = load("plugins/market/panel/src/targets.ts", {
  "@/lang/i18n": { t: (key) => key }
});

async function backendFixture(get) {
  const routes = new Map();
  const calls = [];
  const warnings = [];
  const detail = {
    id: "plugin/one",
    name: "one",
    latestVersion: version("2.0.0"),
    versions: [version("2.0.0"), version("1.0.0")]
  };
  const axios = {
    get: async (...args) => {
      calls.push(args);
      return get ? get(...args) : { data: detail };
    },
    isAxiosError: () => false
  };
  const pass = () => async (_ctx, next) => next();
  const plugin = load("plugins/market/panel/src/backend/index.ts", {
    axios,
    "mcsmanager-common": {},
    "./plugin_icon": {
      MAX_PLUGIN_ICON_BYTES: 1024 * 1024,
      encodePluginIcon: () => "data:image/png;base64,review"
    },
    "../i18n": { localeMessages: {} },
    "../version": load("plugins/market/panel/src/version.ts"),
    "./service/market_service": {},
    "./service/market_settings": {
      initMarketSettings: async () => {},
      marketSettings: () => ({ pluginMarketAddr: "https://market.example" })
    },
    "./service/plugin_market": {
      PluginMarketError: class extends Error {},
      panelDependencyVersions: () => ({}),
      listInstalled: () => [{ pluginId: "plugin/one", version: "1.0.0" }]
    }
  });
  const router = Object.fromEntries(
    ["get", "post", "put", "delete"].map((method) => [
      method,
      (url, ...handlers) => routes.set(`${method} ${url}`, handlers)
    ])
  );
  await plugin.apply({
    i18n: { define() {}, $t: (key) => key },
    logger: { warn: (message) => warnings.push(message) },
    roles: { USER: 1, ADMIN: 10 },
    middleware: {
      validator: load("plugins/runtime/panel/src/backend/middleware/validator.ts").default,
      permission:
        ({ level }) =>
        async (ctx, next) => {
          if (ctx.role < level) ctx.status = 403;
          else await next();
        },
      speedLimit: pass
    },
    koa: { router: () => router },
    settingsForm: { declare() {} }
  });
  async function request(query, role = 10, route = "get /plugin/detail") {
    const ctx = { query, role, request: { query, body: query } };
    await panelRequire("koa-compose")(routes.get(route))(ctx);
    return ctx;
  }
  return { request, calls, detail, warnings };
}

test("the plugin list reads every page the market serves, not only the first", async () => {
  const all = Array.from({ length: 100 }, (_, index) => ({ id: `plugin-${index}` }));
  const { request, calls } = await backendFixture(async (url, options) => {
    assert.equal(url, "https://market.example/api/plugins");
    const { page, pageSize } = options.params;
    return {
      data: { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length }
    };
  });
  const { body } = await request({}, 10, "get /plugin/list");
  assert.deepEqual(
    body.map((item) => item.id),
    all.map((item) => item.id)
  );
  assert.deepEqual(
    calls.map((call) => call[1].params),
    [1, 2, 3].map((page) => ({ page, pageSize: 48 }))
  );
});

test("a market source that ignores paging is read once instead of forever", async () => {
  const { request, calls } = await backendFixture(async () => ({
    data: { items: [{ id: "a" }, { id: "b" }], total: 5 }
  }));
  const { body } = await request({}, 10, "get /plugin/list");
  assert.deepEqual(
    body.map((item) => item.id),
    ["a", "b"]
  );
  assert.equal(calls.length, 2, "the repeated page ends the loop");
});

test("a plugin listed twice on one page is taken once and does not end the paging early", async () => {
  const pages = [
    { items: [{ id: "a" }, { id: "a" }, { id: "b" }], total: 3 },
    { items: [{ id: "c" }], total: 3 }
  ];
  const { request, calls } = await backendFixture(async (_url, options) => ({
    data: pages[options.params.page - 1] ?? { items: [], total: 3 }
  }));
  const { body } = await request({}, 10, "get /plugin/list");
  assert.deepEqual(
    body.map((item) => item.id),
    ["a", "b", "c"],
    "a duplicate must not be counted towards total, nor reach the page twice"
  );
  assert.equal(calls.length, 2);
});

test("list items without an id are skipped rather than collapsed into one plugin", async () => {
  const { request } = await backendFixture(async (_url, options) => ({
    data:
      options.params.page === 1
        ? {
            items: [{ name: "no id" }, { id: "" }, { id: "real" }, { pluginId: "wrong field" }],
            total: 2
          }
        : { items: [{ id: "second" }], total: 2 }
  }));
  const { body } = await request({}, 10, "get /plugin/list");
  assert.deepEqual(
    body.map((item) => item.id),
    ["real", "second"]
  );
});

test("a page that fails keeps the plugins already read instead of failing the whole list", async () => {
  const { request, warnings } = await backendFixture(async (_url, options) => {
    if (options.params.page === 2) throw new Error("gateway reset");
    return { data: { items: [{ id: "first" }], total: 5 } };
  });
  const { body } = await request({}, 10, "get /plugin/list");
  assert.deepEqual(
    body.map((item) => item.id),
    ["first"]
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /page 2/);
});

test("a first page that fails is still an error, because nothing could be listed", async () => {
  const { request } = await backendFixture(async () => {
    throw new Error("unreachable");
  });
  await assert.rejects(request({}, 10, "get /plugin/list"), {
    message: "TXT_CODE_PLUGIN_MARKET_UNREACHABLE"
  });
});

test("detail API requires admin and a plugin id before contacting the market", async () => {
  const { request, calls } = await backendFixture();
  assert.equal((await request({ pluginId: "plugin/one" }, 1)).status, 403);
  assert.equal((await request({})).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await request({}, 1, "get /plugin/updates")).status, 403);
  assert.equal((await request({}, 1, "post /plugin/update")).status, 403);
  assert.equal((await request({}, 10, "post /plugin/update")).status, 400);
  assert.equal((await request({}, 1, "post /runtime/update")).status, 403);
  assert.equal((await request({}, 10, "post /runtime/update")).status, 400);
  assert.equal((await request({}, 1, "post /plugin/update-batch")).status, 403);
  assert.equal((await request({}, 10, "post /plugin/update-batch")).status, 400);
  assert.equal(calls.length, 0);
});

test("detail proxy encodes ids, preserves the requested release and adds local state", async () => {
  const { request, calls } = await backendFixture();
  const { body } = await request({ pluginId: "plugin/one", version: "1.0.0" });
  assert.equal(calls[0][0], "https://market.example/api/plugins/plugin%2Fone");
  assert.equal(calls[0][1].params.version, "1.0.0");
  assert.equal(body.selectedVersion.version, "1.0.0");
  assert.equal(body.latestVersion.version, "2.0.0");
  assert.equal(body.installedVersion, "1.0.0");
});

test("detail proxy defaults to latest and rejects missing or unapproved releases", async () => {
  const { request, detail } = await backendFixture();
  assert.equal((await request({ pluginId: "plugin/one" })).body.selectedVersion.version, "2.0.0");
  await assert.rejects(request({ pluginId: "plugin/one", version: "missing" }), {
    status: 404,
    message: "TXT_CODE_PLUGIN_MARKET_NOT_FOUND"
  });
  detail.versions[1].status = "pending";
  await assert.rejects(request({ pluginId: "plugin/one", version: "1.0.0" }), {
    status: 404,
    message: "TXT_CODE_PLUGIN_MARKET_NOT_FOUND"
  });
});

function installFixture(overrides = {}) {
  const calls = [];
  const events = [];
  const errors = [];
  const successes = [];
  const warnings = [];
  const props = vue.reactive({
    plugin: { id: "one", name: "one", installedVersion: "0.9.0", latestVersion: version("2.0.0") },
    version: version("1.0.0"),
    disabled: false
  });
  const api = (name, response) => () => ({
    execute: async (args) => {
      calls.push({ name, args });
      return { value: response };
    }
  });
  operationState.bulkMode.value = false;
  operationState.queuedChanges.value = [];
  const component = load("plugins/market/panel/src/components/PluginMarketOperations.vue", {
    vue,
    "./PluginMarketTargetsDialog.vue": {},
    "../targets": targetHelpers,
    "@/plugin/context": { ctx: { plugins: { refresh: async () => {} } } },
    "../version": load("plugins/market/panel/src/version.ts"),
    "../operations": operationState,
    "vuetify/components": {},
    "@/lang/i18n": { t: (key) => key },
    "@/tools/validator": { getValidatorErrorMsg: (err) => err.message },
    "@/tools/vuetifyToast": {
      message: {
        success: (msg) => successes.push(msg),
        warning: (msg) => warnings.push(msg),
        error: (msg) => errors.push(msg)
      }
    },
    "../api": {
      pluginMarketPackage: api("package", { sides: ["panel", "daemon"] }),
      pluginMarketTargets: api("targets", [
        { daemonId: "", ip: "", available: true, installed: true, installedVersion: "0.9.0", removable: true, updatable: true },
        { daemonId: "node-1", ip: "localhost", available: true, installed: true, installedVersion: "0.9.0", removable: true, updatable: true }
      ]),
      installMarketPlugin: api("install", {
        restartRequired: true,
        failedNodes: ["node-1"],
        installedVersion: "1.0.0"
      }),
      uninstallMarketPlugin: api("uninstall", {
        restartRequired: true,
        removed: true,
        failedNodes: []
      }),
      ...overrides
    }
  }).default;
  const scope = vue.effectScope();
  const state = scope.run(() =>
    component.setup(props, { expose() {}, emit: (...args) => events.push(args) })
  );
  return { props, state, calls, events, errors, successes, warnings, scope };
}

test("market updates require a greater version, including numeric and prerelease ordering", () => {
  const { isNewerVersion } = load("plugins/market/panel/src/version.ts");
  for (const [candidate, installed, expected] of [
    ["1.10.0", "1.9.0", true],
    ["2.0.0", "1.99.99", true],
    ["1.0.0", "1.0.0", false],
    ["1.9.0", "1.10.0", false],
    ["1.0.0", "1.0.0-rc.1", true],
    ["1.0.0-rc.1", "1.0.0", false],
    ["1.0.0-rc.10", "1.0.0-rc.2", true],
    ["1.0.0-beta", "1.0.0-alpha", true],
    ["1.0.0-alpha.1", "1.0.0-alpha", true],
    ["1.0.0-alpha", "1.0.0-alpha.1", false],
    ["1.0.0-beta", "1.0.0-10", true],
    ["1.0.0+build.2", "1.0.0+build.1", false],
    ["v1.2.0", "1.2", false],
    ["invalid", "1.0.0", false],
    ["1.0.0", "invalid", false]
  ])
    assert.equal(isNewerVersion(candidate, installed), expected, `${candidate} > ${installed}`);
});

test("direct install actions require newer releases unless management explicitly selects a version", async () => {
  const { props, state, calls, scope } = installFixture();
  try {
    assert.equal(state.canInstall.value, false);
    assert.equal(state.canUpdate.value, true);
    props.installOnly = true;
    assert.equal(state.canUpdate.value, false, "historical rows cannot update installed plugins");
    props.installOnly = false;
    for (const installed of ["1.0.0", "2.0.0"]) {
      props.plugin.installedVersion = installed;
      assert.equal(state.canInstall.value, false);
      assert.equal(state.canUpdate.value, false);
      await state.install();
    }
    assert.equal(calls.length, 0);
    props.plugin.installedVersion = undefined;
    assert.equal(state.canInstall.value, true);
    assert.equal(state.canUpdate.value, false);
  } finally {
    scope.stop();
  }
});

test("the management dialog permits older core versions while protecting source plugins", async () => {
  const { props, state, calls, scope } = installFixture();
  try {
    props.allowVersionChange = true;
    props.plugin.installedVersion = "2.0.0";
    assert.equal(
      state.canUpdate.value,
      true,
      "an explicitly selected older release may be installed"
    );
    props.plugin.installedRemovable = false;
    assert.equal(state.canUpdate.value, true, "uninstall protection still permits npm updates");
    props.plugin.installedUpdatable = false;
    assert.equal(state.canUpdate.value, false);
    await state.install();
    assert.equal(calls.length, 0, "source packages must never start npm work");
  } finally {
    scope.stop();
  }
});

test("bulk target confirmation stages the pinned version separately for the panel and nodes", async () => {
  const { state, calls, events, scope } = installFixture();
  try {
    operationState.bulkMode.value = true;
    await state.install();
    await state.confirmTargets();
    await new Promise(setImmediate);
    assert.equal(
      calls.some((call) => call.name === "install"),
      false
    );
    assert.equal(operationState.queuedChanges.value[0].version, "1.0.0");
    assert.deepEqual(operationState.queuedChanges.value.map((change) => [change.plugin.targetDaemonId, change.daemonIds]), [
      ["", []], ["node-1", ["node-1"]]
    ]);
    assert.ok(events.some(([event]) => event === "staged"));
    assert.equal(operationState.activeOperations.value, 0);
  } finally {
    operationState.bulkMode.value = false;
    operationState.queuedChanges.value = [];
    scope.stop();
  }
});

test("node confirmation installs the captured version and reports partial failure and restart", async () => {
  const { props, state, calls, events, errors, successes, warnings, scope } = installFixture();
  try {
    await state.install();
    assert.equal(calls[0].args.params.version, "1.0.0");
    assert.equal(calls.filter((call) => call.name === "install").length, 0);
    props.version = version("2.0.0");
    await state.confirmTargets();
    await new Promise(setImmediate);
    const install = calls.find((call) => call.name === "install");
    assert.equal(install.args.data.version, "1.0.0");
    assert.deepEqual(install.args.data.daemonIds, ["node-1"]);
    assert.ok(events.some((event) => event[0] === "installed" && event[2] === "1.0.0"));
    assert.deepEqual(errors, ["TXT_CODE_PLUGIN_MARKET_NODE_FAILED"]);
    assert.deepEqual(successes, []);
    assert.deepEqual(warnings, ["TXT_CODE_PLUGIN_MARKET_RESTART_REQUIRED"]);
  } finally {
    scope.stop();
  }
});

test("partial uninstall preserves the installed release and never reports complete success", async () => {
  const { state, events, errors, successes, warnings, scope } = installFixture({
    uninstallMarketPlugin: () => ({
      execute: async () => ({
        value: {
          restartRequired: true,
          removed: false,
          installedVersion: "1.0.0",
          failedNodes: ["node-1"]
        }
      })
    })
  });
  try {
    await state.requestUninstall({ id: "one", installedVersion: "1.0.0" });
    await state.confirmTargets();
    await new Promise(setImmediate);
    assert.ok(events.some((event) => event[0] === "installed" && event[2] === "1.0.0"));
    assert.deepEqual(errors, ["TXT_CODE_PLUGIN_MARKET_NODE_FAILED"]);
    assert.deepEqual(successes, []);
    assert.deepEqual(warnings, ["TXT_CODE_PLUGIN_MARKET_RESTART_REQUIRED"]);
  } finally {
    scope.stop();
  }
});

test("disabled installs do not start and disposing during preparation cannot start a late install", async () => {
  let resolve;
  const fixture = installFixture({
    pluginMarketPackage: () => ({
      execute: () =>
        new Promise((yes) => {
          resolve = yes;
        })
    })
  });
  fixture.props.disabled = true;
  await fixture.state.install();
  assert.equal(resolve, undefined);
  fixture.props.disabled = false;
  const work = fixture.state.install();
  assert.deepEqual(fixture.events, [["busy", true]], "the parent locks other actions immediately");
  fixture.scope.stop();
  resolve({ value: { sides: ["panel"] } });
  await work;
  assert.equal(
    fixture.calls.some((call) => call.name === "install"),
    false
  );
  assert.deepEqual(fixture.events, [
    ["busy", true],
    ["busy", false]
  ]);
});

test("cancelling the shared picker does not install, and uninstall reads live targets without the market", async () => {
  const { props, state, calls, scope } = installFixture();
  try {
    await state.install();
    state.targetsShown.value = false;
    assert.equal(calls.filter((call) => call.name === "install").length, 0);
    props.version = version("2.0.0");
    await state.requestUninstall({ ...props.plugin });
    assert.equal(
      calls.filter((call) => call.name === "package").length,
      1,
      "uninstall must not depend on a release still being available from the market"
    );
    assert.equal(calls.filter((call) => call.name === "targets").length, 2);
    await state.confirmTargets();
    await new Promise(setImmediate);
    assert.deepEqual(calls.find((call) => call.name === "uninstall").args.params, {
      pluginId: "one",
      daemonIds: "node-1",
      panel: true
    });
  } finally {
    scope.stop();
  }
});

// A small Vue host exercises component events and lifecycles without a browser
// server. Keeping real Vue components also covers the template's event wiring.
const renderer = vue.createRenderer({
  createElement: (tag) => ({ tag, children: [], style: {} }),
  createText: (text) => ({ text }),
  createComment: (text) => ({ text }),
  setText: (node, text) => {
    node.text = text;
  },
  setElementText: (node, text) => {
    node.text = text;
  },
  patchProp: (node, key, _previous, value) => {
    node[key] = value;
  },
  parentNode: (node) => node.parent,
  nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1],
  insert(node, parent, anchor) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
    const index = anchor ? parent.children.indexOf(anchor) : parent.children.length;
    parent.children.splice(index, 0, node);
    node.parent = parent;
  },
  remove(node) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
  }
});

function setupFixture(component, props) {
  let state;
  const events = [];
  const app = renderer.createApp({
    setup() {
      state = component.setup(props, { expose() {}, emit: (...args) => events.push(args) });
      return () => vue.h("div");
    }
  });
  app.mount({ children: [] });
  return { state, events, app };
}

const sharedViewOverrides = {
  vue,
  "vuetify/components": {},
  "@/components/Empty.vue": load("plugins/console/panel/src/components/Empty.vue", {
    vue,
    "@/lang/i18n": { t: (key) => key },
    "vuetify/components": { VIcon: "span" }
  }, true).default,
  "@/components/PageToolbar.vue": {},
  "@/lang/i18n": { t: (key) => key, getCurrentLang: () => "en_us" },
  "@/tools/validator": { getValidatorErrorMsg: (err) => err.message },
  "@/tools/nodes": load("plugins/console/panel/src/tools/nodes.ts", {
    "@/lang/i18n": { t: (key) => key }
  }),
  "@/tools/vuetifyToast": { message: { error() {} } },
  // Icon networking is independent of the catalogue/operation state tested here.
  "../hooks/usePluginIcons": { usePluginIcons: () => ({ icons: vue.ref({}), load() {} }) },
  // The list and the detail both show a plugin's sides through this chip.
  "./PluginMarketSideBadge.vue": {},
  "./PluginMarketInstall.vue": {},
  "./PluginMarketChanges.vue": {},
  "./PluginMarketUpdates.vue": {},
  "../operations": operationState
};

test("opening Add/Modify only loads management data, and version changes keep release requirements", async () => {
  const current = {
    ...version("2.0.0"),
    dependencies: { lib: "^2" },
    deprecated: "Use a newer release"
  };
  const older = { ...version("1.0.0"), dependencies: { lib: "^1" } };
  const component = load("plugins/market/panel/src/components/PluginMarketInstall.vue", {
    ...sharedViewOverrides,
    "@/plugin/context": { ctx: { get() {} } },
    "./PluginMarketOperations.vue": {},
    "../api": {
      pluginMarketDetail: () => ({
        execute: async () => ({
          value: {
            id: "one",
            name: "epanel-plugin-one",
            selectedVersion: current,
            versions: [current, older]
          }
        })
      }),
      pluginMarketInstalled: () => ({
        execute: async () => ({
          value: [
            {
              pluginId: "one",
              version: "2.0.0",
              panelVersion: "2.0.0",
              daemonIds: [],
              removable: true
            }
          ]
        })
      })
    }
  }).default;
  const props = vue.reactive({
    plugin: { id: "one", name: "epanel-plugin-one", installedVersion: "2.0.0" }
  });
  const { state, app } = setupFixture(component, props);
  try {
    assert.equal(state.actionText.value, "TXT_CODE_PLUGIN_MARKET_MODIFY");
    await state.open();
    assert.equal(state.shown.value, true);
    assert.equal(state.version.value.version, "2.0.0");
    state.selectedVersion.value = "1.0.0";
    assert.equal(state.version.value.dependencies.lib, "^1");
    assert.equal(state.majorWarning.value, true);
    assert.deepEqual(state.configTargets.value, [
      { title: "TXT_CODE_PLUGIN_MARKET_SIDE_PANEL", value: "panel" }
    ]);
    state.installedUpdated("one", undefined);
    props.plugin.installedVersion = undefined;
    assert.equal(state.actionText.value, "TXT_CODE_PLUGIN_MARKET_ADD");
  } finally {
    app.unmount();
  }
});

test("a delisted plugin keeps its local uninstall/configuration state when the market is offline", async () => {
  const component = load("plugins/market/panel/src/components/PluginMarketInstall.vue", {
    ...sharedViewOverrides,
    "@/plugin/context": { ctx: { get() {} } },
    "./PluginMarketOperations.vue": {},
    "../api": {
      pluginMarketDetail: () => ({
        execute: async () => {
          throw new Error("offline");
        }
      }),
      pluginMarketInstalled: () => ({
        execute: async () => ({
          value: [
            {
              pluginId: "one",
              version: "1.0.0",
              daemonIds: ["node-1"],
              daemonVersions: { "node-1": "1.0.0" },
              removable: true
            }
          ]
        })
      })
    }
  }).default;
  const { state, app } = setupFixture(
    component,
    vue.reactive({ plugin: { id: "one", installedVersion: "1.0.0" } })
  );
  try {
    await state.open();
    assert.equal(state.error.value, "offline");
    assert.equal(state.plugin.value.installedVersion, "1.0.0");
    assert.equal(state.configTargets.value[0].value, "node-1");
  } finally {
    app.unmount();
  }
});

test("the rendered action opens the dialog without card navigation and changes from Add to Modify after installation", async () => {
  const slots = vue.defineComponent({
    setup(_props, { slots }) {
      return () => vue.h("div", slots.default?.());
    }
  });
  const Button = vue.defineComponent({
    props: { color: String },
    emits: ["click"],
    setup(_props, { slots }) {
      return () => vue.h("button", slots.default?.());
    }
  });
  const Dialog = vue.defineComponent({
    props: { modelValue: Boolean },
    setup(props, { slots }) {
      return () => (props.modelValue ? vue.h("div", slots.default?.()) : null);
    }
  });
  const Operations = vue.defineComponent({
    props: { plugin: Object, version: Object },
    emits: ["installed", "busy"],
    render: () => vue.h("div")
  });
  const components = Object.fromEntries(
    [
      "VCard",
      "VCardActions",
      "VCardText",
      "VCheckbox",
      "VProgressLinear",
      "VSelect",
      "VSpacer",
      "VTable",
      "VAlert"
    ].map((name) => [name, slots])
  );
  const plugin = vue.reactive({
    id: "one",
    name: "one",
    displayName: "One",
    latestVersion: version("1.0.0")
  });
  const Install = load(
    "plugins/market/panel/src/components/PluginMarketInstall.vue",
    {
      ...sharedViewOverrides,
      "vuetify/components": { ...components, VBtn: Button, VDialog: Dialog },
      "@/plugin/context": { ctx: { get() {} } },
      "./PluginMarketSideBadge.vue": slots,
      "./PluginMarketOperations.vue": Operations,
      "../api": {
        pluginMarketDetail: () => ({
          execute: async () => ({
            value: {
              ...plugin,
              selectedVersion: plugin.latestVersion,
              versions: [plugin.latestVersion]
            }
          })
        }),
        pluginMarketInstalled: () => ({ execute: async () => ({ value: [] }) })
      }
    },
    true
  ).default;
  const app = renderer.createApp({
    setup: () => () =>
      vue.h(Install, { plugin, onInstalled: (_id, version) => (plugin.installedVersion = version) })
  });
  app.mount({ children: [] });
  function find(type, node = app._instance.subTree) {
    if (!node || typeof node !== "object") return [];
    const matches = node.type === type ? [node.component] : [];
    return [
      ...matches,
      ...(node.component
        ? find(type, node.component.subTree)
        : Array.isArray(node.children)
        ? node.children.flatMap((child) => find(type, child))
        : [])
    ];
  }
  try {
    let prevented = false,
      stopped = false;
    assert.equal(find(Button)[0].props.color, "primary");
    find(Button)[0].emit("click", {
      preventDefault: () => { prevented = true; },
      stopPropagation: () => { stopped = true; }
    });
    await new Promise(setImmediate);
    assert.equal(prevented && stopped, true);
    assert.equal(find(Dialog)[0].props.modelValue, true);
    find(Operations)[0].emit("installed", "one", "1.0.0");
    await vue.nextTick();
    assert.equal(find(Dialog)[0].props.modelValue, false);
    assert.equal(find(Button)[0].props.color, "success");
    assert.equal(find(Button)[0].subTree.children[0].children, "TXT_CODE_PLUGIN_MARKET_MODIFY");
  } finally {
    app.unmount();
  }
});

test("batch application keeps failed nodes and failed operations, then retries them independently", async () => {
  const calls = [];
  let fail = true;
  const api = (kind) => () => ({
    execute: async (args) => {
      calls.push({ kind, args });
      if (kind === "uninstall" && fail) throw new Error("offline");
      return {
        value: {
          installedVersion: kind === "install" ? "2.0.0" : undefined,
          failedNodes: fail ? ["node-2"] : [],
          restartRequired: false
        }
      };
    }
  });
  const operations = load("plugins/market/panel/src/operations.ts", {
    vue,
    "@/plugin/context": { ctx: { plugins: { refresh: async () => {} } } },
    "./api": { installMarketPlugin: api("install"), uninstallMarketPlugin: api("uninstall") }
  });
  operations.queueMarketChange({
    plugin: { id: "one", name: "one" },
    kind: "install",
    version: "2.0.0",
    daemonIds: ["node-1", "node-2"]
  });
  operations.queueMarketChange({
    plugin: { id: "two", name: "two" },
    kind: "uninstall",
    daemonIds: [],
    removeConfig: true
  });
  const results = await operations.applyMarketChanges();
  assert.equal(results.length, 2);
  assert.ok(results[1].error);
  assert.deepEqual(operations.queuedChanges.value[0].daemonIds, ["node-2"]);
  assert.equal(operations.queuedChanges.value.length, 2);
  fail = false;
  await operations.applyMarketChanges();
  assert.equal(operations.queuedChanges.value.length, 0);
  assert.deepEqual(calls[2].args.data.daemonIds, ["node-2"]);
  assert.equal(calls[3].args.params.removeConfig, true);
});

test("one-click updates keep per-target versions, isolate failures and never execute staged changes", async () => {
  const calls = [];
  let refreshes = 0;
  const operations = load("plugins/market/panel/src/operations.ts", {
    vue,
    "@/plugin/context": { ctx: { plugins: { refresh: async () => { refreshes++; } } } },
    "./api": {
      updateMarketBatch: () => ({ execute: async (request) => {
        calls.push(request.data);
        return { value: { results: request.data.updates.map((update) =>
          update.pluginId === "broken" ? { pluginId: update.pluginId, error: "offline" } : {
            pluginId: update.pluginId,
            result: { pluginId: update.pluginId, installedVersion: "2.0.0",
              failedTargets: [], updatedTargets: [], restartRequired: false }
          }) } };
      } })
    }
  });
  const updates = [
    { pluginId: "broken", displayName: "Broken", version: "2.0.0", targets: [{ label: "", currentVersion: "1.0.0" }] },
    { pluginId: "sample", displayName: "Sample", version: "2.0.0", targets: [{ label: "Node", daemonId: "node-1", currentVersion: "1.2.0" }] }
  ];
  operations.queueMarketChange({ plugin: { id: "staged" }, kind: "uninstall", daemonIds: [] });
  assert.deepEqual(await operations.updateMarketPlugins(updates), []);
  assert.deepEqual(calls, [], "an update cannot apply or overwrite staged operations");
  operations.discardMarketChange("staged");
  const work = operations.updateMarketPlugins(updates);
  assert.deepEqual(await operations.updateMarketPlugins(updates), [], "repeated clicks share the running batch");
  const results = await work;
  assert.equal(results.length, 2);
  assert.equal(results[0].error.message, "offline");
  assert.equal(results[1].result.pluginId, "sample");
  assert.deepEqual(calls, [{ updates: [
    { pluginId: "broken", version: "2.0.0", panel: true, daemonIds: [] },
    { pluginId: "sample", version: "2.0.0", panel: false, daemonIds: ["node-1"] }
  ] }], "all selected packages are sent to the backend in a single request");
  assert.equal(refreshes, 1);
  assert.equal(operations.updateProgress.value.completed, 2);
  assert.equal(operations.applyingChanges.value, false);
  assert.equal(operations.updatingPlugins.value, false);
});

test("mixed update batches submit plugins and both runtimes together", async () => {
  const calls = [];
  const api = () => ({ execute: async ({ data }) => {
    calls.push(data);
    return { value: { results: data.updates.map((update) => ({
      pluginId: update.pluginId,
      result: { pluginId: update.pluginId, updatedTargets: [], failedTargets: [], restartRequired: false }
    })) } };
  } });
  const operations = load("plugins/market/panel/src/operations.ts", {
    vue,
    "@/plugin/context": { ctx: { plugins: { refresh: async () => {} } } },
    "./api": { updateMarketBatch: api }
  });
  const target = { label: "", currentVersion: "1.0.0" };
  await operations.updateMarketPlugins([
    { pluginId: "@elementspanel/panel", runtime: "panel", version: "2.0.0", targets: [target] },
    { pluginId: "@elementspanel/daemon", runtime: "daemon", version: "3.0.0", targets: [{ ...target, daemonId: "node-1" }] },
    { pluginId: "sample", version: "4.0.0", targets: [target] }
  ]);
  assert.deepEqual(calls, [{ updates: [
    { pluginId: "sample", version: "4.0.0", panel: true, daemonIds: [] },
    { pluginId: "@elementspanel/daemon", runtime: "daemon", version: "3.0.0", panel: false, daemonIds: ["node-1"] },
    { pluginId: "@elementspanel/panel", runtime: "panel", version: "2.0.0", panel: true, daemonIds: [] }
  ] }]);
});

test("market target changes preserve the routed page, search and active tab while refreshing its content", async () => {
  const slots = vue.defineComponent({
    setup(_props, { slots }) {
      return () => vue.h("div", Object.values(slots).flatMap((slot) => slot?.({ props: {} })));
    }
  });
  const control = (props, emits) => vue.defineComponent({
    props, emits, setup(_props, { slots }) { return () => vue.h("div", slots.default?.()); }
  });
  const Tabs = control({ modelValue: String, disabled: Boolean }, ["update:modelValue"]);
  const Toolbar = vue.defineComponent({
    setup(_props, { slots }) {
      return () => vue.h("header", Object.values(slots).flatMap((slot) => slot?.()));
    }
  });
  const Button = control({ disabled: Boolean, loading: Boolean }, ["click"]);
  const Dialog = control({ modelValue: Boolean }, ["update:modelValue"]);
  const Search = control({ modelValue: String }, ["update:modelValue"]);
  const NodeItem = control({ title: String, disabled: Boolean, active: Boolean }, ["click"]);
  const components = Object.fromEntries([
    "VAlert", "VAvatar", "VCard", "VCardActions", "VCardText", "VChip", "VCol", "VContainer",
    "VCheckbox", "VDialog", "VIcon", "VImg", "VList", "VListItem", "VMenu", "VProgressCircular", "VProgressLinear", "VRow", "VSpacer", "VTab", "VTable"
  ].map((name) => [name, slots]));
  Object.assign(components, { VTabs: Tabs, VBtn: Button, VDialog: Dialog, VTextField: Search, VListItem: NodeItem });
  const calls = [];
  let reads = 0;
  const plans = [
    { pluginId: "sample", name: "epanel-plugin-sample", displayName: "Sample", version: "2.0.0", targets: [
      { label: "", currentVersion: "1.0.0" }, { label: "Node One", daemonId: "one", currentVersion: "1.2.0" }
    ] },
    { pluginId: "other", name: "epanel-plugin-other", displayName: "Other", version: "2.0.0", targets: [
      { label: "Node Two", daemonId: "two", currentVersion: "1.0.0" }
    ] }
  ];
  const operations = load("plugins/market/panel/src/operations.ts", {
    vue,
    "@/plugin/context": { ctx: { plugins: { refresh: async () => {} } } },
    "./api": { updateMarketBatch: () => ({ execute: async ({ data }) => {
      calls.push(...data.updates);
      return { value: { results: data.updates.map((update) => ({
        pluginId: update.pluginId,
        result: { pluginId: update.pluginId, installedVersion: update.version,
          failedTargets: [], updatedTargets: [], restartRequired: false }
      })) } };
    } }) }
  });
  const overrides = {
    ...sharedViewOverrides,
    "@/tools/vuetifyToast": { message: { error() {}, success() {}, warning() {} } },
    "vuetify/components": components,
    "@/components/PageToolbar.vue": Toolbar,
    "../operations": operations,
    "../targets": targetHelpers,
    "../api": {
      pluginMarketNodes: () => ({ execute: async () => ({ value: [
        { daemonId: "one", ip: "10.0.0.1", remarks: "Node One", available: true },
        { daemonId: "two", ip: "10.0.0.2", remarks: "Node Two", available: false }
      ] }) }),
      pluginMarketList: () => ({ execute: async () => ({ value: [] }) }),
      pluginMarketUpdates: () => ({ execute: async ({ params } = {}) => {
        reads++;
        return { value: { plugins: plans
          .map((plan) => ({ ...plan, targets: plan.targets.filter((target) =>
            (params?.daemonId === undefined || target.daemonId === (params.daemonId || undefined)) && !calls.some((call) =>
              call.pluginId === plan.pluginId && (target.daemonId ? call.daemonIds.includes(target.daemonId) : call.panel))) }))
          .filter((plan) => plan.targets.length), uncheckedNodes: [] } };
      } })
    }
  };
  const TargetDialog = load("plugins/market/panel/src/components/PluginMarketTargetsDialog.vue", overrides, true).default;
  const Updates = load("plugins/market/panel/src/components/PluginMarketUpdates.vue", {
    ...overrides, "./PluginMarketTargetsDialog.vue": TargetDialog
  }, true).default;
  const List = load("plugins/market/panel/src/components/PluginMarketList.vue", {
    ...overrides, "./PluginMarketUpdates.vue": Updates, "./PluginMarketChanges.vue": slots
  }, true).default;
  const vueRouter = frontendRequire("vue-router");
  const Page = load("plugins/market/panel/src/normal/PluginMarket.vue", {
    vue,
    "vue-router": vueRouter,
    "../components/PluginMarketList.vue": List
  }, true).default;
  const router = vueRouter.createRouter({
    history: vueRouter.createMemoryHistory(),
    routes: [{ path: "/market/plugins", component: Page }]
  });
  await router.push("/market/plugins");
  await router.isReady();
  const app = renderer.createApp({
    setup: () => () => vue.h(vueRouter.RouterView, null, {
      default: ({ Component, route }) => Component ? vue.h(Component, { key: route.fullPath }) : null
    })
  });
  app.use(router);
  app.mount({ children: [] });
  const find = (type, node = app._instance.subTree) => {
    if (!node || typeof node !== "object") return [];
    const found = node.type === type ? [node.component] : [];
    if (node.component) return [...found, ...find(type, node.component.subTree)];
    return Array.isArray(node.children) ? [...found, ...node.children.flatMap((child) => find(type, child))] : found;
  };
  const updateAllButton = () => find(Button).find((button) => button.vnode.props.class === "plugin-market-update-all");
  const updateNotice = () => find(Dialog).find((dialog) =>
    dialog.vnode.props["aria-label"] === "TXT_CODE_PLUGIN_MARKET_UPDATE_ALL"
  );
  const acceptUpdateNotice = async () => {
    assert.equal(updateNotice().props.modelValue, true);
    find(Button, updateNotice().subTree).find((button) => button.vnode.props.color === "primary").emit("click");
    await new Promise(setImmediate);
    assert.equal(updateNotice().props.modelValue, false);
  };
  try {
    await new Promise(setImmediate);
    assert.equal(reads, 0, "updates are only checked when their tab opens");
    assert.equal(updateAllButton(), undefined, "browse has no update-all action");
    const page = find(Page)[0];
    const list = find(List)[0];
    const search = find(Search)[0];
    const header = find(Toolbar)[0];
    const tabs = find(Tabs)[0];
    const navigation = tabs.subTree.el.parent;
    const container = navigation.parent;
    const toolbar = container.children.indexOf(find(Toolbar)[0].subTree.el);
    assert.ok(toolbar >= 0);
    assert.equal(container.children[toolbar + 1], navigation, "tabs and the node selector occupy the row directly below the header");
    tabs.emit("update:modelValue", "updates");
    await new Promise(setImmediate);
    assert.equal(reads, 1);
    find(Search)[0].emit("update:modelValue", "sample");
    await vue.nextTick();
    const view = find(Updates)[0];
    const buttons = find(Button, view.subTree);
    assert.equal(buttons.length, 5, "the update row, notice and target picker keep their actions");
    const updateAll = updateAllButton();
    const actions = updateAll.subTree.el.parent;
    const nodeSelector = find(Button).find((button) => button.vnode.props.class === "plugin-market-node-selector");
    assert.equal(actions.parent, navigation, "update all shares the navigation row with the node selector");
    assert.ok(actions.children.indexOf(updateAll.subTree.el) < actions.children.indexOf(nodeSelector.subTree.el.parent), "update all appears to the left of the node selector");
    assert.equal(updateAll.props.disabled, false);
    updateAll.emit("click");
    await new Promise(setImmediate);
    assert.equal(updateNotice().props.modelValue, true, "update-all first explains the restart and disconnection risks");
    assert.equal(find(TargetDialog)[0].props.modelValue, false, "target selection waits for acknowledgement");
    assert.equal(reads, 1, "opening the notice does not start checking update targets");
    assert.deepEqual(calls, []);
    assert.equal(operations.activeOperations.value, 1);
    find(Button, updateNotice().subTree).find((button) => button.vnode.props.color !== "primary").emit("click");
    await vue.nextTick();
    assert.equal(updateNotice().props.modelValue, false);
    assert.equal(operations.activeOperations.value, 0, "cancelling the notice releases the market controls");
    updateAllButton().emit("click");
    await vue.nextTick();
    await acceptUpdateNotice();
    assert.deepEqual(calls, [], "opening update-all never starts npm before target confirmation");
    let picker = find(TargetDialog)[0];
    assert.equal(picker.props.modelValue, true);
    assert.deepEqual(picker.props.targets.map((target) => target.daemonId), ["", "one", "two"]);
    assert.deepEqual(picker.props.selection, [""]);
    assert.equal(picker.props.targets[2].disabled, true);
    assert.equal(operations.activeOperations.value, 1);
    picker.emit("update:modelValue", false);
    await vue.nextTick();
    assert.equal(operations.activeOperations.value, 0, "cancelling releases the market controls");
    updateAllButton().emit("click");
    await new Promise(setImmediate);
    await acceptUpdateNotice();
    picker = find(TargetDialog)[0];
    picker.emit("update:selection", ["one"]);
    await vue.nextTick();
    picker.emit("confirm", ["one"]);
    await new Promise(setImmediate);
    assert.deepEqual(calls, [{ pluginId: "sample", version: "2.0.0", panel: false, daemonIds: ["one"] }], "the picker can update another host without changing the current page target");
    assert.equal(reads, 4, "each target dialog checks all hosts and completion refreshes the current host");
    assert.equal(updateAllButton().props.disabled, false);
    const nodes = find(NodeItem);
    assert.equal(nodes.length, 3, "the selector offers this panel and both daemon nodes");
    assert.equal(nodes[0].props.active, true);
    assert.equal(nodes[2].props.disabled, true, "offline nodes use the instance selector's disabled style");
    nodes[1].emit("click");
    await new Promise(setImmediate);
    assert.equal(reads, 5);
    assert.equal(router.currentRoute.value.fullPath, "/market/plugins", "target changes do not navigate");
    assert.equal(find(Page)[0], page, "the route view is not remounted");
    assert.equal(find(List)[0], list);
    assert.equal(find(Toolbar)[0], header);
    assert.equal(find(Search)[0], search);
    assert.equal(search.props.modelValue, "sample");
    assert.equal(find(Tabs)[0], tabs);
    assert.equal(tabs.props.modelValue, "updates");
    assert.equal(find(Updates)[0], view, "the current update view refreshes in place");
    assert.equal(view.props.daemonId, "one");
    assert.equal(find(NodeItem)[1].props.active, true);
    updateAllButton().emit("click");
    await new Promise(setImmediate);
    await acceptUpdateNotice();
    picker = find(TargetDialog)[0];
    assert.deepEqual(picker.props.selection, [], "an up-to-date current host is not preselected");
    assert.equal(picker.props.targets[1].disabled, true);
    picker.emit("confirm", ["", "one", "two"]);
    await new Promise(setImmediate);
    assert.deepEqual(calls[1], { pluginId: "sample", version: "2.0.0", panel: true, daemonIds: [] }, "confirmation ignores offline and up-to-date targets");
    find(NodeItem)[0].emit("click");
    await new Promise(setImmediate);
    assert.equal(find(Page)[0], page, "returning to the panel also preserves the page");
    assert.equal(find(Tabs)[0].props.modelValue, "updates");
    assert.equal(find(Search)[0].props.modelValue, "sample");
    assert.equal(find(Updates)[0], view);
    assert.equal(view.props.daemonId, "");
    updateAllButton().emit("click");
    await new Promise(setImmediate);
    assert.equal(updateNotice().props.modelValue, true);
    assert.equal(find(TargetDialog)[0].props.modelValue, false);
    assert.equal(operations.activeOperations.value, 1);
  } finally {
    app.unmount();
  }
  assert.equal(operations.activeOperations.value, 0, "unmounting dismisses the pending notice without retaining the lock");
  assert.equal(calls.length, 2);
});

test("desktop cards support keyboard selection and preserve search when installed badges change", async () => {
  const component = load("plugins/market/panel/src/components/PluginMarketList.vue", {
    ...sharedViewOverrides,
    "../api": {
      pluginMarketNodes: () => ({ execute: async () => ({ value: [] }) }),
      pluginMarketList: () => ({
        execute: async () => ({
          value: [
            { id: "one", displayName: "First plugin", summary: "A plugin" },
            { id: "two", displayName: "Second plugin", summary: "Another plugin" }
          ]
        })
      })
    }
  }).default;
  const props = vue.reactive({ embedded: true });
  const { state, events, app } = setupFixture(component, props);
  try {
    await vue.nextTick();
    state.keyword.value = "First";
    const first = state.visiblePlugins.value[0];
    let prevented = false;
    state.onCardKeydown(
      {
        key: "Enter",
        preventDefault: () => {
          prevented = true;
        }
      },
      first
    );
    assert.equal(prevented, true);
    assert.deepEqual(events, [["select", "one"]]);
    state.updateInstalled("one", "1.0.0");
    assert.equal(state.visiblePlugins.value[0].installedVersion, "1.0.0");
    state.updateInstalled("one", undefined);
    assert.equal(state.visiblePlugins.value[0].installedVersion, undefined);
    assert.equal(state.keyword.value, "First");
    props.embedded = false;
    state.selectPlugin(first);
    assert.equal(events.length, 1, "normal cards keep their native route link");
  } finally {
    app.unmount();
  }
});

test("switching market nodes clears old installation state and ignores late responses", async () => {
  const requests = [];
  const component = load("plugins/market/panel/src/components/PluginMarketList.vue", {
    ...sharedViewOverrides,
    "../api": {
      pluginMarketNodes: () => ({ execute: async () => ({ value: [
        { daemonId: "one", ip: "10.0.0.1", remarks: "One", available: true },
        { daemonId: "two", ip: "10.0.0.2", remarks: "Two", available: true }
      ] }) }),
      pluginMarketList: () => ({ execute: (config) => new Promise((resolve) => requests.push({ config, resolve })) })
    }
  }).default;
  const { state, events, app } = setupFixture(component, vue.reactive({ embedded: true }));
  try {
    assert.equal(requests[0].config.params.daemonId, "");
    requests[0].resolve({ value: [{ id: "sample", installedVersion: "1.0.0" }] });
    await new Promise(setImmediate);
    state.keyword.value = "sample";
    state.selectedDaemonId.value = "one";
    await vue.nextTick();
    assert.deepEqual(state.plugins.value, []);
    assert.equal(requests[1].config.params.daemonId, "one");
    state.selectedDaemonId.value = "two";
    await vue.nextTick();
    requests[2].resolve({ value: [{ id: "sample", installedVersion: "3.0.0" }] });
    await new Promise(setImmediate);
    requests[1].resolve({ value: [{ id: "sample", installedVersion: "2.0.0" }] });
    await new Promise(setImmediate);
    assert.equal(state.plugins.value[0].installedVersion, "3.0.0");
    assert.equal(state.plugins.value[0].targetDaemonId, "two");
    assert.equal(state.keyword.value, "sample");
    assert.deepEqual(events, [["target-change", "one"], ["target-change", "two"]]);
    operationState.notifyInstalled("sample", "4.0.0", "one");
    await vue.nextTick();
    assert.equal(requests.length, 3, "another node's operation cannot change the current badge");
  } finally {
    app.unmount();
  }
});

test("scoped installs and uninstalls share the picker with the current target selected by default", async () => {
  for (const daemonId of ["", "node-1"]) {
    const f = installFixture();
    try {
      f.props.plugin.targetDaemonId = daemonId;
      await f.state.install();
      assert.equal(f.calls.some((call) => call.name === "install"), false);
      assert.equal(f.state.targetsShown.value, true);
      assert.deepEqual(f.state.targets.value.map((target) => target.daemonId), ["", "node-1"]);
      assert.deepEqual(f.state.selection.value, [daemonId]);
      await f.state.confirmTargets();
      assert.deepEqual(f.calls.find((call) => call.name === "install").args.data, {
        pluginId: "one", name: "one", version: "1.0.0",
        panel: !daemonId, daemonIds: daemonId ? [daemonId] : []
      });
      assert.equal(f.state.targetsShown.value, false);
      await f.state.requestUninstall({ ...f.props.plugin });
      assert.equal(f.calls.some((call) => call.name === "uninstall"), false);
      assert.equal(f.state.targetsShown.value, true);
      assert.equal(f.state.mode.value, "uninstall");
      assert.deepEqual(f.state.selection.value, [daemonId]);
      await f.state.confirmTargets();
      assert.deepEqual(f.calls.find((call) => call.name === "uninstall").args.params, {
        pluginId: "one", panel: !daemonId, daemonIds: daemonId
      });
      assert.equal(operationState.installedChange.value.daemonId, daemonId);
    } finally {
      f.scope.stop();
    }
  }
});

test("target confirmation honors cross-host choices and keeps unsupported or protected hosts visible", async () => {
  const f = installFixture({
    pluginMarketPackage: () => ({ execute: async () => ({ value: { sides: ["daemon"] } }) }),
    pluginMarketTargets: () => ({ execute: async () => ({ value: [
      { daemonId: "", available: true, installed: true, installedVersion: "0.9.0", removable: true, updatable: true },
      { daemonId: "node-1", available: true, installed: false, removable: true, updatable: true },
      { daemonId: "source", available: true, installed: true, removable: false, updatable: false },
      { daemonId: "offline", available: false, installed: true, removable: true, updatable: true }
    ] }) }),
    installMarketPlugin: () => ({ execute: async ({ data }) => {
      f.calls.push({ name: "install", data });
      return { value: { installedVersion: data.version, failedNodes: [], restartRequired: false } };
    } })
  });
  try {
    f.props.plugin.targetDaemonId = "";
    await f.state.install();
    assert.deepEqual(f.state.targets.value.map((target) => [target.daemonId, target.disabled]), [
      ["", true], ["node-1", false], ["source", true], ["offline", true]
    ]);
    assert.deepEqual(f.state.selection.value, []);
    await f.state.confirmTargets([]);
    assert.equal(f.state.targetsShown.value, true, "empty selection cannot confirm");
    await f.state.confirmTargets(["", "node-1", "source", "offline", "unknown"]);
    assert.deepEqual(f.calls.find((call) => call.name === "install").data, {
      pluginId: "one", name: "one", version: "1.0.0", panel: false, daemonIds: ["node-1"]
    });
    assert.equal(f.events.some(([event]) => event === "installed"), false, "another host's installation cannot change the originating panel badge");
    await f.state.requestUninstall();
    assert.deepEqual(f.state.targets.value.map((target) => [target.daemonId, target.disabled]), [
      ["", false], ["node-1", true], ["source", true], ["offline", true]
    ]);
    f.state.removeConfig.value = true;
    await f.state.confirmTargets([""]);
    assert.deepEqual(f.calls.find((call) => call.name === "uninstall").args.params, {
      pluginId: "one", panel: true, daemonIds: "", removeConfig: true
    });
  } finally {
    f.scope.stop();
  }
});

test("bulk changes keep separate operations for the same plugin on different nodes", async () => {
  const calls = [];
  const operations = load("plugins/market/panel/src/operations.ts", {
    vue,
    "@/plugin/context": { ctx: { plugins: { refresh: async () => {} } } },
    "./api": { installMarketPlugin: () => ({ execute: async ({ data }) => {
      calls.push(data);
      return { value: { failedNodes: [], installedVersion: data.version, restartRequired: false } };
    } }) }
  });
  for (const targetDaemonId of ["", "one", "two"]) {
    operations.queueMarketChange({ plugin: { id: "sample", name: "sample", targetDaemonId },
      kind: "install", version: "2.0.0", daemonIds: targetDaemonId ? [targetDaemonId] : [] });
  }
  assert.equal(operations.queuedChanges.value.length, 3);
  operations.discardMarketChange("sample", "one");
  await operations.applyMarketChanges();
  assert.deepEqual(calls, [
    { pluginId: "sample", name: "sample", version: "2.0.0", panel: true, daemonIds: [] },
    { pluginId: "sample", name: "sample", version: "2.0.0", panel: false, daemonIds: ["two"] }
  ]);
  assert.deepEqual(operations.queuedChanges.value, []);
});

test("an empty catalogue reads as empty, and only a failed refresh as unreachable", async () => {
  let fail = true;
  const component = load("plugins/market/panel/src/components/PluginMarketList.vue", {
    ...sharedViewOverrides,
    "../api": {
      pluginMarketNodes: () => ({ execute: async () => ({ value: [] }) }),
      pluginMarketList: () => ({
        execute: async () => {
          if (fail) throw new Error("offline");
          return { value: [] };
        }
      })
    }
  }).default;
  const { state, app } = setupFixture(component, vue.reactive({ embedded: true }));
  try {
    await new Promise(setImmediate);
    assert.equal(state.failed.value, true);
    fail = false;
    await state.refresh();
    assert.equal(state.failed.value, false);
    assert.deepEqual(state.plugins.value, []);
  } finally {
    app.unmount();
  }
});

test("market lists ignore older refreshes and responses after unmount", async () => {
  const requests = [];
  const component = load("plugins/market/panel/src/components/PluginMarketList.vue", {
    ...sharedViewOverrides,
    "../api": {
      pluginMarketNodes: () => ({ execute: async () => ({ value: [] }) }),
      pluginMarketList: () => ({
        execute: () => new Promise((resolve) => requests.push(resolve))
      })
    }
  }).default;
  const { state, app } = setupFixture(component, vue.reactive({ embedded: true }));
  const current = state.refresh();
  requests[1]({ value: [{ id: "current" }] });
  await current;
  requests[0]({ value: [{ id: "old" }] });
  await vue.nextTick();
  assert.equal(state.plugins.value[0].id, "current");
  const late = state.refresh();
  app.unmount();
  requests[2]({ value: [{ id: "late" }] });
  await late;
  assert.equal(state.plugins.value[0].id, "current");
});

test("desktop browsing keeps the list mounted and wires detail installation and back events", async () => {
  const installed = [];
  // Typed props, like the real components: a bare `embedded` attribute only
  // becomes `true` when the prop is declared Boolean.
  const List = vue.defineComponent({
    props: { embedded: Boolean, daemonId: String },
    emits: ["select", "target-change"],
    setup(_props, { expose }) {
      expose({ updateInstalled: (...args) => installed.push(args) });
      return () => vue.h("div");
    }
  });
  const Detail = vue.defineComponent({
    props: { pluginId: String, embedded: Boolean, daemonId: String },
    emits: ["back", "installed"],
    render: () => vue.h("div")
  });
  const Desktop = load(
    "plugins/market/panel/src/desktop/DesktopPluginMarket.vue",
    {
      vue,
      "../components/PluginMarketList.vue": List,
      "../components/PluginMarketDetail.vue": Detail
    },
    true
  ).default;
  const app = renderer.createApp(Desktop);
  app.mount({ children: [] });
  const findChild = (type) =>
    app._instance.subTree.children.find((node) => node.type === type)?.component;
  try {
    const list = findChild(List);
    assert.equal(list.props.embedded, true);
    list.emit("target-change", "node-2");
    list.emit("select", "one");
    await vue.nextTick();
    const detail = findChild(Detail);
    assert.equal(detail.props.pluginId, "one");
    assert.equal(detail.props.embedded, true);
    assert.equal(detail.props.daemonId, "node-2");
    detail.emit("installed", "one", "1.0.0");
    assert.deepEqual(installed, [["one", "1.0.0"]]);
    detail.emit("back");
    await vue.nextTick();
    assert.equal(findChild(Detail), undefined);
    assert.equal(findChild(List), list, "search and scroll state survive returning to the list");
    assert.equal(list.props.daemonId, "node-2", "returning to the list preserves the selected node");
    list.emit("select", "two");
    await vue.nextTick();
    assert.equal(findChild(Detail).props.pluginId, "two");
  } finally {
    app.unmount();
  }
});

test("shared detail follows its plugin and node, ignores stale answers and refreshes after an operation settles", async () => {
  const requests = [];
  const component = load("plugins/market/panel/src/components/PluginMarketDetail.vue", {
    ...sharedViewOverrides,
    "@/tools/safe": { markdownToHTML: (text) => text },
    "./PluginMarketInstall.vue": {},
    "../api": {
      pluginMarketDetail: () => ({
        execute: (args) => new Promise((resolve) => requests.push({ args, resolve }))
      })
    }
  }).default;
  // Version selection is gone: the page always asks for the plugin itself, and
  // each release has its own install button instead of the header's selection.
  assert.equal("version" in component.props, false, "no version prop");
  assert.equal(component.emits.includes("select-version"), false, "no version selection event");

  const props = vue.reactive({ pluginId: "one", embedded: true, daemonId: "node-1" });
  const { state, app } = setupFixture(component, props);
  try {
    assert.equal(requests[0].args.params.pluginId, "one");
    assert.equal(requests[0].args.params.version, undefined);
    assert.equal(requests[0].args.params.daemonId, "node-1");

    props.pluginId = "two";
    await vue.nextTick();
    assert.equal(requests[1].args.params.pluginId, "two");
    requests[1].resolve({ value: { id: "two", selectedVersion: version("2.0.0") } });
    await vue.nextTick();
    // The previous plugin's answer lands after the new one and must not win.
    requests[0].resolve({ value: { id: "one", selectedVersion: version("1.0.0") } });
    await vue.nextTick();
    assert.equal(state.plugin.value.id, "two");

    props.daemonId = "node-2";
    await vue.nextTick();
    assert.equal(state.plugin.value, undefined);
    assert.equal(requests[2].args.params.daemonId, "node-2");
    requests[2].resolve({ value: { id: "two", installedVersion: "4.0.0", selectedVersion: version("4.0.0") } });
    await vue.nextTick();
    operationState.notifyInstalled("two", "9.0.0", "node-1");
    await vue.nextTick();
    assert.equal(requests.length, 3, "another node's install does not replace this node's version");
    state.trackBusy(true);
    operationState.notifyInstalled("two", "5.0.0", "node-2");
    await vue.nextTick();
    assert.equal(requests.length, 3, "refresh waits for the active operation to settle");
    state.trackBusy(false);
    await vue.nextTick();
    assert.equal(requests[3].args.params.daemonId, "node-2");
    requests[3].resolve({ value: { id: "two", installedVersion: "5.0.0", selectedVersion: version("5.0.0") } });
    await vue.nextTick();
    assert.equal(state.plugin.value.installedVersion, "5.0.0");

    props.pluginId = "three";
    await vue.nextTick();
    app.unmount();
    requests[4].resolve({ value: { id: "three", selectedVersion: version("3.0.0") } });
    await vue.nextTick();
    assert.equal(state.plugin.value, undefined);
  } finally {
    if (app._instance) app.unmount();
  }
});

test("detail locks every release action and its tabs while a plugin operation is active", async () => {
  const slots = vue.defineComponent({
    setup(_props, { slots }) {
      return () =>
        vue.h(
          "div",
          Object.values(slots).flatMap((slot) => slot?.())
        );
    }
  });
  const Tabs = vue.defineComponent({
    props: { modelValue: String, disabled: Boolean },
    emits: ["update:modelValue"],
    setup(_props, { slots }) {
      return () => vue.h("div", slots.default?.());
    }
  });
  const Install = vue.defineComponent({
    props: { plugin: Object, version: Object, disabled: Boolean, installOnly: Boolean },
    emits: ["busy", "installed"],
    render: () => vue.h("div")
  });
  const components = Object.fromEntries(
    [
      "VAlert",
      "VBtn",
      "VChip",
      "VContainer",
      "VIcon",
      "VProgressCircular",
      "VTab",
      "VAvatar",
      "VImg"
    ].map((name) => [name, slots])
  );
  const Detail = load(
    "plugins/market/panel/src/components/PluginMarketDetail.vue",
    {
      ...sharedViewOverrides,
      "@/components/PageToolbar.vue": slots,
      "@/tools/safe": { markdownToHTML: (text) => text },
      "vuetify/components": { ...components, VTabs: Tabs },
      "./PluginMarketInstall.vue": Install,
      "./PluginMarketChanges.vue": slots,
      "./PluginMarketSideBadge.vue": slots,
      "../api": {
        pluginMarketDetail: () => ({
          execute: async () => ({
            value: {
              id: "one",
              latestVersion: version("3.0.0"),
              selectedVersion: version("2.0.0"),
              versions: [version("2.0.0"), version("1.0.0")]
            }
          })
        })
      }
    },
    true
  ).default;
  const app = renderer.createApp(Detail, { pluginId: "one" });
  app.mount({ children: [] });
  function findComponents(type, node = app._instance.subTree) {
    if (!node || typeof node !== "object") return [];
    const found = node.type === type ? [node.component] : [];
    if (node.component) return [...found, ...findComponents(type, node.component.subTree)];
    if (Array.isArray(node.children))
      return [...found, ...node.children.flatMap((child) => findComponents(type, child))];
    return found;
  }
  try {
    await new Promise((resolve) => setImmediate(resolve));
    await vue.nextTick();
    const tabs = findComponents(Tabs)[0];
    tabs.emit("update:modelValue", "versions");
    await vue.nextTick();
    const installs = findComponents(Install);
    assert.equal(installs.length, 3);
    assert.equal(
      installs[0].props.version.version,
      "3.0.0",
      "header actions target the latest release"
    );
    installs[1].emit("busy", true);
    await vue.nextTick();
    assert.equal(
      tabs.props.disabled,
      true,
      "switching tabs must not unmount a running release row"
    );
    assert.equal(
      installs.every((item) => item.props.disabled),
      true
    );
    installs[1].emit("busy", false);
    await vue.nextTick();
    assert.equal(tabs.props.disabled, false);
    assert.equal(
      installs.some((item) => item.props.disabled),
      false
    );
    installs[0].emit("installed", "one", "3.0.0");
    await vue.nextTick();
    assert.equal(
      findComponents(Install).length,
      1,
      "installed plugins have no historical install buttons"
    );
    assert.equal(installs[0].props.plugin.installedVersion, "3.0.0");
    installs[0].emit("installed", "one", undefined);
    await vue.nextTick();
    assert.equal(
      findComponents(Install).length,
      3,
      "uninstall restores release installation choices"
    );
  } finally {
    app.unmount();
  }
});
