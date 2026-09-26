const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const frontendRequire = Module.createRequire(path.join(root, "frontend/package.json"));
const panelRequire = Module.createRequire(path.join(root, "panel/package.json"));
const ts = frontendRequire("typescript");

function load(relative, overrides = {}) {
  const filename = path.join(root, relative);
  const localRequire = Module.createRequire(filename);
  const mod = new Module(filename, module);
  mod.require = (id) => {
    if (Object.hasOwn(overrides, id)) return overrides[id];
    if (id.startsWith(".")) {
      const base = path.resolve(path.dirname(filename), id);
      for (const candidate of [base + ".ts", path.join(base, "index.ts")]) {
        if (fs.existsSync(candidate)) return load(path.relative(root, candidate), overrides);
      }
    }
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

test("browser metadata redacts backend config and preserves explicit graph metadata", () => {
  const { createFrontendPluginMetadata } = load("common/src/plugin_manifest.ts");
  const metadata = createFrontendPluginMetadata({
    id: "example",
    config: { password: "backend-secret" },
    frontendConfig: { theme: "dark" },
    frontendInject: ["runtime", "runtime", " console "],
    frontendImmediate: true,
    frontendRequired: true
  });
  assert.deepEqual(metadata.config, { theme: "dark" });
  assert.deepEqual(metadata.frontendInject, ["runtime", "console"]);
  assert.equal(metadata.frontendImmediate, true);
  assert.equal(metadata.frontendRequired, true);
  assert.equal(JSON.stringify(metadata).includes("backend-secret"), false);
});

test("frontend plugin graph is stable, detects missing dependencies and cycles", () => {
  const { resolvePluginDependencyOrder } = load("common/src/plugin_contract.ts");
  const resolve = (items) =>
    resolvePluginDependencyOrder(items, {
      id: (item) => item.id,
      dependencies: (item) => item.inject,
      compare: (a, b) => a.priority - b.priority || a.id.localeCompare(b.id)
    });

  const graph = resolve([
    { id: "console", priority: -10, inject: ["runtime", "i18n"] },
    { id: "independent", priority: -5, inject: [] },
    { id: "i18n", priority: -20, inject: ["runtime"] },
    { id: "runtime", priority: 0, inject: [] }
  ]);
  assert.deepEqual(graph.ordered.map((item) => item.id), [
    "independent",
    "runtime",
    "i18n",
    "console"
  ]);
  assert.equal(graph.issues.size, 0);

  const invalid = resolve([
    { id: "missing", priority: 0, inject: ["absent"] },
    { id: "blocked", priority: 0, inject: ["missing"] },
    { id: "cycle-a", priority: 0, inject: ["cycle-b"] },
    { id: "cycle-b", priority: 0, inject: ["cycle-a"] }
  ]);
  assert.equal(invalid.issues.get("missing").type, "missing-dependency");
  assert.equal(invalid.issues.get("blocked").type, "dependency-unavailable");
  assert.equal(invalid.issues.get("cycle-a").type, "dependency-cycle");
  assert.equal(invalid.issues.get("cycle-b").type, "dependency-cycle");
  assert.deepEqual(invalid.ordered, []);
});

test("typed slots order entries, reject duplicate ids, honor conditions and dispose by scope", async (t) => {
  const { Context } = frontendRequire("cordis");
  const { SlotsService } = load("panel/plugins/console/src/plugin/slots.ts", {
    cordis: frontendRequire("cordis"),
    vue: frontendRequire("vue")
  });
  const ctx = new Context();
  t.after(() => ctx.stop());
  ctx.plugin(SlotsService);

  const first = ctx.plugin({
    name: "first",
    inject: ["slots"],
    apply(scope) {
      scope.slots.register("shell.header.actions", { name: "later" }, {
        id: "later",
        order: 20
      });
      scope.slots.register("shell.header.actions", { name: "mobile" }, {
        id: "mobile",
        order: 10,
        condition: ({ mobile }) => mobile
      });
    }
  });
  const second = ctx.plugin({
    name: "second",
    inject: ["slots"],
    apply(scope) {
      scope.slots.register("shell.header.actions", { name: "first" }, {
        id: "first",
        order: 0
      });
    }
  });

  assert.deepEqual(
    ctx.slots.entries("shell.header.actions", { mobile: false }).map((item) => item.id),
    ["first", "later"]
  );
  assert.deepEqual(
    ctx.slots.entries("shell.header.actions", { mobile: true }).map((item) => item.id),
    ["first", "mobile", "later"]
  );
  assert.deepEqual(
    ctx.slots.entries("shell.header.actions", { mobile: true }).map((item) => item.owner),
    ["second", "first", "first"]
  );

  assert.throws(
    () =>
      ctx.slots.register("shell.header.actions", { name: "duplicate" }, { id: "first" }),
    /Duplicate slot registration/
  );
  second.dispose();
  assert.deepEqual(
    ctx.slots.entries("shell.header.actions", { mobile: false }).map((item) => item.id),
    ["later"]
  );
  first.dispose();
  assert.deepEqual(ctx.slots.entries("shell.header.actions", { mobile: true }), []);
});

test("API client sends bearer authentication without adding a query token", async () => {
  let requestInterceptor;
  let captured;
  const axios = async (config) => {
    const values = new Map();
    config.headers = {
      set: (name, value) => values.set(name, value),
      delete: (name) => values.delete(name),
      get: (name) => values.get(name)
    };
    requestInterceptor(config);
    captured = { config, values };
    return { data: { data: "ok", status: 200, time: Date.now() } };
  };
  axios.defaults = { headers: { common: {} } };
  axios.interceptors = { request: { use: (callback) => (requestInterceptor = callback) } };
  const { apiService, setAuthToken } = load(
    "panel/plugins/console/src/services/apiService.ts",
    {
      axios: { __esModule: true, default: axios },
      lodash: { __esModule: true, default: { cloneDeep: (value) => value } },
      "@/tools/validator": { reportErrorMsg() {} }
    }
  );

  setAuthToken("session-token");
  assert.equal(await apiService.subscribe({ url: "/api/test", forceRequest: true }), "ok");
  assert.equal(captured.values.get("Authorization"), "Bearer session-token");
  assert.equal(captured.config.params?.token, undefined);
});

test("permission middleware accepts bearer tokens and retains legacy query compatibility", async () => {
  const permission = load("panel/plugins/user/src/backend/middleware/permission.ts", {
    "../runtime": {
      $t: (value) => value,
      globalVariable: () => ({ get: () => 0, set() {} })
    },
    "../service/passport_service": {
      checkSafeName: () => true,
      getApiKey: () => "",
      getUuidByApiKey: () => undefined,
      ILLEGAL_ACCESS_KEY: "illegal",
      isAjax: () => true,
      logout() {}
    },
    "../service/user_service": {
      __esModule: true,
      default: { getInstance: () => ({ permission: 10 }) }
    }
  }).default;
  const middleware = permission({ level: 1, speedLimit: false });
  const request = async ({ authorization = "", query = {}, token = "expected" }) => {
    let passed = false;
    const ctx = {
      get: (name) => (name.toLowerCase() === "authorization" ? authorization : ""),
      query,
      request: { header: {} },
      session: { token, login: true, uuid: "user", userName: "User" }
    };
    await middleware(ctx, async () => {
      passed = true;
    });
    return { passed, status: ctx.status };
  };

  assert.deepEqual(await request({ authorization: "Bearer expected" }), {
    passed: true,
    status: undefined
  });
  assert.deepEqual(await request({ query: { token: "expected" } }), {
    passed: true,
    status: undefined
  });
  assert.equal((await request({ authorization: "Bearer wrong" })).status, 403);
});

test("startup diagnostics render with textContent and reloads use source revisions", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const loader = fs.readFileSync(path.join(root, "frontend/src/plugin/loader.ts"), "utf8");
  assert.match(html, /window\.setAppLoadingPlugins/);
  assert.match(html, /state\.textContent/);
  assert.match(html, /list\.style\.display = plugins\.length \? "flex" : "none"/);
  assert.doesNotMatch(html, /loadingPlugins[^\n]*innerHTML/);
  assert.match(loader, /if \(import\.meta\.env\.DEV\).*updatePlugins/);
  assert.match(loader, /source\.revision \|\| String\(source\.metadata\.version/);
  assert.doesNotMatch(loader, /panel_plugin_reload[^\n]*Date\.now/);
});
