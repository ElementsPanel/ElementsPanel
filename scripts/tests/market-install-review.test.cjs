const { from, createLoader, deferred } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const panelRequire = from("panel");
const ts = panelRequire("typescript");
const serviceFile = "plugins/market/panel/src/backend/service/plugin_market.ts";

const load = createLoader({ compiler: ts });

async function fixture(t, { sides = ["panel"], version = "1.0.0" } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-market-npm-review-"));
  const previous = process.cwd();
  const panelDirectory = path.join(directory, "panel");
  fs.mkdirSync(panelDirectory);
  process.chdir(panelDirectory);
  t.after(() => {
    process.chdir(previous);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const routes = new Map();
  const rpcCalls = [];
  const networkCalls = [];
  const installs = [];
  const uninstalls = [];
  const local = new Map();
  const nodes = new Map(
    ["node-1", "node-2", "node-3"].map((daemonId) => [
      daemonId,
      {
        daemonId,
        available: true,
        config: { ip: daemonId, port: 24444, remarks: daemonId },
        reconnects: 0,
        refreshReconnect() {
          this.reconnects++;
        }
      }
    ])
  );
  const state = {
    sides,
    version,
    request: async () => ({ removed: true }),
    panelReloads: 0,
    protected: false,
    inventoryExtra: [],
    compatibility: undefined
  };

  const common = {
    validatePluginCompatibility: (value) => {
      if (value && (value.api !== 1 || (value.sdk !== undefined && value.sdk !== 1)))
        throw new Error("Unsupported API/SDK");
    },
    writePluginOverride(id, patch) {
      state.lastOverride = { id, patch };
    },
    isEssentialNpmPlugin: (id) =>
      ["i18n", "storage", "runtime", "server", "console", "config"].includes(id),
    async installNpmPlugin(options) {
      installs.push(options);
      local.set(options.pluginId, {
        pluginId: options.pluginId,
        name: options.name,
        version: options.version,
        sides,
        directory: path.join(panelDirectory, "node_modules", options.name, "panel"),
        packageRoot: path.join(panelDirectory, "node_modules", options.name),
        source: "project"
      });
      return local.get(options.pluginId);
    },
    async uninstallNpmPlugin(pluginId) {
      uninstalls.push(pluginId);
      const record = local.get(pluginId) ?? null;
      local.delete(pluginId);
      return record;
    },
    listNpmPlugins() {
      return [...local.values()];
    }
  };

  const axios = {
    isAxiosError: () => false,
    async get(url, options) {
      networkCalls.push({ url, options });
      if (url.endsWith("/api/plugins")) {
        return {
          data: {
            items: [{
              id: "sample", name: "epanel-plugin-sample", sides: state.sides,
              latestVersion: { version: state.version, status: "approved", sides: state.sides, compatibility: state.compatibility }
            }],
            total: 1
          }
        };
      }
      const detail = {
        id: "sample",
        name: "epanel-plugin-sample",
        description: "Sample",
        sides: state.sides,
        selectedVersion: {
          compatibility: state.compatibility,
          id: `epanel-plugin-sample@${state.version}`,
          version: state.version,
          status: "approved",
          sides: state.sides
        },
        versions: [
          {
            compatibility: state.compatibility,
            id: `epanel-plugin-sample@${state.version}`,
            version: state.version,
            status: "approved",
            sides: state.sides
          }
        ]
      };
      return { data: detail };
    }
  };

  const service = load(serviceFile, { axios, "mcsmanager-common": common });
  const plugin = load("plugins/market/panel/src/backend/index.ts", {
    axios,
    "mcsmanager-common": common,
    "../i18n": { localeMessages: {} },
    "../version": load("plugins/market/panel/src/version.ts"),
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
    plugins: {
      runExclusive: (operation) => operation(),
      inventory: () =>
        [...local.values()]
          .map((record) => ({
            id: record.pluginId,
            packageName: record.name,
            version: record.version,
            removable: !state.protected,
            state: "active"
          }))
          .concat(state.inventoryExtra),
      install: (options) => common.installNpmPlugin({ ...options, side: "panel" }),
      remove: (id) => {
        if (state.protected) throw new service.PluginMarketError("BUNDLED");
        return common.uninstallNpmPlugin(id);
      },
      reload: async () => {
        state.panelReloads++;
      }
    },
    remote: {
      services: { services: nodes, getInstance: (id) => nodes.get(id) },
      Request: class {
        constructor(node) {
          this.node = node;
        }
        async request(event, payload) {
          const call = { daemonId: this.node.daemonId, event, payload };
          rpcCalls.push(call);
          return state.request(call);
        }
      }
    }
  });

  async function request(method, url, values = {}) {
    const query = method === "post" ? {} : values;
    const ctx = { query, request: { query, body: method === "post" ? values : undefined } };
    await panelRequire("koa-compose")(routes.get(`${method} ${url}`))(ctx);
    return ctx.body;
  }

  return {
    directory,
    panelDirectory,
    state,
    service,
    common,
    nodes,
    rpcCalls,
    networkCalls,
    installs,
    uninstalls,
    local,
    install: (values = {}) =>
      request("post", "/plugin/install", {
        pluginId: "sample",
        name: "spoofed-name",
        daemonIds: [],
        ...values
      }),
    uninstall: (daemonIds = "", pluginId = "sample", removeConfig = false) =>
      request("delete", "/plugin/uninstall", {
        pluginId,
        daemonIds,
        removeConfig: String(removeConfig)
      }),
    installed: () => request("get", "/plugin/installed"),
    updates: () => request("get", "/plugin/updates"),
    update: (values = {}) => request("post", "/plugin/update", {
      pluginId: "sample", version: state.version, panel: true, daemonIds: [], ...values
    }),
    list: () => request("get", "/plugin/list"),
    detail: () => request("get", "/plugin/detail", { pluginId: "sample" }),
    icon: () => request("get", "/plugin/icon")
  };
}

test("market updates compare live versions on each side and leave unchecked nodes visible", async (t) => {
  const env = await fixture(t, { sides: ["panel", "daemon"], version: "2.0.0" });
  await env.common.installNpmPlugin({ name: "epanel-plugin-sample", pluginId: "sample", version: "3.0.0" });
  env.nodes.get("node-3").available = false;
  env.state.request = async ({ event, daemonId }) => event === "plugin/list"
    ? [{ id: "sample", packageName: "epanel-plugin-sample", version: daemonId === "node-1" ? "1.0.0" : "2.0.0" }]
    : {};
  const updates = await env.updates();
  assert.equal(updates.plugins.length, 1);
  assert.equal(updates.plugins[0].version, "2.0.0");
  assert.deepEqual(updates.plugins[0].targets, [{ daemonId: "node-1", label: "node-1", currentVersion: "1.0.0" }]);
  assert.deepEqual(updates.uncheckedNodes, [{ daemonId: "node-3", label: "node-3" }]);
  env.state.compatibility = { panel: { api: 2 } };
  assert.deepEqual((await env.updates()).plugins, [], "incompatible releases are never offered");
  env.state.compatibility = undefined;
  env.state.inventoryExtra = [{ id: "source", version: "1.0.0" }];
  env.local.clear();
  env.state.request = async () => [{ id: "sample", version: "1.0.0" }];
  assert.deepEqual((await env.updates()).plugins, [], "source installations cannot be updated through npm");
});

test("a market update never downgrades or installs missing halves and rechecks node inventory", async (t) => {
  const env = await fixture(t, { sides: ["panel", "daemon"], version: "2.0.0" });
  await env.common.installNpmPlugin({ name: "epanel-plugin-sample", pluginId: "sample", version: "3.0.0" });
  env.installs.length = 0;
  env.state.request = async ({ event, daemonId }) => event === "plugin/list"
    ? daemonId === "node-1" ? [{ id: "sample", packageName: "epanel-plugin-sample", version: "1.0.0" }]
      : daemonId === "node-2" ? [] : [{ id: "sample", packageName: "epanel-plugin-sample", version: "2.1.0" }]
    : {};
  const result = await env.update({ daemonIds: ["node-1", "node-2", "node-3"] });
  assert.deepEqual(result.updatedTargets, [{ daemonId: "node-1", label: "node-1", currentVersion: "1.0.0" }]);
  assert.deepEqual(result.failedTargets, []);
  assert.deepEqual(env.installs, [], "the newer panel version is preserved");
  assert.deepEqual(env.rpcCalls.filter((call) => call.event === "plugin/npm/install").map((call) => call.daemonId), ["node-1"]);
  assert.equal(env.local.get("sample").version, "3.0.0");
  assert.equal(result.restartRequired, false);
});

test("market updates continue after a node fails and allow a node-only retry", async (t) => {
  const env = await fixture(t, { sides: ["panel", "daemon"], version: "2.0.0" });
  await env.common.installNpmPlugin({ name: "epanel-plugin-sample", pluginId: "sample", version: "1.0.0" });
  env.installs.length = 0;
  env.state.request = async ({ event, daemonId }) => {
    if (event === "plugin/list") return [{ id: "sample", packageName: "epanel-plugin-sample", version: "1.0.0" }];
    if (event === "plugin/npm/install" && daemonId === "node-1") throw new Error("npm failed");
    return {};
  };
  const result = await env.update({ daemonIds: ["node-1", "node-2"] });
  assert.deepEqual(result.failedTargets.map((target) => target.daemonId), ["node-1"]);
  assert.deepEqual(result.updatedTargets.map((target) => target.daemonId ?? "panel"), ["node-2", "panel"]);
  assert.equal(env.installs.length, 1);
  env.state.version = "3.0.0";
  await env.update({ panel: false, daemonIds: ["node-2"] });
  assert.equal(env.installs.length, 1, "a node-only update must not change the panel");
  assert.equal(env.local.get("sample").version, "2.0.0");
});

test("panel installation uses the market package name and records the npm dependency", async (t) => {
  const env = await fixture(t);
  assert.deepEqual(await env.install(), {
    failedNodes: [],
    installedVersion: "1.0.0",
    restartRequired: false
  });
  assert.deepEqual(env.installs, [
    {
      name: "epanel-plugin-sample",
      pluginId: "sample",
      version: "1.0.0",
      side: "panel"
    }
  ]);
  assert.equal(env.state.panelReloads, 1);
  const installed = await env.installed();
  assert.equal(installed.length, 1);
  assert.equal(installed[0].source, "project");
  assert.equal(installed[0].removable, true);
  assert.deepEqual(installed[0].sides, ["panel"]);
  assert.equal((await env.list())[0].installedVersion, "1.0.0");
  assert.equal((await env.list())[0].installedRemovable, true);
  assert.equal((await env.detail()).installedVersion, "1.0.0");
});

test("daemon-only installation goes to the selected nodes through npm", async (t) => {
  const env = await fixture(t, { sides: ["daemon"] });
  assert.deepEqual(await env.install({ daemonIds: ["node-1", "node-1", " node-2 "] }), {
    failedNodes: [],
    installedVersion: "1.0.0",
    restartRequired: false
  });
  assert.equal(env.installs.length, 0);
  assert.deepEqual(
    env.rpcCalls.map((call) => [call.event, call.daemonId]),
    [
      ["plugin/npm/install", "node-1"],
      ["plugin/npm/install", "node-2"],
      ["plugin/reload", "node-1"],
      ["plugin/reload", "node-2"]
    ]
  );
  assert.deepEqual(env.rpcCalls[0].payload, {
    name: "epanel-plugin-sample",
    pluginId: "sample",
    version: "1.0.0"
  });
  const installed = await env.installed();
  assert.deepEqual(installed[0].sides, ["daemon"]);
  assert.deepEqual(installed[0].daemonIds, ["node-1", "node-2"]);
  await assert.rejects(env.install({ daemonIds: [] }), { status: 400 });
});

test("failed node installs leave no remote record and unselected nodes stay installed", async (t) => {
  const env = await fixture(t, { sides: ["daemon"] });
  env.nodes.get("node-1").available = false;
  env.state.request = async () => {
    throw new Error("node refused install");
  };
  assert.deepEqual(await env.install({ daemonIds: ["node-1", "missing", "node-3"] }), {
    failedNodes: ["node-1", "missing", "node-3"],
    installedVersion: undefined,
    restartRequired: false
  });
  assert.deepEqual(await env.installed(), []);

  env.state.request = async ({ event, daemonId }) => {
    if (event === "plugin/npm/install") return {};
    if (event === "plugin/npm/uninstall" && daemonId === "node-3") throw new Error("offline");
    return {};
  };
  await env.install({ daemonIds: ["node-3"] });
  const partial = await env.uninstall("node-3");
  assert.deepEqual(partial, {
    removed: false,
    installedVersion: "1.0.0",
    failedNodes: ["node-3"],
    restartRequired: false
  });
  assert.deepEqual((await env.installed())[0].daemonIds, ["node-3"]);
  assert.equal(
    env.rpcCalls.some(
      (call) => call.event === "plugin/npm/uninstall" && call.daemonId === "node-3"
    ),
    true
  );
});

test("upgrading a release and adding a node both take effect dynamically", async (t) => {
  const env = await fixture(t, { sides: ["panel", "daemon"] });
  const first = await env.install({ daemonIds: ["node-1"] });
  assert.equal(first.installedVersion, "1.0.0");
  assert.equal(first.restartRequired, false);

  env.state.version = "2.0.0";
  const upgrade = await env.install({ daemonIds: ["node-1"] });
  assert.equal(upgrade.installedVersion, "2.0.0");
  assert.equal(upgrade.restartRequired, false);

  const additional = await env.install({ daemonIds: ["node-2"] });
  assert.equal(additional.installedVersion, "2.0.0");
  assert.equal(additional.restartRequired, false);
  assert.equal(env.state.panelReloads, 3);
});

test("reload failures require a restart and only changed nodes are reloaded", async (t) => {
  const env = await fixture(t, { sides: ["daemon"] });
  env.state.request = async ({ event }) => {
    if (event === "plugin/reload") throw new Error("requires daemon restart");
    return {};
  };
  const result = await env.install({ daemonIds: ["node-1"] });
  assert.equal(result.restartRequired, true);
  assert.deepEqual(
    env.rpcCalls.filter((call) => call.event === "plugin/reload").map((call) => call.daemonId),
    ["node-1"]
  );
});

test("npm updates are independent of uninstall protection; source plugins stay protected", async (t) => {
  const env = await fixture(t);
  await env.install();
  env.state.protected = true;
  await env.install();
  await assert.rejects(env.uninstall(), { message: "TXT_CODE_PLUGIN_MARKET_BUNDLED" });
  env.state.inventoryExtra.push({ id: "sample", removable: false });
  await assert.rejects(env.install(), { message: "TXT_CODE_PLUGIN_MARKET_BUNDLED" });
});

test("a daemon's deferred npm reload does not send another RPC through its closing transport", async (t) => {
  const env = await fixture(t, { sides: ["daemon"] });
  env.state.request = async () => ({ result: { saved: true, application: "pending" } });
  const result = await env.install({ daemonIds: ["node-1"] });
  assert.equal(result.restartRequired, false);
  assert.deepEqual(env.rpcCalls.map((call) => call.event), ["plugin/npm/install"]);
  env.rpcCalls.length = 0;
  env.state.version = "2.0.0";
  env.state.request = async ({ event }) => event === "plugin/list"
    ? [{ id: "sample", packageName: "epanel-plugin-sample", version: "1.0.0" }]
    : { result: { saved: true, application: "pending" } };
  const update = await env.update({ panel: false, daemonIds: ["node-1"] });
  assert.equal(update.restartRequired, false);
  assert.deepEqual(env.rpcCalls.map((call) => call.event), ["plugin/list", "plugin/npm/install"]);
  let checks = 0;
  env.state.request = async ({ event }) => {
    if (event !== "plugin/list") return {};
    if (++checks === 1) throw new Error("reconnecting after a foundation update");
    return [{ id: "sample", packageName: "epanel-plugin-sample", version: "1.0.0" }];
  };
  assert.deepEqual((await env.update({ panel: false, daemonIds: ["node-1"] })).failedTargets, []);
  assert.equal(checks, 2, "a temporary reconnect must not skip the next plugin update");
});

test("same-plugin operations stay serialized across installs and a queued uninstall", async (t) => {
  const env = await fixture(t);
  const entered = deferred();
  const release = deferred();
  const install = env.common.installNpmPlugin;
  env.common.installNpmPlugin = async (options) => {
    entered.resolve();
    await release.promise;
    return install(options);
  };
  const first = env.install();
  await entered.promise;
  const second = env.install();
  const removal = env.uninstall();
  await new Promise(setImmediate);
  assert.equal(
    env.networkCalls.filter((call) => call.url.endsWith("/api/plugins/sample")).length,
    1
  );
  release.resolve();
  await Promise.all([first, second, removal]);
});

test("the icon endpoint answers the default icon without calling the market", async (t) => {
  const env = await fixture(t);
  assert.deepEqual(await env.icon(), { dataUrl: null });
});

test("unsupported release contracts are rejected before npm or node operations begin", async (t) => {
  const env = await fixture(t);
  env.state.compatibility = { panel: { api: 2 } };
  await assert.rejects(env.install(), {
    status: 409,
    message: "TXT_CODE_PLUGIN_MARKET_INCOMPATIBLE"
  });
  assert.equal(env.installs.length, 0);
  assert.equal(env.rpcCalls.length, 0);
});

test("uninstall keeps configuration by default and clears overrides only when requested", async (t) => {
  const env = await fixture(t, { sides: ["panel", "daemon"] });
  await env.install({ daemonIds: ["node-1"] });
  await env.uninstall("node-1");
  assert.equal(env.state.lastOverride, undefined);
  await env.install({ daemonIds: ["node-1"] });
  await env.uninstall("node-1", "sample", true);
  assert.deepEqual(env.state.lastOverride, { id: "sample", patch: { config: {} } });
  assert.ok(
    env.rpcCalls.some(
      (call) => call.event === "plugin/npm/uninstall" && call.payload.removeConfig === true
    )
  );
});

test("installation records preserve different daemon versions instead of collapsing them", async (t) => {
  const env = await fixture(t, { sides: ["daemon"] });
  await env.install({ daemonIds: ["node-1"] });
  env.state.version = "2.0.0";
  await env.install({ daemonIds: ["node-2"] });
  assert.deepEqual((await env.installed())[0].daemonVersions, {
    "node-1": "1.0.0",
    "node-2": "2.0.0"
  });
});

test("disabled source plugins are listed as installed and remain protected", async (t) => {
  const env = await fixture(t);
  env.state.inventoryExtra.push({
    id: "sample",
    version: "1.0.0",
    removable: false,
    state: "disabled"
  });
  const listed = (await env.list())[0];
  assert.equal(listed.installedVersion, "1.0.0");
  assert.equal(listed.installedRemovable, false);
  assert.equal(listed.installedState, "disabled");
  assert.equal((await env.installed())[0].panelVersion, "1.0.0");
});

test("dependency versions are read from package metadata without executing a dependency", async (t) => {
  const env = await fixture(t);
  env.common.npmPluginRoots = () => ({
    packageRoot: env.panelDirectory,
    projectRoot: env.panelDirectory
  });
  fs.writeFileSync(
    path.join(env.panelDirectory, "package.json"),
    JSON.stringify({ name: "@elementspanel/panel", version: "1.0.0" })
  );
  const dependency = path.join(env.panelDirectory, "node_modules", "example-lib");
  fs.mkdirSync(dependency, { recursive: true });
  fs.writeFileSync(
    path.join(dependency, "package.json"),
    JSON.stringify({ name: "example-lib", version: "2.3.0", main: "index.js" })
  );
  fs.writeFileSync(
    path.join(dependency, "index.js"),
    'throw new Error("dependency must not execute")'
  );
  const versions = env.service.panelDependencyVersions({
    name: "epanel-plugin-sample",
    versions: [
      {
        dependencies: { "example-lib": "^2", "missing-lib": "*" },
        peerDependencies: { "@elementspanel/panel": "^1" }
      }
    ]
  });
  assert.equal(versions["example-lib"], "2.3.0");
  assert.equal(versions["@elementspanel/panel"], "1.0.0");
  assert.equal(versions["missing-lib"], "");
});
