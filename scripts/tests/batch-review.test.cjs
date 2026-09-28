const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const panelRequire = Module.createRequire(path.join(root, "panel/package.json"));
const ts = panelRequire("typescript");
function load(relative, overrides) {
  const filename = path.join(root, relative);
  const mod = new Module(filename, module);
  const localRequire = Module.createRequire(filename);
  mod.require = (id) => (Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id));
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      }
    }).outputText,
    filename
  );
  return mod.exports;
}

test("batch forwarding waits for other nodes after one fails", async () => {
  const { multiOperationForwarding } = load(
    "panel/plugins/instance/src/backend/service/instance_service.ts",
    {
      "mcsmanager-common": {},
      "../runtime": {}
    }
  );
  let finish;
  let settled = false;
  const work = multiOperationForwarding(
    [
      { daemonId: "bad", instanceUuid: "one" },
      { daemonId: "slow", instanceUuid: "two" }
    ],
    async (daemonId) => {
      if (daemonId === "bad") throw new Error("node failed");
      await new Promise((resolve) => {
        finish = resolve;
      });
    }
  );
  const rejection = assert.rejects(work, /node failed/).then(() => {
    settled = true;
  });
  await new Promise(setImmediate);
  assert.equal(settled, false);
  finish();
  await rejection;
});

test("panel batch routes account for every instance when talking to an older daemon", async () => {
  const runtime = {
    $t: (key) => key,
    roles: () => ({ ADMIN: 10, USER: 1 }),
    middleware: () => ({
      permission: () => async (_ctx, next) => next(),
      validator: () => async (_ctx, next) => next()
    }),
    identity: () => ({ identify: () => ({ userName: "admin" }) }),
    operations: () => ({ log: (...args) => logged.push(args) }),
    remote: () => ({
      services: { getInstance: (id) => id },
      Request: class {
        constructor(id) {
          this.id = id;
        }
        async request(event, data) {
          calls.push([this.id, event, data.instanceUuids]);
          assert.equal(data.instanceUuids.length, 1);
          const [instanceUuid] = data.instanceUuids;
          if (instanceUuid === "failed") throw new Error("cannot start");
          return { instances: [{ instanceUuid, nickname: instanceUuid }] };
        }
      }
    })
  };
  const logged = [],
    calls = [];
  const service = load("panel/plugins/instance/src/backend/service/instance_service.ts", {
    "mcsmanager-common": {},
    "../runtime": runtime
  });
  const { createInstanceAdminRouter } = load(
    "panel/plugins/instance/src/backend/routers/instance_admin_router.ts",
    {
      "../runtime": runtime,
      "../service/instance_service": service
    }
  );
  const router = createInstanceAdminRouter();
  const route = router.stack.find((item) => item.path === "/instance/multi_open");
  await assert.rejects(
    panelRequire("koa-compose")(route.stack)({
      ip: "127.0.0.1",
      request: {
        body: ["one", "failed", "three"].map((instanceUuid) => ({ daemonId: "node", instanceUuid }))
      }
    }),
    /node\/failed: cannot start/
  );
  assert.deepEqual(
    calls.map((call) => call[2][0]),
    ["one", "failed", "three"]
  );
  assert.deepEqual(
    logged.map((call) => call[1].instance_id),
    ["one", "three"]
  );
});

test("daemon batch operations reply once, include all failures and never hang for missing instances", async () => {
  const handlers = new Map();
  const calls = [],
    replies = [];
  const good = (id) => ({
    config: { nickname: id },
    execPreset: async (command) => {
      calls.push([id, command]);
    }
  });
  const instances = new Map([
    ["one", good("one")],
    ["two", good("two")],
    [
      "bad",
      {
        config: { nickname: "bad" },
        execPreset: async () => {
          throw new Error("refused");
        }
      }
    ]
  ]);
  load("daemon/plugins/instance/src/backend/routers/Instance_router.ts", {
    "../entity/instance/instance": {},
    "../i18n": { $t: (key) => key },
    "../service/log": { warn() {} },
    "../service/protocol": {
      msg: (_ctx, event, data) => replies.push({ event, data, ok: true }),
      error: (_ctx, event, data) => replies.push({ event, data, ok: false })
    },
    "../service/router": {
      routerApp: { use() {}, on: (event, handler) => handlers.set(event, handler) }
    },
    "../service/system_instance": { getInstance: (id) => instances.get(id) },
    "mcsmanager-common": {},
    "../entity/commands/process_info": {},
    "../entity/instance/process_config": {},
    "../service/async_task_service": {},
    "../service/file_access": {},
    "../plugin/context": {}
  });
  await handlers.get("instance/open")({}, { instanceUuids: ["one", "one", "bad", "two"] });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].ok, false);
  assert.deepEqual(
    replies[0].data.instances.map((item) => item.instanceUuid),
    ["one", "two"]
  );
  assert.deepEqual(replies[0].data.errors, [{ instanceUuid: "bad", error: "refused" }]);
  assert.deepEqual(calls, [
    ["one", "start"],
    ["two", "start"]
  ]);
  replies.length = 0;
  await handlers.get("instance/kill")({}, { instanceUuids: ["missing"] });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].ok, false);
  assert.match(replies[0].data.err, /missing/);
  replies.length = 0;
  await handlers.get("instance/stop")({}, { instanceUuids: ["one", "two"], disableResponse: true });
  assert.equal(replies.length, 0);
});
