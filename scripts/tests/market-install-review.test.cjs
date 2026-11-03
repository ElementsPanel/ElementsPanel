const { from, createLoader, deferred } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { EventEmitter } = require("node:events");

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
      if (state.marketUnavailable) throw new Error("Market unavailable");
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
      return { data: state.details?.[decodeURIComponent(url.split("/").pop())] ?? detail };
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
      deferRestartUntil: (gate) => { state.restartGate = gate; },
      async updateBatch(options) {
        state.panelBatch = options;
        if (state.batchResult) return state.batchResult(options);
        const results = [];
        for (const update of options.updates) {
          if (update.runtime) state.panelRuntime = { ...state.panelRuntime, version: update.version };
          else await common.installNpmPlugin({ ...update, side: "panel" });
          results.push(update);
        }
        return { results, restartRequired: false };
      },
      runtime: {
        get installed() { return state.panelRuntime; },
        async check() {
          if (state.runtimeCheckError) throw new Error("Registry unavailable");
          return state.panelRuntime ?? null;
        },
        async update(options) {
          state.runtimeUpdate = options;
          state.panelRuntime = { ...state.panelRuntime, version: options.version };
          return { ...state.panelRuntime, restartRequired: false };
        }
      },
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
      install: ({ reloadAfter, ...options }) => {
        state.reloadAfter = reloadAfter;
        return common.installNpmPlugin({ ...options, side: "panel" });
      },
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

  async function request(method, url, values = {}, res) {
    const query = method === "post" ? {} : values;
    const ctx = { query, res, request: { query, body: method === "post" ? values : undefined } };
    await panelRequire("koa-compose")(routes.get(`${method} ${url}`))(ctx);
    return ctx.body;
  }

  return {
    request,
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
    installed: (query = {}) => request("get", "/plugin/installed", query),
    updates: (query = {}) => request("get", "/plugin/updates", query),
    update: (values = {}) => request("post", "/plugin/update", {
      pluginId: "sample", version: state.version, panel: true, daemonIds: [], ...values
    }),
    list: (query = {}) => request("get", "/plugin/list", query),
    detail: (query = {}) => request("get", "/plugin/detail", { pluginId: "sample", ...query }),
    icon: () => request("get", "/plugin/icon")
  };
}

test("market views show only the selected host's supported plugins and live installation state", async (t) => {
  const env = await fixture(t, { sides: ["panel", "daemon"], version: "4.0.0" });
  await env.common.installNpmPlugin({ name: "epanel-plugin-sample", pluginId: "sample", version: "1.0.0" });
  await env.service.recordRemoteInstall({ pluginId: "sample", name: "epanel-plugin-sample", version: "0.5.0", installedAt: 1 }, "node-1");
  env.state.request = async ({ event, daemonId }) => event === "plugin/list"
    ? daemonId === "node-1"
      ? [{ id: "sample", packageName: "epanel-plugin-sample", version: "2.0.0", state: "disabled", removable: true }]
      : []
    : {};
  assert.equal((await env.list({ daemonId: "" }))[0].installedVersion, "1.0.0");
  const node = (await env.list({ daemonId: "node-1" }))[0];
  assert.equal(node.installedVersion, "2.0.0", "live inventory takes precedence over an old market record");
  assert.equal(node.installedState, "disabled");
  assert.equal(node.installedRemovable, true);
  assert.equal(node.targetDaemonId, "node-1");
  assert.equal((await env.detail({ daemonId: "node-1" })).installedVersion, "2.0.0");
  assert.equal((await env.list({ daemonId: "node-2" }))[0].installedVersion, undefined);
  assert.deepEqual((await env.installed({ daemonId: "node-1" }))[0].daemonIds, ["node-1"]);
  for (const sides of [["panel"], ["daemon"], ["panel", "daemon"]]) {
    env.state.sides = sides;
    assert.equal((await env.list({ daemonId: "" })).length, Number(sides.includes("panel")));
    assert.equal((await env.list({ daemonId: "node-1" })).length, Number(sides.includes("daemon")));
  }
  env.nodes.get("node-1").available = false;
  await assert.rejects(env.list({ daemonId: "node-1" }), {
    status: 503, message: "TXT_CODE_PLUGIN_MARKET_NODE_UNAVAILABLE"
  });
});

