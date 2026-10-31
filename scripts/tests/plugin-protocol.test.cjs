const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createLoader, from, settle, deferred } = require("./helpers.cjs");
const { EventEmitter } = require("node:events");

test("existing daemon sockets use live plugin routes and middleware after updates", async (t) => {
  const { Context } = from("daemon")("cordis");
  const load = createLoader({ host: "daemon" });
  const RouterContext = load("plugins/server/daemon/src/backend/context.ts").default;
  const { ProtocolService, navigation } = load("plugins/server/daemon/src/backend/protocol.ts", {
    "./context": { default: RouterContext, __esModule: true }
  });
  const ctx = new Context();
  ctx.set("i18n", { $t: (key) => key });
  ctx.plugin(ProtocolService);
  t.after(() => ctx.stop());
  const packets = [],
    errors = [];
  const socket = {
    id: "already-connected",
    data: {},
    handshake: { address: "localhost" },
    use(callback) {
      this.middleware = callback;
    },
    emit(event, packet) {
      packets.push({ event, packet });
    }
  };
  navigation(socket, ctx.logger);
  async function send(event, data = null) {
    socket.middleware([event, { uuid: "request", data }], (error) => {
      if (error) errors.push(error);
    });
    await settle();
  }
  let allowed = false;
  const auth = ctx.protocol.use((_event, _ctx, _data, next) => {
    if (allowed) next();
  });
  const register = (value) =>
    ctx.plugin({
      name: `revision-${value}`,
      inject: ["protocol"],
      apply(scoped) {
        scoped.protocol.on("new/route", (routerCtx) => scoped.protocol.response(routerCtx, value));
      }
    });
  const old = register("old");
  await ctx.events.flush();
  await send("new/route");
  assert.equal(packets.length, 0, "new routes must not bypass middleware");
  allowed = true;
  await send("new/route");
  assert.equal(packets.pop().packet.data, "old");
  old.dispose();
  const replacement = register("new");
  await ctx.events.flush();
  await send("new/route");
  assert.equal(packets.pop().packet.data, "new");
  replacement.dispose();
  await ctx.events.flush();
  await send("new/route");
  assert.equal(packets.length, 0);
  auth();
  const deny = ctx.protocol.use(() => {
    throw new Error("updated gate");
  });
  await send("new/route");
  assert.match(errors.pop().message, /updated gate/);
  deny();
  ctx.protocol.use(async () => {
    throw new Error("async gate");
  });
  await send("new/route");
  assert.match(errors.pop().message, /async gate/);
});

for (const side of ["panel", "daemon"]) {
  test(`${side}: server reload waits for transport cleanup and rejects new requests while draining`, async (t) => {
    const load = createLoader({ host: side });
    const sessionKey = Symbol.for("elementspanel.panel.session");
    const previousSession = globalThis[sessionKey];
    t.after(() => {
      if (previousSession === undefined) delete globalThis[sessionKey];
      else globalThis[sessionKey] = previousSession;
    });
    const gate = deferred();
    const sessions = [];
    const apps = [];
    let closes = 0;
    const pass = () => async (_ctx, next) => next();
    const listener = {
      listening: false,
      on() {},
      listen() {
        this.listening = true;
      },
      close() {
        this.listening = false;
      }
    };
    class Transport extends EventEmitter {
      async close() {
        closes++;
        await gate.promise;
        listener.close();
      }
    }
    class Koa {
      middleware = [];
      constructor() {
        apps.push(this);
      }
      on() {}
      use(handler) {
        this.middleware.push(handler);
      }
      callback() {
        return () => {};
      }
    }
    const overrides = {
      koa: Koa,
      http: { createServer: () => listener },
      "socket.io": { Server: Transport },
      "koa-session": (options, app) => {
        sessions.push({ options, keys: app.keys });
        return pass();
      },
      "koa-static": pass,
      "koa-mount": pass,
      "mcsmanager-common": {
        packagePath: (...parts) => parts.join("/"),
        removeTrail: (value) => value
      },
      "../i18n": { localeMessages: {} },
      "./koa": { KoaService: class {} },
      "./static/index_html": { DAEMON_INDEX_HTML: "" },
      "./precheck": { preCheck: pass },
      "./protocol": {
        protocol: pass,
        ProtocolService: class {},
        navigation() {},
        addGlobalSocket() {},
        delGlobalSocket() {}
      },
      "./plugin_assets": { pluginAssets: pass }
    };
    const hooks = new Map();
    const ctx = {
      i18n: { define() {}, $t: (key) => key },
      settings: { config: { prefix: "", port: 24444, httpPort: 23333 } },
      middleware: { uploadSpeedLimit: pass(), uploadFileCheck: pass() },
      logger: { info() {}, error() {} },
      plugin() {},
      inject() {},
      set() {},
      on: (event, callback) => hooks.set(event, callback)
    };
    const filename = `plugins/server/${side}/src/backend/index.ts`;
    load(filename, overrides).apply(ctx);
    assert.equal(listener.listening, false);
    await hooks.get("ready")();
    assert.equal(listener.listening, true);
    let finished = false;
    const closing = hooks
      .get("plugins/reloading")()
      .then(() => {
        finished = true;
      });
    const request = {};
    await apps[0].middleware[0](request, () => assert.fail("new request reached unloaded routes"));
    assert.equal(request.status, 503);
    await settle();
    assert.equal(finished, false);
    gate.resolve();
    await closing;
    assert.equal(listener.listening, false);
    await hooks.get("dispose")();
    assert.equal(closes, 1, "drain and disposal share one idempotent close operation");
    if (side === "panel") {
      load(filename, overrides).apply(ctx);
      assert.deepEqual(sessions[1], sessions[0], "signed sessions survive replacing the module");
      await hooks.get("dispose")();
    }
  });
}
