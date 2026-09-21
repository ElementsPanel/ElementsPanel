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
function load(relative, overrides = {}) {
  const filename = path.join(root, relative);
  let source = fs.readFileSync(filename, "utf8");
  if (filename.endsWith(".vue")) {
    const { parse, compileScript } = frontendRequire("@vue/compiler-sfc");
    source = compileScript(parse(source).descriptor, { id: "market-install-test" }).content;
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