test("scoped installs, uninstalls and update checks leave every other host untouched", async (t) => {
  const env = await fixture(t, { sides: ["panel", "daemon"], version: "2.0.0" });
  await env.common.installNpmPlugin({ name: "epanel-plugin-sample", pluginId: "sample", version: "1.0.0" });
  env.installs.length = 0;
  env.state.request = async ({ event }) => event === "plugin/list"
    ? [{ id: "sample", packageName: "epanel-plugin-sample", version: "1.5.0", removable: true }]
    : {};
  assert.deepEqual((await env.updates({ daemonId: "" })).plugins[0].targets, [{ label: "", currentVersion: "1.0.0" }]);
  assert.deepEqual((await env.updates({ daemonId: "node-1" })).plugins[0].targets, [
    { daemonId: "node-1", label: "node-1", currentVersion: "1.5.0" }
  ]);
  env.state.protected = true;
  assert.equal((await env.install({ panel: false, daemonIds: ["node-1"] })).installedVersion, "2.0.0");
  assert.deepEqual(env.installs, [], "a daemon operation does not install the panel half of a dual-sided package");
  assert.equal(env.local.get("sample").version, "1.0.0");
  assert.equal(env.state.panelReloads, 0);
  assert.deepEqual(env.rpcCalls.filter((call) => call.event === "plugin/npm/install").map((call) => call.daemonId), ["node-1"]);
  const result = await env.request("delete", "/plugin/uninstall", { pluginId: "sample", daemonIds: "node-1", panel: "false" });
  assert.equal(result.removed, true);
  assert.equal(result.installedVersion, undefined);
  assert.deepEqual(env.uninstalls, []);
  assert.equal(env.local.get("sample").version, "1.0.0");
  assert.deepEqual(env.rpcCalls.filter((call) => call.event === "plugin/npm/uninstall").map((call) => call.daemonId), ["node-1"]);
  env.state.protected = false;
  env.rpcCalls.length = 0;
  await env.service.recordRemoteInstall({ pluginId: "sample", name: "epanel-plugin-sample", version: "1.5.0", installedAt: 1 }, "node-2");
  assert.equal((await env.install({ panel: true })).installedVersion, "2.0.0");
  assert.equal(env.rpcCalls.length, 0, "a panel install never contacts a daemon");
  const panelRemoval = await env.request("delete", "/plugin/uninstall", { pluginId: "sample", panel: "true" });
  assert.equal(panelRemoval.removed, true);
  assert.equal(panelRemoval.installedVersion, undefined);
  assert.equal(env.service.readRemoteInstalls("sample")[0].daemonId, "node-2");
  assert.equal(env.rpcCalls.length, 0, "removing the panel half preserves every daemon installation");
});

test("node management can uninstall packages installed outside the market without removing the panel", async (t) => {
  const env = await fixture(t, { sides: ["panel", "daemon"] });
  await env.common.installNpmPlugin({ name: "epanel-plugin-sample", pluginId: "sample", version: "1.0.0" });
  let installed = true;
  env.state.request = async ({ event }) => {
    if (event === "plugin/list") return installed
      ? [{ id: "sample", packageName: "epanel-plugin-sample", version: "3.0.0", removable: true }]
      : [];
    if (event === "plugin/npm/uninstall") installed = false;
    return {};
  };
  assert.equal((await env.installed({ daemonId: "node-2" }))[0].version, "3.0.0");
  const result = await env.request("delete", "/plugin/uninstall", { pluginId: "sample", daemonIds: "node-2", panel: "false" });
  assert.equal(result.removed, true);
  assert.deepEqual(await env.installed({ daemonId: "node-2" }), []);
  assert.equal(env.local.get("sample").version, "1.0.0");
});

