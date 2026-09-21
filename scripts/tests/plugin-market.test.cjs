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
  assert.equal(
    (await request({ pluginId: "plugin/one", version: "missing" })).body,
    "TXT_CODE_PLUGIN_MARKET_NOT_FOUND"
  );
  detail.versions[1].status = "pending";
  assert.equal(
    (await request({ pluginId: "plugin/one", version: "1.0.0" })).body,
    "TXT_CODE_PLUGIN_MARKET_NOT_FOUND"
  );
});

function installFixture() {
  const calls = [];
  const events = [];
  const errors = [];
  const props = vue.reactive({
    plugin: { id: "one", name: "one", installedVersion: "1.0.0", latestVersion: version("2.0.0") },
    version: version("1.0.0")
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
    "@/tools/vuetifyToast": { message: { success() {}, error: (msg) => errors.push(msg) } },
    "../api": {
      pluginMarketPackage: api("package", { sides: ["panel", "daemon"] }),
      pluginMarketNodes: api("nodes", [{ daemonId: "node-1", ip: "localhost", available: true }]),
      installMarketPlugin: api("install", { restartRequired: true, failedNodes: ["node-1"] }),
      uninstallMarketPlugin: api("uninstall", { restartRequired: true, removed: true })
    }
  }).default;
  const scope = vue.effectScope();
  const state = scope.run(() =>
    component.setup(props, { expose() {}, emit: (...args) => events.push(args) })
  );
  return { props, state, calls, events, errors, scope };
}

test("node confirmation installs the captured version and reports partial failure", async () => {
  const { props, state, calls, events, errors, scope } = installFixture();
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
  } finally {
    scope.stop();
  }
});

test("cancelling the node picker does not install, and uninstall uses the installed release", async () => {
  const { props, state, calls, scope } = installFixture();
  try {
    await state.install();
    state.nodeShown.value = false;
    assert.equal(calls.filter((call) => call.name === "install").length, 0);
    props.version = version("2.0.0");
    await state.requestUninstall({ ...props.plugin });
    assert.equal(
      calls.filter((call) => call.name === "package").at(-1).args.params.version,
      "1.0.0"
    );
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
  "@/tools/vuetifyToast": { message: { error() {} } }
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

test("desktop browsing keeps the list mounted and wires detail version, installation and back events", async () => {
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
    props: { pluginId: String, version: String, embedded: Boolean },
    emits: ["back", "select-version", "installed"],
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
    detail.emit("select-version", "1.0.0");
    await vue.nextTick();
    assert.equal(detail.props.version, "1.0.0");
    detail.emit("installed", "one", "1.0.0");
    assert.deepEqual(installed, [["one", "1.0.0"]]);
    detail.emit("back");
    await vue.nextTick();
    assert.equal(findChild(Detail), undefined);
    assert.equal(findChild(List), list, "search and scroll state survive returning to the list");
    list.emit("select", "two");
    await vue.nextTick();
    assert.equal(findChild(Detail).props.pluginId, "two");
    assert.equal(
      findChild(Detail).props.version,
      undefined,
      "another plugin starts at its latest release"
    );
  } finally {
    app.unmount();
  }
});

test("shared detail ignores stale requests when a desktop version changes and stops updating after close", async () => {
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
  const props = vue.reactive({ pluginId: "one", version: undefined, embedded: true });
  const { state, events, app } = setupFixture(component, props);
  try {
    assert.equal(requests[0].args.params.pluginId, "one");
    state.selectVersion("1.0.0");
    assert.deepEqual(events, [["select-version", "1.0.0"]]);
    props.version = "1.0.0";
    await vue.nextTick();
    assert.equal(requests[1].args.params.version, "1.0.0");
    requests[1].resolve({ value: { id: "one", selectedVersion: version("1.0.0") } });
    await vue.nextTick();
    requests[0].resolve({ value: { id: "one", selectedVersion: version("2.0.0") } });
    await vue.nextTick();
    assert.equal(state.plugin.value.selectedVersion.version, "1.0.0");
    state.busy.value = true;
    state.selectVersion("2.0.0");
    assert.equal(events.length, 1, "installation prevents selecting another release");
    state.busy.value = false;
    props.pluginId = "two";
    await vue.nextTick();
    app.unmount();
    requests[2].resolve({ value: { id: "two", selectedVersion: version("1.0.0") } });
    await vue.nextTick();
    assert.equal(state.plugin.value, undefined);
  } finally {
    if (app._instance) app.unmount();
  }
});
