const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");
const root = path.resolve(__dirname, "../..");
const panelRequire = Module.createRequire(path.join(root, "panel/package.json"));
const ts = panelRequire("typescript");

function load(relative) {
  const filename = path.join(root, relative);
  const mod = new Module(filename, module);
  mod.require = (id) => panelRequire(id);
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
const tickets = load("panel/plugins/node/src/backend/task_ticket.ts");
const stream = load("panel/plugins/node/src/backend/task_stream.ts");

const input = (owner = "alice") => ({
  _taskOwner: owner,
  instanceUuid: "instance",
  fileName: "example.jar"
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const nextChanged = (tasks) =>
  new Promise((resolve) => tasks.once("changed", resolve));

// The push timers are unref'd so a daemon can idle-exit; a test process has no
// other handle, so hold the loop open while an event is expected.
const keepAlive = (t, ms = 4000) => {
  const timer = setTimeout(() => {}, ms);
  t.after(() => clearTimeout(timer));
};

test("task changes are pushed as per-owner snapshots and progress follows the tick", async (t) => {
  keepAlive(t);
  const tasks = new BackgroundTasks();
  t.after(() => tasks.dispose());
  const work = deferred();
  const progress = { current: 1, total: 10 };

  const created = nextChanged(tasks);
  tasks.runRequest("file/download_from_url", input(), () => {
    tasks.follow(work.promise);
    tasks.progress(() => progress);
  });

  const first = await created;
  assert.equal(first.owner, "alice");
  assert.equal(first.tasks.length, 1);
  assert.equal(first.tasks[0].state, "running");
  assert.equal(first.tasks[0].current, 1);
  assert.equal("owner" in first.tasks[0], false);

  progress.current = 4;
  const ticked = await nextChanged(tasks);
  assert.equal(ticked.tasks[0].current, 4);

  const finished = nextChanged(tasks);
  work.resolve();
  const final = await finished;
  assert.equal(final.tasks[0].state, "completed");
});

test("clearing finished tasks sends an empty snapshot", async (t) => {
  keepAlive(t);
  const tasks = new BackgroundTasks();
  t.after(() => tasks.dispose());
  const work = deferred();
  tasks.runRequest("file/compress", input(), () => tasks.follow(work.promise));
  await nextChanged(tasks);
  work.resolve();
  await nextChanged(tasks);

  const cleared = nextChanged(tasks);
  tasks.clear("alice");
  const snapshot = await cleared;
  assert.deepEqual(snapshot.tasks, []);
});

test("dispose drops the task table and the change listener", async (t) => {
  keepAlive(t);
  const tasks = new BackgroundTasks();
  const changed = nextChanged(tasks);
  tasks.runRequest("file/compress", input(), () => {});
  await changed;
  tasks.dispose();
  assert.equal(tasks.listenerCount("changed"), 0);
  assert.deepEqual(tasks.list("alice"), []);
});

test("task tickets are bound to the caller and swept after expiry", () => {
  const issued = tickets.issueTaskTicket({ uuid: "alice", elevated: false });
  assert.equal(typeof issued.ticket, "string");
  assert.ok(issued.expiresAt > Date.now());
  assert.deepEqual(tickets.verifyTaskTicket(issued.ticket), {
    uuid: "alice",
    elevated: false
  });
  assert.equal(tickets.verifyTaskTicket("missing"), undefined);
  assert.equal(tickets.verifyTaskTicket(42), undefined);
  tickets.sweepTaskTickets(Date.now() + 6 * 60_000);
  assert.equal(tickets.verifyTaskTicket(issued.ticket), undefined);
  tickets.disposeTaskTickets();
});

test("pushed tasks follow the same visibility rules as the HTTP route", () => {
  const admin = { permission: 10 };
  const owner = {
    permission: 1,
    instances: [{ daemonId: "node", instanceUuid: "instance" }]
  };
  const tasks = [
    { id: "one", instanceUuid: "instance" },
    { id: "two", instanceUuid: "other" },
    { id: "three" }
  ];

  assert.deepEqual(stream.visibleTasks("node", tasks, admin), tasks);
  assert.deepEqual(
    stream.visibleTasks("node", tasks, owner).map((task) => task.id),
    ["one"]
  );
  assert.deepEqual(stream.visibleTasks("other-node", tasks, owner), []);
  assert.deepEqual(stream.visibleTasks("node", tasks, undefined), []);
});

test("only well-formed daemon snapshots reach the installed sink", () => {
  const seen = [];
  stream.setTaskStreamSink({
    tasks: (...args) => seen.push(args),
    availability: () => seen.push("availability")
  });
  stream.publishTasks("node", "Node", { owner: "alice", tasks: [{ id: "task" }] });
  stream.publishTasks("node", "Node", undefined);
  stream.publishTasks("node", "Node", { owner: "alice" });
  stream.publishAvailability();
  assert.deepEqual(seen, [
    ["node", "Node", { owner: "alice", tasks: [{ id: "task" }] }],
    "availability"
  ]);
  stream.setTaskStreamSink(undefined);
  stream.publishAvailability();
  assert.equal(seen.length, 2);
});