test("shared market targets include the panel and every node with live removal eligibility", async (t) => {
  const env = await fixture(t, { sides: ["panel", "daemon"] });
  await env.common.installNpmPlugin({ name: "epanel-plugin-sample", pluginId: "sample", version: "1.0.0" });
  env.nodes.get("node-3").available = false;
  let nodeInstalled = true;
  env.state.request = async ({ event, daemonId }) => {
    if (event === "plugin/list") return daemonId === "node-1"
      ? nodeInstalled ? [{ id: "sample", packageName: "epanel-plugin-sample", version: "2.0.0", removable: true }] : []
      : [{ id: "sample", version: "3.0.0", removable: false }];
    if (event === "plugin/npm/uninstall") nodeInstalled = false;
    return {};
  };
  const targets = await env.request("get", "/plugin/targets", { pluginId: "sample" });
  assert.deepEqual(targets.map((target) => target.daemonId), ["", "node-1", "node-2", "node-3"]);
  assert.equal(targets[0].installedVersion, "1.0.0");
  assert.equal(targets[1].installedVersion, "2.0.0");
  assert.equal(targets[1].removable, true);
  assert.equal(targets[2].updatable, false);
  assert.equal(targets[2].removable, false);
  assert.equal(targets[3].available, false, "an offline node remains visible");
  assert.equal(env.networkCalls.length, 0, "target discovery and removal do not depend on the market");
  const result = await env.request("delete", "/plugin/uninstall", {
    pluginId: "sample", panel: "true", daemonIds: "node-1", removeConfig: "true"
  });
  assert.deepEqual(result.failedNodes, []);
  assert.equal(env.local.has("sample"), false);
  assert.equal(nodeInstalled, false, "mixed removal includes direct daemon installations without market records");
  assert.deepEqual(env.rpcCalls.filter((call) => call.event === "plugin/npm/uninstall"), [{
    daemonId: "node-1", event: "plugin/npm/uninstall",
    payload: { pluginId: "sample", name: "epanel-plugin-sample", removeConfig: true }
  }]);
  assert.deepEqual(env.state.lastOverride, { id: "sample", patch: { config: {} } });
});

test("mixed removals report a daemon lost after selection while completing the panel removal", async (t) => {
  const env = await fixture(t, { sides: ["panel", "daemon"] });
  await env.common.installNpmPlugin({ name: "epanel-plugin-sample", pluginId: "sample", version: "1.0.0" });
  env.nodes.get("node-1").available = false;
  const result = await env.request("delete", "/plugin/uninstall", {
    pluginId: "sample", panel: "true", daemonIds: "node-1"
  });
  assert.deepEqual(result.failedNodes, ["node-1"]);
  assert.equal(env.local.has("sample"), false);
});

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

test("runtime updates share the market list while retaining host scopes and registry versions", async (t) => {
  const env = await fixture(t);
  env.state.panelRuntime = { name: "@elementspanel/panel", side: "panel", version: "1.0.0", latestVersion: "2.0.0" };
  env.nodes.get("node-3").available = false;
  env.state.request = async ({ event, daemonId }) => {
    if (event === "plugin/list") return [];
    if (event === "plugin/capabilities") return { runtimeUpdates: true };
    if (event === "runtime/check") return { name: "@elementspanel/daemon", side: "daemon", version: "1.0.0", latestVersion: daemonId === "node-1" ? "2.0.0" : "3.0.0" };
  };
  const all = await env.updates();
  assert.equal(all.plugins.length, 3);
  assert.equal(new Set(all.plugins.map((item) => item.pluginId)).size, 3);
  assert.deepEqual(all.plugins.find((item) => item.runtime === "panel").targets, [{ label: "", currentVersion: "1.0.0" }]);
  assert.deepEqual(all.uncheckedNodes, [{ daemonId: "node-3", label: "node-3" }]);
  assert.deepEqual((await env.updates({ daemonId: "" })).plugins.map((item) => item.runtime), ["panel"]);
  const nodeOnly = await env.updates({ daemonId: "node-2" });
  assert.equal(nodeOnly.plugins.length, 1);
  assert.equal(nodeOnly.plugins[0].version, "3.0.0");
  assert.deepEqual(nodeOnly.plugins[0].targets, [{ daemonId: "node-2", label: "node-2", currentVersion: "1.0.0" }]);
});

test("a failed catalogue or registry check preserves the other updates without claiming everything is current", async (t) => {
  const env = await fixture(t, { version: "2.0.0" });
  env.state.panelRuntime = { name: "@elementspanel/panel", side: "panel", version: "1.0.0", latestVersion: "2.0.0" };
  env.state.marketUnavailable = true;
  let result = await env.updates({ daemonId: "" });
  assert.equal(result.checkFailed, true);
  assert.equal(result.plugins[0].runtime, "panel");
  env.state.marketUnavailable = false;
  env.state.runtimeCheckError = true;
  await env.common.installNpmPlugin({ name: "epanel-plugin-sample", pluginId: "sample", version: "1.0.0" });
  result = await env.updates({ daemonId: "" });
  assert.equal(result.checkFailed, true);
  assert.deepEqual(result.plugins.map((item) => item.pluginId), ["sample"]);
});

