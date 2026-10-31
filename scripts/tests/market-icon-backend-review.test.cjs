const { from, createLoader } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const panelRequire = from("panel");
const panelLoad = createLoader({ compiler: panelRequire("typescript") });
const daemonLoad = createLoader({ compiler: from("daemon")("typescript") });

async function panelFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-market-icon-npm-"));
  const previous = process.cwd();
  fs.mkdirSync(path.join(directory, "panel"));
  process.chdir(path.join(directory, "panel"));
  t.after(() => {
    process.chdir(previous);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const routes = new Map();
  const networkCalls = [];
  const common = {
    listNpmPlugins: () => [],
    installNpmPlugin: async () => ({}),
    uninstallNpmPlugin: async () => null
  };
  const service = panelLoad("plugins/market/panel/src/backend/service/plugin_market.ts", {
    axios: { get: async (...args) => networkCalls.push(args) },
    "mcsmanager-common": common
  });
  const plugin = panelLoad("plugins/market/panel/src/backend/index.ts", {
    axios: { get: async (...args) => networkCalls.push(args) },
    "mcsmanager-common": common,
    "../i18n": { localeMessages: {} },
    "./service/plugin_market": service,
    "./service/market_settings": {
      initMarketSettings: async () => {},
      marketSettings: () => ({ pluginMarketAddr: "https://market.example" }),
      saveMarketSettings: async () => {}
    }
  });
  const pass = () => async (_ctx, next) => next();
  await plugin.apply({
    i18n: { define() {}, $t: (key) => key },
    logger: { warn() {} },
    roles: { USER: 1, ADMIN: 10 },
    middleware: { validator: () => pass(), permission: pass, speedLimit: pass },
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
    remote: { services: { services: new Map(), getInstance: () => undefined }, Request: class {} }
  });
  return { routes, networkCalls };
}

function daemonFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-market-daemon-npm-"));
  const previous = process.cwd();
  process.chdir(directory);
  t.after(() => {
    process.chdir(previous);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const handlers = new Map();
  const replies = [];
  const installs = [];
  const uninstalls = [];
  const overrides = [];
  const validId = /^[a-z][a-z0-9_-]{1,63}$/;
  const common = {
    writePluginOverride: (id, patch) => overrides.push({ id, patch }),
    installNpmPlugin: async (options) => {
      if (!options.name) throw new Error("Invalid npm plugin package.");
      installs.push(options);
      return { pluginId: options.pluginId, version: options.version, sides: ["daemon"] };
    },
    uninstallNpmPlugin: async (pluginId) => {
      if (!validId.test(pluginId)) throw new Error(`Invalid plugin id: ${pluginId}`);
      uninstalls.push(pluginId);
      return { pluginId };
    }
  };
  const plugin = daemonLoad("plugins/config/daemon/src/backend/index.ts", {
    "mcsmanager-common": common,
    "../i18n": { localeMessages: {} },
    "./settings": { SettingsFormService: class {} }
  });
  plugin.apply({
    i18n: { define() {}, $t: (key) => key },
    plugin() {},
    plugins: {
      runExclusive: (operation) => operation(),
      install: (options) => common.installNpmPlugin({ ...options, side: "daemon" }),
      remove: (id) => common.uninstallNpmPlugin(id)
    },
    get: () => ({}),
    protocol: {
      on: (event, handler) => handlers.set(event, handler),
      response: (_ctx, data) => replies.push({ data }),
      responseError: (_ctx, error) => replies.push({ error })
    }
  });
  return { directory, handlers, replies, installs, uninstalls, overrides };
}

test("the panel icon endpoint answers the default icon without calling the market", async (t) => {
  const fixture = await panelFixture(t);
  const ctx = { query: {} };
  await panelRequire("koa-compose")(fixture.routes.get("get /plugin/icon"))(ctx);
  assert.deepEqual(ctx.body, { dataUrl: null });
  assert.deepEqual(fixture.networkCalls, []);
});

test("the daemon installs a plugin through npm on its own installation", async (t) => {
  const fixture = daemonFixture(t);
  await fixture.handlers.get("plugin/npm/install")(
    {},
    {
      name: "epanel-plugin-sample",
      pluginId: "sample",
      version: "2.0.0"
    }
  );
  assert.equal(fixture.replies.pop().error, undefined);
  assert.equal(fixture.installs.length, 1);
  const { reloadAfter, ...install } = fixture.installs[0];
  assert.ok(reloadAfter instanceof Promise);
  assert.deepEqual(install, {
    name: "epanel-plugin-sample",
    pluginId: "sample",
    version: "2.0.0",
    side: "daemon"
  });
  await reloadAfter;

  fixture.installs.length = 0;
  await fixture.handlers.get("plugin/npm/install")({}, { name: "", pluginId: "", version: "" });
  assert.match(fixture.replies.pop().error.message, /Invalid npm plugin package/);
  assert.equal(fixture.installs.length, 0);
});

test("the daemon removes a plugin npm dependency by plugin id", async (t) => {
  const fixture = daemonFixture(t);
  await fixture.handlers.get("plugin/npm/uninstall")({}, { pluginId: "sample" });
  assert.deepEqual(fixture.replies.pop().data, { removed: true, pluginId: "sample" });
  assert.deepEqual(fixture.uninstalls, ["sample"]);
  assert.deepEqual(fixture.overrides, []);

  await fixture.handlers.get("plugin/npm/uninstall")(
    {},
    { pluginId: "sample", removeConfig: true }
  );
  assert.equal(fixture.replies.pop().error, undefined);
  assert.deepEqual(fixture.overrides, [{ id: "sample", patch: { config: {} } }]);

  await fixture.handlers.get("plugin/npm/uninstall")({}, { pluginId: "" });
  assert.match(fixture.replies.pop().error.message, /Invalid plugin id/);
});
