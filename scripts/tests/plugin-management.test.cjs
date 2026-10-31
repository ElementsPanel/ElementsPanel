const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createLoader, from, settle } = require("./helpers.cjs");
const { EventEmitter } = require("node:events");

test("plugin management npm routes require an administrator and use the plugin lifecycle service", async () => {
  const load = createLoader({ host: "panel" });
  const routes = new Map();
  const calls = [];
  const node = {
    refreshReconnect() {
      calls.push({ reconnect: true });
    }
  };
  const ctx = {
    i18n: { define() {}, $t: (key) => key },
    plugin() {},
    get: () => ({}),
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
      }
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
  await request("delete", "/api/plugins/", 10, undefined, { id: "sample" });
  assert.deepEqual(calls.pop(), { remove: "sample" });
});

test("daemon npm replies drain before the foundation reload is released", async () => {
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
  await handlers.get("plugin/npm/install")(
    { socket: { conn: connection } },
    { name: "epanel-plugin-server" }
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
  await handlers.get("plugin/npm/install")(
    { socket: { conn: connection } },
    { name: "epanel-plugin-server" }
  );
  await settle();
  assert.equal(released, true, "an immediately flushed reply releases the reload without waiting");
  assert.equal(connection.listenerCount("drain"), 0);
  assert.equal(connection.listenerCount("close"), 0);
});
