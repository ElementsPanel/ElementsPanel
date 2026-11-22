const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createLoader, from, settle } = require("./helpers.cjs");
const { EventEmitter } = require("node:events");

test("plugin management npm routes require an administrator and use the plugin lifecycle service", async () => {
  const load = createLoader({ host: "panel" });
  const routes = new Map();
  const calls = [];
  let failRemoval = false;
  const node = {
    refreshReconnect() {
      calls.push({ reconnect: true });
    }
  };
  const ctx = {
    i18n: { define() {}, $t: (key) => key },
    plugin() {},
    get: () => ({
      reset: async (id) => {
        calls.push({ reset: id });
        return { saved: true, application: "applied" };
      }
    }),
    roles: { ADMIN: 10 },
    middleware: {
      permission:
        ({ level }) =>
        async (request, next) => {
          if (request.role < level) request.status = 403;
          else await next();
        },
      validator: () => async (_request, next) => next()
    },
    koa: {
      router: (prefix) =>
        Object.fromEntries(
          ["get", "post", "put", "delete"].map((method) => [
            method,
            (path, ...handlers) => routes.set(`${method} ${prefix}${path}`, handlers)
          ])
        )
    },
    plugins: {
      install: async (options) => {
        calls.push(options);
        return { id: "sample", state: "active" };
      },
      remove: async (id) => {
        calls.push({ remove: id });
        if (failRemoval) throw new Error("removal failed");
      },
      runExclusive: (operation) => operation()
    },
    remote: {
      services: { getInstance: () => node },
      Request: class {
        async request(event, payload, timeout) {
          calls.push({ event, payload, timeout });
          return { id: "sample" };
        }
      }
    },
    inject: (_names, callback) => callback(ctx)
  };
  load("plugins/config/panel/src/backend/index.ts", {
    "mcsmanager-common": {
      writePluginOverride: (id, patch) => calls.push({ clearConfig: id, patch })
    },
    "../i18n": { localeMessages: {} },
    "./settings": { SettingsFormService: class {} }
  }).apply(ctx);
  const request = async (method, path, role, body, query = {}) => {
    const request = { role, query, request: { body, query } };
    await from("panel")("koa-compose")(routes.get(`${method} ${path}`))(request);
    return request;
  };
  for (const path of ["/api/plugins/npm/install", "/api/plugins/node/npm/install"]) {
    assert.equal((await request("post", path, 1, { name: "epanel-plugin-sample" })).status, 403);
  }
  for (const path of ["/api/plugins/", "/api/plugins/node/"]) {
    assert.equal((await request("delete", path, 1, undefined, { id: "sample" })).status, 403);
  }
  assert.equal(calls.length, 0);
  const panel = await request("post", "/api/plugins/npm/install", 10, {
    name: " epanel-plugin-sample ",
    version: " next "
  });
  assert.equal(panel.body.state, "active");
  assert.deepEqual(calls.pop(), { name: "epanel-plugin-sample", version: "next" });
  await request(
    "post",
    "/api/plugins/node/npm/install",
    10,
    { name: "epanel-plugin-sample" },
    { daemonId: "node" }
  );
  assert.deepEqual(calls.shift(), {
    event: "plugin/npm/install",
    payload: { name: "epanel-plugin-sample", version: undefined },
    timeout: 10 * 60 * 1000
  });
  assert.deepEqual(calls.shift(), { reconnect: true });
  for (const path of ["/api/plugins/settings/reset", "/api/plugins/node/settings/reset"]) {
    assert.equal(
      (await request("post", path, 1, undefined, { id: "sample", daemonId: "node" })).status,
      403
    );
  }
  const reset = await request("post", "/api/plugins/settings/reset", 10, undefined, {
    id: "sample"
  });
  assert.deepEqual(reset.body, { saved: true, application: "applied" });
  assert.deepEqual(calls.splice(0), [{ reset: "sample" }]);
  await request("post", "/api/plugins/node/settings/reset", 10, undefined, {
    daemonId: "node",
    id: "sample"
  });
  assert.deepEqual(calls.splice(0), [
    { event: "plugin/config/reset", payload: { id: "sample" }, timeout: undefined },
    { event: "info/overview", payload: undefined, timeout: undefined }
  ]);
  await request("delete", "/api/plugins/", 10, undefined, { id: "sample" });
  assert.deepEqual(calls.pop(), { remove: "sample" });
  for (const removeConfig of [undefined, "false", "true"]) {
    await request("delete", "/api/plugins/", 10, undefined, { id: "sample", removeConfig });
    assert.deepEqual(calls.splice(0), [
      { remove: "sample" },
      ...(removeConfig === "true" ? [{ clearConfig: "sample", patch: { config: {} } }] : [])
    ]);
    await request("delete", "/api/plugins/node/", 10, undefined, {
      daemonId: "node",
      id: "sample",
      removeConfig
    });
    assert.deepEqual(calls.splice(0), [
      {
        event: "plugin/remove",
        payload: { id: "sample", ...(removeConfig === "true" ? { removeConfig: true } : {}) },
        timeout: 10 * 60 * 1000
      },
      { reconnect: true }
    ]);
  }
  failRemoval = true;
  await assert.rejects(
    request("delete", "/api/plugins/", 10, undefined, { id: "sample", removeConfig: "true" }),
    /removal failed/
  );
  assert.deepEqual(calls, [{ remove: "sample" }], "a failed uninstall must keep its configuration");
});