test("panel runtime updates defer restart until the HTTP reply and ignore stale versions", async (t) => {
  const env = await fixture(t);
  env.state.panelRuntime = { name: "@elementspanel/panel", side: "panel", version: "1.0.0" };
  const res = new EventEmitter();
  const result = await env.request("post", "/runtime/update", { side: "panel", version: "2.0.0", daemonIds: [] }, res);
  assert.equal(result.installedVersion, "2.0.0");
  assert.equal(result.restartRequired, false);
  assert.deepEqual(result.updatedTargets, [{ label: "", currentVersion: "1.0.0" }]);
  let released = false;
  env.state.runtimeUpdate.reloadAfter.then(() => { released = true; });
  await Promise.resolve();
  assert.equal(released, false);
  res.emit("finish");
  await Promise.resolve();
  assert.equal(released, true);
  env.state.runtimeUpdate = undefined;
  const stale = await env.request("post", "/runtime/update", { side: "panel", version: "1.0.0", daemonIds: [] });
  assert.deepEqual(stale.updatedTargets, []);
  assert.equal(env.state.runtimeUpdate, undefined);
});

test("daemon runtime updates recheck versions, isolate failures and only change selected nodes", async (t) => {
  const env = await fixture(t);
  env.state.request = async ({ event, daemonId }) => {
    if (event === "plugin/capabilities") return { runtimeUpdates: true, runtime: { name: "@elementspanel/daemon", side: "daemon", version: daemonId === "node-3" ? "3.0.0" : "1.0.0" } };
    if (event === "runtime/update") {
      if (daemonId === "node-1") throw new Error("npm failed");
      return { name: "@elementspanel/daemon", version: "2.0.0", restartRequired: false };
    }
  };
  const result = await env.request("post", "/runtime/update", { side: "daemon", version: "2.0.0", daemonIds: ["node-1", "node-2", "node-2", "node-3", "missing"] });
  assert.deepEqual(result.updatedTargets.map((item) => item.daemonId), ["node-2"]);
  assert.deepEqual(result.failedTargets.map((item) => item.daemonId), ["node-1", "missing"]);
  assert.equal(result.restartRequired, false);
  assert.deepEqual(env.rpcCalls.filter((call) => call.event === "runtime/update").map((call) => call.daemonId), ["node-1", "node-2"]);
  assert.equal(env.state.runtimeUpdate, undefined);
});

test("one-click batches send every selected package once per host and keep the panel reply alive", async (t) => {
  const env = await fixture(t, { sides: ["panel", "daemon"], version: "2.0.0" });
  await env.common.installNpmPlugin({ name: "epanel-plugin-sample", pluginId: "sample", version: "1.0.0" });
  env.state.panelRuntime = { name: "@elementspanel/panel", side: "panel", version: "1.0.0" };
  env.state.request = async ({ event, daemonId, payload }) => {
    if (event === "plugin/list") return [{ id: "sample", packageName: "epanel-plugin-sample", version: daemonId === "node-3" ? "3.0.0" : "1.0.0" }];
    if (event === "plugin/capabilities") return {
      batchUpdates: true,
      runtime: { name: "@elementspanel/daemon", side: "daemon", version: daemonId === "node-3" ? "3.0.0" : "1.0.0" }
    };
    assert.equal(event, "plugin/npm/update-batch", "the batch never uses per-package installation or reload RPCs");
    assert.equal(env.state.panelBatch, undefined, "the panel runs after daemon requests finish");
    return { results: payload.updates.map((update) => ({
      ...update,
      ...(daemonId === "node-1" && !update.runtime ? { error: "npm failed" } : {})
    })), restartRequired: daemonId === "node-2" };
  };
  const updates = [
    { pluginId: "sample", version: "2.0.0", panel: true, daemonIds: ["node-1", "node-2", "node-2", "node-3"] },
    { pluginId: "@elementspanel/daemon@2.0.0", runtime: "daemon", version: "2.0.0", panel: false, daemonIds: ["node-1", "node-2", "node-3"] },
    { pluginId: "@elementspanel/panel@2.0.0", runtime: "panel", version: "2.0.0", panel: true, daemonIds: [] }
  ];
  const res = new EventEmitter();
  const batch = await env.request("post", "/plugin/update-batch", { updates }, res);
  assert.equal(batch.results.length, 3);
  assert.deepEqual(env.rpcCalls.filter((call) => call.event === "plugin/npm/update-batch").map((call) => call.daemonId), ["node-1", "node-2"]);
  const daemonPackages = env.rpcCalls.find((call) => call.event === "plugin/npm/update-batch").payload.updates;
  assert.deepEqual(daemonPackages, [
    { pluginId: "sample", name: "epanel-plugin-sample", version: "2.0.0" },
    { name: "@elementspanel/daemon", version: "2.0.0", runtime: true }
  ]);
  assert.deepEqual(env.state.panelBatch.updates, [
    daemonPackages[0], { name: "@elementspanel/panel", version: "2.0.0", runtime: true }
  ]);
  assert.equal(env.state.panelReloads, 0);
  assert.deepEqual(batch.results[0].result.updatedTargets.map((target) => target.daemonId || "panel"), ["node-2", "panel"]);
  assert.deepEqual(batch.results[0].result.failedTargets.map((target) => target.daemonId), ["node-1"]);
  assert.equal(batch.results[0].result.restartRequired, true);
  let released = false;
  env.state.panelBatch.reloadAfter.then(() => { released = true; });
  await Promise.resolve();
  assert.equal(released, false);
  res.emit("finish");
  await env.state.panelBatch.reloadAfter;
  assert.equal(released, true);
});

