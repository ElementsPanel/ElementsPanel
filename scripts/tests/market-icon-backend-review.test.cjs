const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const panelRequire = Module.createRequire(path.join(root, "panel/package.json"));
const daemonRequire = Module.createRequire(path.join(root, "daemon/package.json"));
const panelTs = panelRequire("typescript");
const daemonTs = daemonRequire("typescript");

function load(filename, overrides = {}, ts = panelTs, requireBase = panelRequire) {
  const absolute = path.isAbsolute(filename) ? filename : path.join(root, filename);
  const mod = new Module(absolute, module);
  const localRequire = Module.createRequire(absolute);
  mod.require = (id) =>
    Object.hasOwn(overrides, id)
      ? overrides[id]
      : id.startsWith(".") && fs.existsSync(path.resolve(path.dirname(absolute), id) + ".ts")
      ? load(path.resolve(path.dirname(absolute), id) + ".ts", {}, ts, requireBase)
      : localRequire(id);
  mod._compile(
    ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      },
      fileName: absolute
    }).outputText,
    absolute
  );
  return mod.exports;
}

const png = (length = 8) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(Math.max(0, length - 8), 7)
  ]);

function iconFixture(t, body = png()) {
  const routes = new Map();
  const axiosCalls = [];
  const permissionLevels = [];
  const axios = {
    async get(url, options) {
      axiosCalls.push({ url, options });
      return { data: body };
    }
  };
  const icon = load("panel/plugins/market/src/backend/plugin_icon.ts");
  const common = load(
    "common/src/plugin_package.ts",
    {
      "./plugin_manifest": load("common/src/plugin_manifest.ts", {}, panelTs, panelRequire)
    },
    panelTs,
    panelRequire
  );
  const service = load("panel/plugins/market/src/backend/service/plugin_market.ts", {
    "mcsmanager-common": common
  });
  const plugin = load("panel/plugins/market/src/backend/index.ts", {
    axios,
    "../i18n": { localeMessages: {} },
    "./plugin_icon": icon,
    "./service/plugin_market": service,
    "./service/market_service": {
      clearMarketCache: async () => {},
      getAppMarketList: async () => ({ packages: [] })
    },
    "./service/market_settings": {
      initMarketSettings: async () => {},
      marketSettings: () => ({ pluginMarketAddr: "https://market.example" }),
      saveMarketSettings: async () => {}
    }
  });
  const pass = (parameter) => {
    permissionLevels.push(parameter?.level);
    return async (_ctx, next) => next();
  };
  const ctx = {
    i18n: { define() {}, $t: (key) => key },
    logger: { warn() {} },
    roles: { USER: 1, ADMIN: 10 },
    middleware: {
      validator: () => async (_ctx, next) => next(),
      permission: pass,
      speedLimit: pass
    },
    koa: {
      router: () =>
        Object.fromEntries(
          ["get", "post", "put", "delete"].map((method) => [
            method,
            (url, ...handlers) => routes.set(`${method} ${url}`, handlers)
          ])
        )
    },
    settingsForm: { declare() {} },
    plugins: { reload: async () => {} },
    remote: { services: { services: new Map(), getInstance: () => undefined }, Request: class {} },
    identity: { of: () => ({ elevated: true, role: 10 }) }
  };
  return (async () => {
    await plugin.apply(ctx);
    t.after(() => {});
    return { routes, axiosCalls, permissionLevels };
  })();
}

async function invoke(handlers, query) {
  const ctx = { query, request: { query }, status: 200 };
  const compose = panelRequire("koa-compose");
  await compose(handlers)(ctx);
  return ctx;
}

