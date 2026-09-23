const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const panelRequire = Module.createRequire(path.join(root, "panel/package.json"));
const ts = panelRequire("typescript");
const serviceFile = "panel/plugins/market/src/backend/service/plugin_market.ts";

function load(relative, overrides = {}) {
  const filename = path.join(root, relative);
  const source = fs.readFileSync(filename, "utf8");
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  const localRequire = Module.createRequire(filename);
  const requireSource = (id) => {
    const candidate = path.resolve(path.dirname(filename), id) + ".ts";
    if (id.startsWith(".") && fs.existsSync(candidate)) return load(path.relative(root, candidate));
    return localRequire(id);
  };
  loaded.require = (id) =>
    Object.hasOwn(overrides, id)
      ? overrides[id]
      : id === "mcsmanager-common"
      ? load("common/src/plugin_package.ts")
      : id === "./plugin_manifest"
      ? load("common/src/plugin_manifest.ts")
      : requireSource(id);
  loaded._compile(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      },
      fileName: filename
    }).outputText,
    filename
  );
  return loaded.exports;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture(t, { sides = ["daemon"], development = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-market-install-review-"));
  const previous = process.cwd();
  const panelDirectory = path.join(directory, development ? "panel" : "web");
  fs.mkdirSync(panelDirectory);
  if (development) fs.mkdirSync(path.join(panelDirectory, "src", "app"), { recursive: true });
  process.chdir(panelDirectory);
  t.after(() => {
    process.chdir(previous);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const routes = new Map();
  const rpcCalls = [];
  const networkCalls = [];
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
  const state = { sides, request: async () => ({ removed: true }), panelReloads: 0 };
  const axios = {
    isAxiosError: () => false,
    async get(url, options) {
      networkCalls.push({ url, options });
      if (url.endsWith("/files"))
        return {
          data: {
            name: "sample",
            version: options.params.version || "1.0.0",
            files: state.sides.map((side) => ({ path: `${side}/plugin.json`, size: 2 }))
          }
        };
      if (url.endsWith("/file"))
        return {
          data: Buffer.from(
            JSON.stringify({
              id: "sample",
              version: options.params.version || "1.0.0",
              ...(state.elements ? { elements: state.elements } : {})
            })
          )
        };
      if (url.endsWith("/api/plugins"))
        return { data: { items: [{ id: "sample", name: "sample" }] } };
      return { data: { latestVersion: { version: "1.0.0", status: "approved" } } };
    }
  };
  const service = load(serviceFile, { axios });
  const plugin = load("panel/plugins/market/src/backend/index.ts", {
    axios,
    "./plugin_icon": load("panel/plugins/market/src/backend/plugin_icon.ts"),
    "../i18n": { localeMessages: {} },
    "./service/plugin_market": service,
    "./service/market_service": {},
    "./service/market_settings": {
      initMarketSettings: async () => {},
      marketSettings: () => ({ pluginMarketAddr: "https://market.example" })
    }
  });
  const pass = () => async (_ctx, next) => next();
  await plugin.apply({
    i18n: { define() {}, $t: (key) => key },
    logger: { warn() {} },
    roles: { USER: 1, ADMIN: 10 },
    middleware: {
      validator: load("panel/plugins/runtime/src/backend/middleware/validator.ts").default,
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
    plugins: {
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
    nodes,
    rpcCalls,
    networkCalls,
    install: (values = {}) =>
      request("post", "/plugin/install", {
        pluginId: "sample",
        name: "sample",
        daemonIds: ["node-1"],
        ...values
      }),
    uninstall: (daemonIds = "node-1", pluginId = "sample") =>
      request("delete", "/plugin/uninstall", {
        pluginId,
        daemonIds
      }),
    installed: () => request("get", "/plugin/installed"),
    list: () => request("get", "/plugin/list"),
    detail: () => request("get", "/plugin/detail", { pluginId: "sample" })
  };
}

test("daemon-only installation survives service reload and is visible in installed, list and detail APIs", async (t) => {
  const env = await fixture(t);
  assert.deepEqual(await env.install({ daemonIds: ["node-1", "node-1", " node-2 "] }), {
    failedNodes: [],
    installedVersion: "1.0.0",
    restartRequired: true
  });
  assert.equal(env.rpcCalls.filter((call) => call.event === "plugin/install").length, 2);
  assert.equal(fs.existsSync(path.join(env.panelDirectory, "plugins", "sample")), false);
  const reloaded = load(serviceFile);
  const installed = reloaded.listInstalled();
  assert.equal(installed.length, 1);
  assert.deepEqual(installed[0].sides, ["daemon"]);
  assert.deepEqual(installed[0].directories, []);
  assert.deepEqual(installed[0].daemonIds, ["node-1", "node-2"]);
  assert.deepEqual(await env.installed(), installed);
  assert.equal((await env.list())[0].installedVersion, "1.0.0");
  assert.deepEqual((await env.detail()).installedDaemonIds, ["node-1", "node-2"]);
});

test("all failed daemon installs leave no marker and do not request a meaningless restart", async (t) => {
  const env = await fixture(t);
  env.nodes.get("node-1").available = false;
  env.state.request = async () => {
    throw new Error("node refused install");
  };
  assert.deepEqual(await env.install({ daemonIds: ["node-1", "missing", "node-2"] }), {
    failedNodes: ["node-1", "missing", "node-2"],
    installedVersion: undefined,
    restartRequired: false
  });
  assert.deepEqual(await env.installed(), []);
  assert.equal(env.rpcCalls.length, 1);
  await assert.rejects(env.install({ daemonIds: [] }), { status: 400 });
  assert.deepEqual(await env.installed(), []);
});

test("partial upgrades retain old node metadata and uninstall failures can be retried", async (t) => {
  const env = await fixture(t);
  await env.install({ daemonIds: ["node-1", "node-2"] });
  env.state.request = async ({ daemonId }) => {
    if (daemonId === "node-2") throw new Error("offline");
    return { removed: true };
  };
  const upgrade = await env.install({ daemonIds: ["node-1", "node-2"], version: "2.0.0" });
  assert.deepEqual(upgrade.failedNodes, ["node-2"]);
  assert.equal(upgrade.installedVersion, "2.0.0");
  assert.equal(
    env.service.readRemoteInstalls("sample").find((item) => item.daemonId === "node-2").version,
    "1.0.0"
  );
  const partial = await env.uninstall("node-1,node-2,node-3");
  assert.deepEqual(partial, {
    removed: false,
    installedVersion: "1.0.0",
    failedNodes: ["node-2"],
    restartRequired: true
  });
  assert.deepEqual((await env.installed())[0].daemonIds, ["node-2"]);
  assert.equal(
    env.rpcCalls.some((call) => call.event === "plugin/uninstall" && call.daemonId === "node-3"),
    false
  );
  env.state.request = async () => ({ removed: true });
  assert.deepEqual(await env.uninstall("node-2"), {
    removed: true,
    installedVersion: undefined,
    failedNodes: [],
    restartRequired: true
  });
  assert.deepEqual(await env.installed(), []);
  assert.deepEqual(fs.readdirSync(path.join(env.panelDirectory, "data", "market-installs")), []);
});

test("unselected nodes remain installed while local removal never touches a sibling daemon directory", async (t) => {
  const env = await fixture(t, { sides: ["panel", "daemon"] });
  const adjacent = path.join(env.directory, "daemon", "plugins", "sample");
  fs.mkdirSync(adjacent, { recursive: true });
  fs.writeFileSync(
    path.join(adjacent, ".market-install.json"),
    JSON.stringify({
      pluginId: "sample",
      name: "sample",
      version: "99.0.0",
      installedAt: Date.now() + 10000
    })
  );
  fs.writeFileSync(path.join(adjacent, "keep.txt"), "not owned by the panel");
  assert.deepEqual(await env.installed(), []);
  await env.install({ daemonIds: ["node-1", "node-2"] });
  const response = await env.uninstall("node-1");
  assert.equal(response.removed, false);
  assert.deepEqual(response.failedNodes, []);
  assert.deepEqual((await env.installed())[0].daemonIds, ["node-2"]);
  assert.deepEqual((await env.installed())[0].sides, ["daemon"]);
  assert.equal(fs.existsSync(path.join(env.panelDirectory, "plugins", "sample")), false);
  assert.equal(fs.readFileSync(path.join(adjacent, "keep.txt"), "utf8"), "not owned by the panel");
});

test("remote records hash untrusted identifiers and replace records atomically", async (t) => {
  const env = await fixture(t);
  const pluginId = "../../outside:plugin\\name";
  await env.install({ pluginId });
  await env.install({ pluginId, version: "2.0.0" });
  const files = fs.readdirSync(path.join(env.panelDirectory, "data", "market-installs"));
  assert.equal(files.length, 1);
  assert.match(files[0], /^[a-f0-9]{64}\.json$/);
  assert.equal(env.service.readRemoteInstalls(pluginId)[0].version, "2.0.0");
  assert.equal(fs.existsSync(path.join(env.directory, "outside:plugin")), false);
  assert.equal((await env.uninstall("node-1", pluginId)).removed, true);
});

test("same-plugin operations stay serialized across installs and a queued uninstall", async (t) => {
  const env = await fixture(t);
  const entered = deferred();
  const release = deferred();
  env.state.request = async ({ event, payload }) => {
    if (event === "plugin/install" && payload.version === "1.0.0") {
      entered.resolve();
      await release.promise;
    }
    return { removed: true };
  };
  const first = env.install();
  await entered.promise;
  const second = env.install({ daemonIds: ["node-2"], version: "2.0.0" });
  const removal = env.uninstall("node-1,node-2");
  await new Promise(setImmediate);
  assert.equal(env.networkCalls.filter((call) => call.url.endsWith("/files")).length, 1);
  assert.equal(env.rpcCalls.length, 1);
  release.resolve();
  const [firstResult, secondResult, removalResult] = await Promise.all([first, second, removal]);
  assert.equal(firstResult.installedVersion, "1.0.0");
  assert.equal(secondResult.installedVersion, "2.0.0");
  assert.equal(removalResult.removed, true);
  assert.deepEqual(
    env.rpcCalls.map((call) => [call.event, call.daemonId]),
    [
      ["plugin/install", "node-1"],
      ["plugin/install", "node-2"],
      ["plugin/uninstall", "node-1"],
      ["plugin/uninstall", "node-2"]
    ]
  );
  assert.deepEqual(await env.installed(), []);
});

test("development reload failures require restart and only changed nodes are reloaded", async (t) => {
  const env = await fixture(t, { development: true });
  env.state.request = async ({ event }) => {
    if (event === "plugin/reload") throw new Error("requires daemon restart");
    return {};
  };
  const result = await env.install();
  assert.equal(result.restartRequired, true);
  assert.deepEqual(result.failedNodes, []);
  assert.deepEqual(
    env.rpcCalls.filter((call) => call.event === "plugin/reload").map((call) => call.daemonId),
    ["node-1"]
  );
  env.state.sides = ["panel", "daemon"];
  env.rpcCalls.length = 0;
  const panelOnly = await env.install({ daemonIds: [] });
  assert.equal(panelOnly.restartRequired, false);
  assert.equal(env.state.panelReloads, 1);
  assert.equal(env.rpcCalls.length, 0);
});

test("development discovery loads new nodes but upgrades still require a restart", async (t) => {
  const env = await fixture(t, { development: true });
  const first = await env.install({ daemonIds: ["node-1"] });
  assert.equal(first.restartRequired, false);
  assert.equal(first.installedVersion, "1.0.0");
  const upgrade = await env.install({ daemonIds: ["node-1"], version: "2.0.0" });
  assert.equal(upgrade.restartRequired, true);
  assert.equal(upgrade.installedVersion, "2.0.0");
  const additional = await env.install({ daemonIds: ["node-2"], version: "2.0.0" });
  assert.equal(additional.restartRequired, false);
  assert.deepEqual(additional.failedNodes, []);
});

test("market compatibility is negotiated before installation and downloaded bytes must match their advertised digest", async () => {
  const bytes = Buffer.from('{"id":"sample"}');
  const checksum = require("node:crypto").createHash("sha256").update(bytes).digest("hex");
  let api = 2;
  let corrupt = false;
  const service = load(serviceFile, {
    axios: {
      async get(url, options) {
        if (url.endsWith("/files")) {
          assert.equal(options.params.pluginApi, 1);
          assert.equal(options.params.pluginSdk, 1);
          return {
            data: {
              name: "sample",
              version: "1",
              compatibility: { panel: { api, sdk: 1 } },
              files: [{ path: "panel/plugin.json", size: bytes.length, sha256: checksum }]
            }
          };
        }
        return { data: corrupt ? Buffer.from("corrupt") : bytes };
      }
    }
  });
  await assert.rejects(
    service.fetchPackage("https://example.test", { pluginId: "sample" }),
    /INCOMPATIBLE/
  );
  api = 1;
  const pkg = await service.fetchPackage("https://example.test", { pluginId: "sample" });
  assert.deepEqual((await service.downloadPackage("https://example.test", pkg))[0].content, bytes);
  corrupt = true;
  await assert.rejects(service.downloadPackage("https://example.test", pkg), /BAD_CHECKSUM/);
});

test("a declared daemon package is sent only to nodes that advertise the required API", async (t) => {
  const env = await fixture(t, { sides: ["daemon"] });
  env.state.elements = { api: 1 };
  env.state.request = async ({ daemonId, event }) =>
    event === "plugin/capabilities" ? { api: daemonId === "node-1" ? 1 : 0 } : { installed: true };
  const result = await env.install({ daemonIds: ["node-1", "node-2"] });
  assert.deepEqual(result.failedNodes, ["node-2"]);
  assert.deepEqual(
    env.rpcCalls.filter((call) => call.event === "plugin/install").map((call) => call.daemonId),
    ["node-1"]
  );
});
