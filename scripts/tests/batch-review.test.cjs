const { from, createLoader, deferred, settle } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const { test } = require("node:test");

const panelRequire = from("panel");
const ts = panelRequire("typescript");
const load = createLoader({ compiler: ts });

test("batch forwarding waits for other nodes after one fails", async () => {
  const { multiOperationForwarding } = load(
    "plugins/instance/panel/src/backend/service/instance_service.ts",
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

test("panel batch routes return immediately and process every instance in the background", async () => {
  for (const operation of ["open", "stop", "kill", "restart"]) {
    const firstRequest = deferred();
    const completed = deferred();
    const logged = [],
      calls = [],
      warnings = [];
    let operatorName = "admin";
    const runtime = {
      $t: (key) => key,
      roles: () => ({ ADMIN: 10, USER: 1 }),
      middleware: () => ({
        permission: () => async (_ctx, next) => next(),
        validator: () => async (_ctx, next) => next()
      }),
      identity: () => ({ identify: () => ({ userName: operatorName }) }),
      operations: () => ({ log: (...args) => logged.push(args) }),
      core: () => ({
        logger: {
          warn: (...args) => {
            warnings.push(args);
            completed.resolve();
          }
        }
      }),
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
            if (instanceUuid === "one") await firstRequest.promise;
            if (instanceUuid === "failed") throw new Error("command failed");
            return { instances: [{ instanceUuid, nickname: instanceUuid }] };
          }
        }
      })
    };
    const service = load("plugins/instance/panel/src/backend/service/instance_service.ts", {
      "mcsmanager-common": {},
      "../runtime": runtime
    });
    const { createInstanceAdminRouter } = load(
      "plugins/instance/panel/src/backend/routers/instance_admin_router.ts",
      {
        "../runtime": runtime,
        "../service/instance_service": service
      }
    );
    const router = createInstanceAdminRouter();
    const route = router.stack.find((item) => item.path === `/instance/multi_${operation}`);
    const handler = panelRequire("koa-compose")(route.stack);
    const ctx = {
      ip: "127.0.0.1",
      request: {
        body: ["one", "one", "failed", "three"].map((instanceUuid) => ({
          daemonId: "node",
          instanceUuid
        }))
      }
    };
    let returned = false;
    const response = handler(ctx).then(() => {
      returned = true;
    });
    await settle();
    assert.equal(returned, true);
    assert.equal(ctx.body, true);
    assert.deepEqual(calls, [["node", `instance/${operation}`, ["one"]]]);
    assert.equal(logged.length, 0);
    assert.equal(warnings.length, 0);
    await response;

    ctx.ip = "changed";
    operatorName = "changed";
    firstRequest.resolve();
    await completed.promise;
    assert.equal(ctx.body, true);
    assert.deepEqual(
      calls.map((call) => call[2][0]),
      ["one", "failed", "three"]
    );
    assert.deepEqual(
      logged.map((call) => call[1].instance_id),
      ["one", "three"]
    );
    assert.ok(
      logged.every(
        (call) => call[1].operator_ip === "127.0.0.1" && call[1].operator_name === "admin"
      )
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0][1].message, /node\/failed: command failed/);

    for (const body of [null, [{ daemonId: "node", instanceUuid: "one" }, { daemonId: "node" }]]) {
      await assert.rejects(
        handler({ request: { body } }),
        /Instances must be an array|Invalid instance reference/
      );
      assert.equal(calls.length, 3);
    }
  }
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
  load("plugins/instance/daemon/src/backend/routers/Instance_router.ts", {
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