test("icon proxy requires admin permission, forwards version and encodes only valid PNG bytes", async (t) => {
  const fixture = await iconFixture(t, png(32));
  const handlers = fixture.routes.get("get /plugin/icon");
  assert.ok(handlers);
  assert.ok(fixture.permissionLevels.includes(10));
  const ctx = await invoke(handlers, { pluginId: "plugin/name", version: "2.4.1" });
  assert.equal(ctx.body.dataUrl, `data:image/png;base64,${png(32).toString("base64")}`);
  assert.deepEqual(fixture.axiosCalls, [
    {
      url: "https://market.example/api/plugins/plugin%2Fname/icon",
      options: {
        params: { version: "2.4.1" },
        responseType: "arraybuffer",
        timeout: 15000,
        maxContentLength: 1024 * 1024,
        maxBodyLength: 1024 * 1024
      }
    }
  ]);
});

test("icon proxy falls back to the default icon for HTML, truncated and oversized responses", async (t) => {
  for (const body of [
    Buffer.from("<html>not an image</html>"),
    Buffer.from([0x89, 0x50, 0x4e]),
    png(1024 * 1024 + 1)
  ]) {
    const fixture = await iconFixture(t, body);
    const ctx = await invoke(fixture.routes.get("get /plugin/icon"), { pluginId: "sample" });
    assert.deepEqual(ctx.body, { dataUrl: null });
    assert.equal(fixture.axiosCalls[0].options.maxContentLength, 1024 * 1024);
    assert.equal(fixture.axiosCalls[0].options.maxBodyLength, 1024 * 1024);
  }
});

function daemonFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-market-icon-daemon-"));
  const previous = process.cwd();
  process.chdir(directory);
  t.after(() => {
    process.chdir(previous);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const handlers = new Map();
  const replies = [];
  const common = load(
    "common/src/plugin_package.ts",
    {
      "./plugin_manifest": load("common/src/plugin_manifest.ts", {}, daemonTs, daemonRequire)
    },
    daemonTs,
    daemonRequire
  );
  const plugin = load(
    "daemon/plugins/config/src/backend/index.ts",
    {
      "mcsmanager-common": common,
      "../i18n": { localeMessages: {} },
      "./settings": { SettingsFormService: class {} }
    },
    daemonTs,
    daemonRequire
  );
  plugin.apply({
    i18n: { define() {}, $t: (key) => key },
    plugin() {},
    get: () => ({}),
    protocol: {
      on: (event, handler) => handlers.set(event, handler),
      response: (_ctx, data) => replies.push({ data }),
      responseError: (_ctx, error) => replies.push({ error })
    }
  });
  return { directory, handlers, replies };
}

const installPayload = (icon, extra = []) => ({
  name: "sample",
  pluginId: "sample-id",
  version: "1.0.0",
  files: [
    {
      path: "plugin.json",
      content: Buffer.from('{"id":"sample","version":"1.0.0"}').toString("base64")
    },
    { path: "icon.png", content: icon.toString("base64") },
    ...extra
  ]
});

test("daemon accepts only a root PNG icon and validates the whole transfer before writing", async (t) => {
  const fixture = daemonFixture(t);
  await fixture.handlers.get("plugin/install")({}, installPayload(png(32)));
  const success = fixture.replies.pop();
  assert.equal(success.error, undefined);
  const installed = path.join(fixture.directory, "data", "plugins", "sample");
  assert.equal(fs.readFileSync(path.join(installed, "icon.png")).length, 32);

  for (const [icon, extra, pattern] of [
    [Buffer.from("not png"), [], /Invalid plugin icon/],
    [png(1024 * 1024 + 1), [], /too large/],
    [png(32), [{ path: "assets/icon.png", content: png(32).toString("base64") }], /unacceptable/],
    [png(32), [{ path: "unsafe.exe", content: "" }], /unacceptable/]
  ]) {
    fs.rmSync(installed, { recursive: true, force: true });
    await fixture.handlers.get("plugin/install")({}, installPayload(icon, extra));
    const failure = fixture.replies.pop();
    assert.match(failure.error.message, pattern);
    assert.equal(
      fs.existsSync(installed),
      false,
      "invalid package must not leave a partial directory"
    );
  }
});
