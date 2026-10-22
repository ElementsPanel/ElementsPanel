const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const root = path.resolve(__dirname, "../..");
const panelRequire = Module.createRequire(path.join(root, "panel/package.json"));
const ts = panelRequire("typescript");

function load(relative, overrides = {}) {
  const filename = path.join(root, relative);
  const mod = new Module(filename, module);
  mod.require = (id) => (Object.hasOwn(overrides, id) ? overrides[id] : panelRequire(id));
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
const { BackgroundTasks } = load("daemon/plugins/runtime/src/backend/service/background_tasks.ts");
const settle = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const input = (owner = "alice") => ({
  _taskOwner: owner,
  instanceUuid: "instance",
  fileName: "example.jar"
});

test("detached mod downloads retain their user, progress and real completion after the response", async () => {
  const tasks = new BackgroundTasks();
  const download = deferred();
  const progress = { current: 4, total: 10 };
  tasks.runRequest("instance/mods/install", input(), () => {
    tasks.follow(download.promise);
    tasks.progress(() => progress);
    return true;
  });
  await settle();
  assert.equal(tasks.list("alice")[0].state, "running");
  assert.equal(tasks.list("alice")[0].current, 4);
  assert.deepEqual(tasks.list("bob"), []);
  assert.equal("owner" in tasks.list("alice")[0], false);
  progress.current = 10;
  download.resolve();
  await settle();
  assert.equal(tasks.list("alice")[0].state, "completed");
  assert.equal(tasks.list("alice")[0].current, 10);
  tasks.clear("bob");
  assert.equal(tasks.list("alice").length, 1);
  tasks.clear("alice");
  assert.deepEqual(tasks.list("alice"), []);
});

test("concurrent async task scopes cannot mix owners or premature completion", async () => {
  const tasks = new BackgroundTasks();
  const first = deferred(),
    second = deferred();
  const pending = tasks.runRequest(
    "file/compress",
    { ...input(), type: 2, source: "data.zip" },
    async () => {
      await first.promise;
      tasks.follow(second.promise);
    }
  );
  tasks.runRequest("file/download_from_url", input("bob"), () => {});
  first.resolve();
  await pending;
  await settle();
  assert.equal(tasks.list("alice")[0].state, "running");
  assert.equal(tasks.list("alice")[0].kind, "extract");
  assert.equal(tasks.list("bob")[0].state, "completed");
  tasks.clear("alice");
  assert.equal(tasks.list("alice").length, 1);
  second.reject(new Error("Disk full"));
  await settle();
  assert.equal(tasks.list("alice")[0].state, "failed");
  assert.equal(tasks.list("alice")[0].error, "Disk full");
});

test("cancellation only reaches the owner's running task and survives late abort rejection", async () => {
  const tasks = new BackgroundTasks();
  const download = deferred();
  let cancelled = 0;
  tasks.runRequest("file/download_from_url", input(), () => {
    tasks.follow(download.promise);
    tasks.progress(
      () => ({ current: 1, total: 2 }),
      () => {
        cancelled++;
      }
    );
  });
  const { id } = tasks.list("alice")[0];
  assert.equal(tasks.cancel("bob", id), false);
  assert.equal(cancelled, 0);
  assert.equal(tasks.cancel("alice", id), true);
  assert.equal(cancelled, 1);
  download.reject(new Error("Aborted"));
  await settle();
  assert.equal(tasks.list("alice")[0].state, "cancelled");
  assert.equal(tasks.cancel("alice", id), false);
});

test("protocol errors recorded without throwing do not turn into successful tasks", async () => {
  const tasks = new BackgroundTasks();
  tasks.runRequest("file/compress", input(), () => tasks.fail("Archive damaged"));
  await settle();
  assert.equal(tasks.list("alice")[0].state, "failed");
  assert.equal(tasks.list("alice")[0].error, "Archive damaged");
  tasks.runRequest("file/status", input(), () => {});
  tasks.runRequest("file/compress", {}, () => {});
  assert.equal(tasks.list("alice").length, 1);
});

const panelTasks = load("panel/plugins/node/src/backend/background_tasks.ts");
function panelFixture() {
  const tasks = new BackgroundTasks();
  const handlers = new Map();
  const node = { uuid: "node", available: true, config: { remarks: "Node" } };
  const ctx = {
    roles: { USER: 1 },
    identity: {
      of: (request) => ({ uuid: request.user, elevated: false }),
      canAccessInstance: (request, _daemon, instance) => request.allowed.includes(instance)
    },
    middleware: {
      permission: () => async (request, next) => {
        if (request.user) await next();
        else request.status = 403;
      },
      validator: () => async (_request, next) => next()
    },
    koa: {
      use() {},
      router: () =>
        Object.fromEntries(
          ["get", "post", "delete"].map((method) => [
            method,
            (url, ...stack) => {
              handlers.set(`${method} ${url}`, async (request) => {
                const dispatch = (index) => stack[index]?.(request, () => dispatch(index + 1));
                await dispatch(0);
              });
            }
          ])
        )
    },
    remote: {
      services: { services: new Map([["node", node]]), getInstance: () => node },
      Request: class {
        async request(event, data) {
          if (event === "tasks/list") return tasks.list(data.owner);
          if (event === "tasks/cancel") return tasks.cancel(data.owner, data.id);
          if (event === "tasks/clear") tasks.clear(data.owner);
        }
      }
    }
  };
  panelTasks.registerBackgroundTaskRoutes(ctx);
  const request = (user = "alice", allowed = ["instance"]) => ({
    user,
    allowed,
    request: { body: {} }
  });
  return { tasks, handlers, request, ctx };
}

test("the panel aggregates across nodes, filters revoked instances and never accepts another owner", async () => {
  const { tasks, handlers, request, ctx } = panelFixture();
  tasks.runRequest("file/compress", input(), () => {});
  tasks.runRequest("file/compress", input("bob"), () => {});
  tasks.runRequest("file/compress", { ...input(), instanceUuid: "revoked" }, () => {});
  await settle();
  ctx.remote.services.services.set("offline", { uuid: "offline", available: false, config: {} });
  const alice = request();
  await handlers.get("get /")(alice);
  assert.equal(alice.body.tasks.length, 1);
  assert.equal(alice.body.tasks[0].daemonId, "node");
  assert.equal(alice.body.unavailable, true);
  const revoked = request("alice", []);
  await handlers.get("get /")(revoked);
  assert.equal(revoked.body.tasks.length, 0);
  const guest = request("");
  await handlers.get("get /")(guest);
  assert.equal(guest.status, 403);
  const bob = request("bob");
  bob.request.body = { daemonId: "node", id: alice.body.tasks[0].id, owner: "alice" };
  await handlers.get("post /cancel")(bob);
  assert.equal(bob.status, 403);
});

test("remote requests attach the authenticated user instead of caller-supplied task ownership", async () => {
  const sent = [];
  const socket = new EventEmitter();
  socket.connected = true;
  socket.emit = (event, packet) => {
    sent.push(packet.data);
    queueMicrotask(() =>
      EventEmitter.prototype.emit.call(socket, event, {
        uuid: packet.uuid,
        status: 200,
        data: true
      })
    );
    return true;
  };
  const { default: Request } = load("panel/plugins/node/src/backend/remote_command.ts", {
    "./background_tasks": panelTasks,
    "./runtime": {
      $t: (key) => key,
      core: () => ({ identity: { of: (request) => ({ uuid: request.user }) } })
    },
    "./remote_entity": { default: { STATUS_OK: 200 }, __esModule: true }
  });
  const rpc = new Request({
    socket,
    available: true,
    config: { ip: "node" },
    pendingRequests: new Set()
  });
  await panelTasks.taskRequestScope.run({ user: "alice" }, () =>
    rpc.request("file/compress", { _taskOwner: "bob" })
  );
  await panelTasks.taskRequestScope.run({ user: "bob" }, () => rpc.request("file/compress", {}));
  assert.deepEqual(
    sent.map((data) => data._taskOwner),
    ["alice", "bob"]
  );
});

test("the browser discards stale task responses when the active account changes", async () => {
  const frontendRequire = Module.createRequire(path.join(root, "frontend/package.json"));
  const vue = frontendRequire("vue");
  const state = vue.reactive({ userInfo: { uuid: "alice" } });
  const alice = deferred(),
    bob = deferred();
  let nextResponse = alice;
  const { useBackgroundTasks } = load("panel/plugins/console/src/stores/useBackgroundTasks.ts", {
    vue,
    "@vueuse/core": frontendRequire("@vueuse/core"),
    "@/services/apiService": { apiService: { subscribe: () => nextResponse.promise } },
    "./useAppStateStore": { useAppStateStore: () => ({ state, isLogged: vue.ref(true) }) }
  });
  const store = useBackgroundTasks();
  const first = store.refresh();
  state.userInfo.uuid = "bob";
  store.reset();
  nextResponse = bob;
  const second = store.refresh();
  alice.resolve({ tasks: [{ id: "alice-private", state: "running" }], unavailable: false });
  await first;
  assert.deepEqual(store.tasks.value, []);
  assert.equal(store.loading.value, true);
  bob.resolve({ tasks: [{ id: "bob-task", state: "running" }], unavailable: false });
  await second;
  assert.equal(store.tasks.value[0].id, "bob-task");
  assert.equal(store.activeCount.value, 1);
  store.open.value = true;
  store.reset();
  assert.equal(store.open.value, false);
  assert.deepEqual(store.tasks.value, []);
});
