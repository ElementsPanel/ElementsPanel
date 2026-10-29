const { from, createLoader, deferred } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const panelRequire = from("panel");
const ts = panelRequire("typescript");
const serviceFile = "panel/plugins/market/src/backend/service/plugin_market.ts";

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
  const state = { sides, version, request: async () => ({ removed: true }), panelReloads: 0, protected: false };

  const common = {
    isEssentialNpmPlugin: (id) => ["i18n", "storage", "runtime", "server", "console", "config"].includes(id),
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
            items: [{ id: "sample", name: "epanel-plugin-sample", sides: state.sides }],
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
          id: `epanel-plugin-sample@${state.version}`,
          version: state.version,
          status: "approved",
          sides: state.sides
        },
        versions: [
          {
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
  const plugin = load("panel/plugins/market/src/backend/index.ts", {
    axios,
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
    plugins: {
      inventory: () => [...local.values()].map((record) => ({ id: record.pluginId, removable: !state.protected, state: "active" })),
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
    uninstall: (daemonIds = "", pluginId = "sample") =>
      request("delete", "/plugin/uninstall", { pluginId, daemonIds }),
    installed: () => request("get", "/plugin/installed"),
    list: () => request("get", "/plugin/list"),
    detail: () => request("get", "/plugin/detail", { pluginId: "sample" }),
    icon: () => request("get", "/plugin/icon")
  };
}

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
    env.rpcCalls.some((call) => call.event === "plugin/npm/uninstall" && call.daemonId === "node-3"),
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

test("core plugins cannot be installed or removed through the market", async (t) => {
  const env = await fixture(t);
  await env.install();
  env.state.protected = true;
  await assert.rejects(env.install(), { message: "TXT_CODE_PLUGIN_MARKET_BUNDLED" });
  await assert.rejects(env.uninstall(), { message: "TXT_CODE_PLUGIN_MARKET_BUNDLED" });
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
  assert.equal(env.networkCalls.filter((call) => call.url.endsWith("/api/plugins/sample")).length, 1);
  release.resolve();
  await Promise.all([first, second, removal]);
});

test("the icon endpoint answers the default icon without calling the market", async (t) => {
  const env = await fixture(t);
  assert.deepEqual(await env.icon(), { dataUrl: null });
});
