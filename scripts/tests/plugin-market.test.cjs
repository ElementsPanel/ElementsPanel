const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const panelRequire = Module.createRequire(path.join(root, "panel/package.json"));
const frontendRequire = Module.createRequire(path.join(root, "frontend/package.json"));
const ts = panelRequire("typescript");
const vue = frontendRequire("vue");

// Load source in memory: no project build, network listener or plugin installation.
function load(relative, overrides = {}, inlineTemplate = false) {
  const filename = path.join(root, relative);
  let source = fs.readFileSync(filename, "utf8");
  if (filename.endsWith(".vue")) {
    const { parse, compileScript } = frontendRequire("@vue/compiler-sfc");
    source = compileScript(parse(source).descriptor, {
      id: "market-test",
      inlineTemplate
    }).content;
  }
  const mod = new Module(filename, module);
  mod.filename = filename;
  const localRequire = Module.createRequire(filename);
  mod.require = (id) => (Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id));
  mod._compile(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      },
      fileName: filename.endsWith(".vue") ? `${filename}.ts` : filename
    }).outputText,
    filename
  );
  return mod.exports;
}

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

async function backendFixture() {
  const routes = new Map();
  const calls = [];
  const detail = {
    id: "plugin/one",
    name: "one",
    latestVersion: version("2.0.0"),
    versions: [version("2.0.0"), version("1.0.0")]
  };
  const axios = {
    get: async (...args) => {
      calls.push(args);
      return { data: detail };
    },
    isAxiosError: () => false
  };
  const pass = () => async (_ctx, next) => next();
  const plugin = load("panel/plugins/market/src/backend/index.ts", {
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
    roles: { USER: 1, ADMIN: 10 },
    middleware: {
      validator: load("panel/plugins/runtime/src/backend/middleware/validator.ts").default,
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
  async function request(query, role = 10) {
    const ctx = { query, role, request: {} };
    await panelRequire("koa-compose")(routes.get("get /plugin/detail"))(ctx);
    return ctx;
  }
  return { request, calls, detail };
}

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
    plugin: { id: "one", name: "one", installedVersion: "1.0.0", latestVersion: version("2.0.0") },
    version: version("1.0.0"),
    disabled: false
  });
  const api = (name, response) => () => ({
    execute: async (args) => {
      calls.push({ name, args });
      return { value: response };
    }
  });
  const component = load("panel/plugins/market/src/components/PluginMarketInstall.vue", {
    vue,
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

test("node confirmation installs the captured version and reports partial failure and restart", async () => {
  const { props, state, calls, events, errors, successes, warnings, scope } = installFixture();
  try {
    await state.install();
    assert.equal(calls[0].args.params.version, "1.0.0");
    assert.equal(calls.filter((call) => call.name === "install").length, 0);
    props.version = version("2.0.0");
    state.confirmNodes();
    await vue.nextTick();
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
    await vue.nextTick();
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
    await vue.nextTick();
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
  "./PluginMarketSideBadge.vue": {}
};

test("desktop cards support keyboard selection and preserve search when installed badges change", async () => {
  const component = load("panel/plugins/market/src/components/PluginMarketList.vue", {
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

test("market lists ignore older refreshes and responses after unmount", async () => {
  const requests = [];
  const component = load("panel/plugins/market/src/components/PluginMarketList.vue", {
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
    "panel/plugins/market/src/desktop/DesktopPluginMarket.vue",
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
  const component = load("panel/plugins/market/src/components/PluginMarketDetail.vue", {
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
    ["VAlert", "VBtn", "VChip", "VContainer", "VIcon", "VProgressLinear", "VTab"].map((name) => [
      name,
      slots
    ])
  );
  const Detail = load(
    "panel/plugins/market/src/components/PluginMarketDetail.vue",
    {
      ...sharedViewOverrides,
      "@/components/PageToolbar.vue": slots,
      "@/tools/safe": { markdownToHTML: (text) => text },
      "vuetify/components": { ...components, VTabs: Tabs },
      "./PluginMarketInstall.vue": Install,
      "./PluginMarketSideBadge.vue": slots,
      "../api": {
        pluginMarketDetail: () => ({
          execute: async () => ({
            value: {
              id: "one",
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
  } finally {
    app.unmount();
  }
});

test("a plugin's sides pick the badge wording, and no badge when the market is silent", () => {
  const { sideBadgeKey } = load("panel/plugins/market/src/sides.ts");
  assert.equal(sideBadgeKey(["panel"]), "TXT_CODE_PLUGIN_MARKET_SIDE_PANEL");
  assert.equal(sideBadgeKey(["daemon"]), "TXT_CODE_PLUGIN_MARKET_SIDE_DAEMON");
  assert.equal(sideBadgeKey(["panel", "daemon"]), "TXT_CODE_PLUGIN_MARKET_SIDE_BOTH");
  // An empty list and a missing field both mean the market said nothing.
  assert.equal(sideBadgeKey([]), undefined);
  assert.equal(sideBadgeKey(undefined), undefined);
});