test("one-click batches isolate failures and finish after the browser disconnects", async (t) => {
  const env = await fixture(t, { sides: ["panel", "daemon"], version: "2.0.0" });
  await env.common.installNpmPlugin({ name: "epanel-plugin-sample", pluginId: "sample", version: "1.0.0" });
  env.state.panelRuntime = { name: "@elementspanel/panel", side: "panel", version: "1.0.0" };
  env.state.details = { broken: { id: "broken" } };
  env.state.request = async ({ event, daemonId, payload }) => {
    if (event === "plugin/list") return [{ id: "sample", packageName: "epanel-plugin-sample", version: "1.0.0" }];
    if (event === "plugin/capabilities") return { batchUpdates: daemonId !== "node-2" };
    assert.equal(event, "plugin/npm/update-batch");
    if (daemonId === "node-1") throw new Error("Node disconnected");
    return { results: payload.updates, restartRequired: false };
  };
  const started = deferred();
  const finish = deferred();
  env.state.batchResult = async ({ updates }) => {
    started.resolve();
    await finish.promise;
    return {
      results: updates.map((update) => ({ ...update, ...(!update.runtime ? { error: "npm failed" } : {}) })),
      restartRequired: false
    };
  };
  const res = new EventEmitter();
  const work = env.request("post", "/plugin/update-batch", { updates: [
    { pluginId: "broken", version: "2.0.0", panel: true, daemonIds: [] },
    { pluginId: "sample", version: "2.0.0", panel: true, daemonIds: ["node-1", "node-2", "node-3"] },
    { pluginId: "@elementspanel/panel@2.0.0", runtime: "panel", version: "2.0.0", panel: true, daemonIds: [] }
  ] }, res);
  await started.promise;
  let released = false;
  env.state.restartGate.then(() => { released = true; });
  res.emit("close");
  await Promise.resolve();
  assert.equal(released, false, "a closed HTTP response cannot release an unfinished batch");
  finish.resolve();
  const batch = await work;
  await env.state.restartGate;
  assert.equal(released, true);
  assert.ok(batch.results[0].error);
  assert.deepEqual(batch.results[1].result.updatedTargets.map((target) => target.daemonId), ["node-3"]);
  assert.deepEqual(batch.results[1].result.failedTargets.map((target) => target.daemonId || "panel"), ["node-1", "node-2", "panel"]);
  assert.equal(batch.results[2].result.updatedTargets.length, 1);
  assert.equal(env.state.panelReloads, 0);
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
    projectRoot: env.panelDirectory,
    dependencyRoot: path.join(env.panelDirectory, "panel")
  });
  fs.writeFileSync(
    path.join(env.panelDirectory, "package.json"),
    JSON.stringify({ name: "@elementspanel/panel", version: "1.0.0" })
  );
  const dependency = path.join(env.panelDirectory, "panel/node_modules", "example-lib");
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