test("plugin remarks require an administrator, persist per user and node, and allow clearing", async () => {
  const load = createLoader({ host: "panel" });
  const routes = new Map();
  const stored = new Map();
  const storage = {
    async load(category, Class, id) {
      const value = stored.get(`${category}/${id}`);
      return value ? Object.assign(new Class(), structuredClone(value)) : null;
    },
    async store(category, id, value) {
      stored.set(`${category}/${id}`, structuredClone(value));
    }
  };
  const validator = load("plugins/runtime/panel/src/backend/middleware/validator.ts").default;
  load("plugins/config/panel/src/backend/index.ts", {
    "mcsmanager-common": {},
    "../i18n": { localeMessages: {} },
    "./settings": { SettingsFormService: class {} }
  }).apply({
    i18n: { define() {}, $t: (key) => key },
    plugin() {},
    get: () => ({}),
    roles: { ADMIN: 10 },
    identity: { of: (request) => ({ uuid: request.user }) },
    storage: { getStorage: () => storage },
    middleware: {
      validator,
      permission:
        ({ level }) =>
        async (request, next) => {
          if (request.role < level) request.status = 403;
          else await next();
        }
    },
    koa: {
      router: (prefix) =>
        Object.fromEntries(
          ["get", "put", "post", "delete"].map((method) => [
            method,
            (path, ...handlers) => routes.set(`${method} ${prefix}${path}`, handlers)
          ])
        )
    },
    inject() {}
  });
  const request = async (method, body, user = "one", daemonId = "", role = 10) => {
    const query = daemonId ? { daemonId } : {};
    const request = { role, user, query, request: { body, query } };
    await from("panel")("koa-compose")(routes.get(`${method} /api/plugins/remarks`))(request);
    return request;
  };
  assert.equal((await request("get", undefined, "one", "", 1)).status, 403);
  assert.equal((await request("put", { id: "sample", remarks: "note" }, "one", "", 1)).status, 403);
  assert.equal(stored.size, 0);
  assert.deepEqual((await request("put", { id: "sample", remarks: " First\r\nnote " })).body, {
    id: "sample",
    remarks: "First note"
  });
  await request("put", { id: "other", remarks: "Other note" });
  assert.equal((await request("get")).body.length, 2);
  assert.deepEqual((await request("get", undefined, "two")).body, []);
  assert.deepEqual((await request("get", undefined, "one", "node-one")).body, []);
  await request("put", { id: "sample", remarks: "Node note" }, "one", "node-one");
  assert.deepEqual((await request("get", undefined, "one", "node-one")).body, [
    { id: "sample", remarks: "Node note" }
  ]);
  assert.deepEqual((await request("get", undefined, "one", "node-two")).body, []);
  await request("put", { id: "sample", remarks: "Updated note" });
  assert.deepEqual((await request("get")).body, [
    { id: "other", remarks: "Other note" },
    { id: "sample", remarks: "Updated note" }
  ]);
  await request("put", { id: "sample", remarks: "" });
  assert.deepEqual((await request("get")).body, [{ id: "other", remarks: "Other note" }]);
  assert.deepEqual((await request("get", undefined, "one", "node-one")).body, [
    { id: "sample", remarks: "Node note" }
  ]);
  for (const remarks of [null, 123]) {
    await assert.rejects(request("put", { id: "sample", remarks }), /REQUEST_BODY_ERROR/);
  }
  assert.deepEqual((await request("get")).body, [{ id: "other", remarks: "Other note" }]);
  const longRemarks = "x".repeat(201);
  assert.deepEqual((await request("put", { id: "sample", remarks: longRemarks })).body, {
    id: "sample",
    remarks: longRemarks
  });
});

