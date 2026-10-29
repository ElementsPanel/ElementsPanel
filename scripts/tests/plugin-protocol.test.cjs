const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createLoader, from, settle } = require("./helpers.cjs");

test("existing daemon sockets use live plugin routes and middleware after updates", async (t) => {
  const { Context } = from("daemon")("cordis");
  const load = createLoader({ host: "daemon" });
  const RouterContext = load("daemon/plugins/server/src/backend/context.ts").default;
  const { ProtocolService, navigation } = load("daemon/plugins/server/src/backend/protocol.ts", {
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
