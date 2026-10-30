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
    "./plugin_icon": {
      MAX_PLUGIN_ICON_BYTES: 1024 * 1024,
      encodePluginIcon: () => "data:image/png;base64,review"
    },
    "../i18n": { localeMessages: {} },
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
    const ctx = { query, role, request: {} };
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
      pluginMarketInstalled: api("installed", [
        {
          pluginId: "one",
          name: "one",
          version: "1.0.0",
          sides: ["panel", "daemon"],
          daemonIds: ["node-1"]
        }
      ]),
      pluginMarketNodes: api("nodes", [{ daemonId: "node-1", ip: "localhost", available: true }]),
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

test("the management dialog explicitly permits selecting an older version but protects bundled plugins", async () => {
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
    assert.equal(state.canUpdate.value, false);
    await state.install();
    assert.equal(calls.length, 0, "protected source/core packages must never start npm work");
  } finally {
    scope.stop();
  }
});

test("bulk node confirmation stages the pinned version and nodes without starting npm", async () => {
  const { state, calls, events, scope } = installFixture();
  try {
    operationState.bulkMode.value = true;
    await state.install();
    state.confirmNodes();
    await new Promise(setImmediate);
    assert.equal(
      calls.some((call) => call.name === "install"),
      false
    );
    assert.equal(operationState.queuedChanges.value[0].version, "1.0.0");
    assert.deepEqual(operationState.queuedChanges.value[0].daemonIds, ["node-1"]);
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
    state.confirmNodes();
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
    state.confirmNodes();
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

test("cancelling the node picker does not install, and uninstall uses persisted node records", async () => {
  const { props, state, calls, scope } = installFixture();
  try {
    await state.install();
    state.nodeShown.value = false;
    assert.equal(calls.filter((call) => call.name === "install").length, 0);
    props.version = version("2.0.0");
    await state.requestUninstall({ ...props.plugin });
    assert.equal(
      calls.filter((call) => call.name === "package").length,
      1,
      "uninstall must not depend on a release still being available from the market"
    );
    assert.equal(calls.filter((call) => call.name === "installed").length, 1);
    state.confirmNodes();
    await new Promise(setImmediate);
    assert.deepEqual(calls.find((call) => call.name === "uninstall").args.params, {
      pluginId: "one",
      daemonIds: "node-1"
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
  "@/components/PageToolbar.vue": {},
  "@/lang/i18n": { t: (key) => key, getCurrentLang: () => "en_us" },
  "@/tools/validator": { getValidatorErrorMsg: (err) => err.message },
  "@/tools/vuetifyToast": { message: { error() {} } },
  // Icon networking is independent of the catalogue/operation state tested here.
  "../hooks/usePluginIcons": { usePluginIcons: () => ({ icons: vue.ref({}), load() {} }) },
  // The list and the detail both show a plugin's sides through this chip.
  "./PluginMarketSideBadge.vue": {},
  "./PluginMarketInstall.vue": {},
  "./PluginMarketChanges.vue": {},
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

test("desktop cards support keyboard selection and preserve search when installed badges change", async () => {
  const component = load("plugins/market/panel/src/components/PluginMarketList.vue", {
    ...sharedViewOverrides,
    "../api": {
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

test("an empty catalogue reads as empty, and only a failed refresh as unreachable", async () => {
  let fail = true;
  const component = load("plugins/market/panel/src/components/PluginMarketList.vue", {
    ...sharedViewOverrides,
    "../api": {
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
    props: { embedded: Boolean },
    emits: ["select"],
    setup(_props, { expose }) {
      expose({ updateInstalled: (...args) => installed.push(args) });
      return () => vue.h("div");
    }
  });
  const Detail = vue.defineComponent({
    props: { pluginId: String, embedded: Boolean },
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
    list.emit("select", "one");
    await vue.nextTick();
    const detail = findChild(Detail);
    assert.equal(detail.props.pluginId, "one");
    assert.equal(detail.props.embedded, true);
    detail.emit("installed", "one", "1.0.0");
    assert.deepEqual(installed, [["one", "1.0.0"]]);
    detail.emit("back");
    await vue.nextTick();
    assert.equal(findChild(Detail), undefined);
    assert.equal(findChild(List), list, "search and scroll state survive returning to the list");
    list.emit("select", "two");
    await vue.nextTick();
    assert.equal(findChild(Detail).props.pluginId, "two");
  } finally {
    app.unmount();
  }
});

test("shared detail follows the plugin only, and ignores an answer that arrived late", async () => {
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

  const props = vue.reactive({ pluginId: "one", embedded: true });
  const { state, app } = setupFixture(component, props);
  try {
    assert.equal(requests[0].args.params.pluginId, "one");
    assert.equal(requests[0].args.params.version, undefined);

    props.pluginId = "two";
    await vue.nextTick();
    assert.equal(requests[1].args.params.pluginId, "two");
    requests[1].resolve({ value: { id: "two", selectedVersion: version("2.0.0") } });
    await vue.nextTick();
    // The previous plugin's answer lands after the new one and must not win.
    requests[0].resolve({ value: { id: "one", selectedVersion: version("1.0.0") } });
    await vue.nextTick();
    assert.equal(state.plugin.value.id, "two");

    props.pluginId = "three";
    await vue.nextTick();
    app.unmount();
    requests[2].resolve({ value: { id: "three", selectedVersion: version("3.0.0") } });
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
      "VProgressLinear",
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