test("daemon removal clears config only after a successful explicitly selected uninstall", async () => {
  const handlers = new Map();
  const calls = [];
  let failRemoval = false;
  createLoader({ host: "daemon" })("plugins/config/daemon/src/backend/index.ts", {
    "mcsmanager-common": {
      PLUGIN_API_VERSION: 1,
      writePluginOverride: (id, patch) => calls.push({ clearConfig: id, patch })
    },
    "../i18n": { localeMessages: {} },
    "./settings": { SettingsFormService: class {} }
  }).apply({
    i18n: { define() {}, $t: (key) => key },
    plugin() {},
    get: () => ({}),
    plugins: {
      remove: async (id) => {
        calls.push({ remove: id });
        if (failRemoval) throw new Error("removal failed");
      },
      runExclusive: (operation) => operation()
    },
    protocol: {
      on: (event, handler) => handlers.set(event, handler),
      response: () => calls.push({ response: true }),
      responseError: (_ctx, error) => calls.push({ error: error.message })
    }
  });
  for (const removeConfig of [undefined, false, "true", true]) {
    await handlers.get("plugin/remove")({}, { id: "sample", removeConfig });
    assert.deepEqual(calls.splice(0), [
      { remove: "sample" },
      ...(removeConfig === true ? [{ clearConfig: "sample", patch: { config: {} } }] : []),
      { response: true }
    ]);
  }
  failRemoval = true;
  await handlers.get("plugin/remove")({}, { id: "sample", removeConfig: true });
  assert.deepEqual(calls, [{ remove: "sample" }, { error: "removal failed" }]);
});

for (const event of ["plugin/npm/install", "runtime/update", "plugin/npm/update-batch"]) {
  test(`${event}: daemon replies drain before the process restart is released`, async () => {
    const load = createLoader({ host: "daemon" });
    const handlers = new Map();
    const connection = Object.assign(new EventEmitter(), { readyState: "open" });
    const packets = [];
    let released = false;
    let buffered = true;
    load("plugins/config/daemon/src/backend/index.ts", {
      "mcsmanager-common": { PLUGIN_API_VERSION: 1 },
      "../i18n": { localeMessages: {} },
      "./settings": { SettingsFormService: class {} }
    }).apply({
      i18n: { define() {} },
      plugin() {},
      get: () => ({}),
      plugins: {
        async updateBatch({ reloadAfter }) {
          reloadAfter.then(() => {
            released = true;
          });
          return { results: [], result: { application: "pending" }, restartRequired: false };
        },
        runtime: {
          async update({ reloadAfter }) {
            reloadAfter.then(() => {
              released = true;
            });
            return {
              name: "@elementspanel/daemon",
              version: "2.0.0",
              result: { application: "pending" }
            };
          }
        },
        async install({ reloadAfter }) {
          reloadAfter.then(() => {
            released = true;
          });
          return { id: "server", result: { saved: true, application: "pending" } };
        }
      },
      protocol: {
        on: (event, handler) => handlers.set(event, handler),
        response: (_ctx, record) => {
          packets.push(record);
          if (!buffered) connection.emit("drain");
        },
        responseError: (_ctx, error) => {
          throw error;
        }
      }
    });
    await handlers.get(event)(
      { socket: { conn: connection } },
      {
        name: "epanel-plugin-server",
        updates: [{ name: "epanel-plugin-server", pluginId: "server", version: "2.0.0" }]
      }
    );
    assert.equal(packets[0].result.application, "pending");
    await settle();
    assert.equal(released, false);
    connection.emit("drain");
    await settle();
    assert.equal(released, true);
    assert.equal(connection.listenerCount("drain"), 0);
    assert.equal(connection.listenerCount("close"), 0);
    buffered = false;
    released = false;
    await handlers.get(event)(
      { socket: { conn: connection } },
      {
        name: "epanel-plugin-server",
        updates: [{ name: "epanel-plugin-server", pluginId: "server", version: "2.0.0" }]
      }
    );
    await settle();
    assert.equal(
      released,
      true,
      "an immediately flushed reply releases the reload without waiting"
    );
    assert.equal(connection.listenerCount("drain"), 0);
    assert.equal(connection.listenerCount("close"), 0);
  });
}
