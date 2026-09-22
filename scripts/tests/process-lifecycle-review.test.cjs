const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { spawn } = require("node:child_process");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const daemonRequire = Module.createRequire(path.join(root, "daemon/package.json"));
const ts = daemonRequire("typescript");
const logger = { info() {}, warn() {}, error() {} };
const base = "daemon/plugins/instance/src/backend/";
const settle = () => new Promise((resolve) => setImmediate(resolve));

function load(relative, overrides = {}, environment = {}) {
  const filename = path.join(root, relative);
  const mod = new Module(filename, module);
  mod.environment = environment;
  mod.require = (id) => Object.hasOwn(overrides, id) ? overrides[id] : daemonRequire(id);
  const globals = Object.keys(environment)
    .map((key) => `const ${key} = module.environment.${key};`).join("\n");
  mod._compile(globals + "\n" + ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: filename
  }).outputText, filename);
  return mod.exports;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function child() {
  const process = Object.assign(new EventEmitter(), {
    pid: 12,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    exitCode: null,
    signalCode: null,
    kills: 0,
    kill(signal) {
      this.kills++;
      this.signalCode = signal;
      this.emit("close", null, signal);
      return true;
    }
  });
  return process;
}

function processModule() {
  return load(base + "entity/commands/base/process_adapter.ts", {
    "mcsmanager-common": {
      killProcess: (_pid, child, signal) => child.kill(signal)
    }
  });
}

function ptyModule(overrides = {}, environment = {}) {
  return load(base + "entity/commands/pty/pty_start.ts", {
    "../../../const": { PTY_PATH: "missing-pty-helper" },
    "../../../i18n": { $t: (key) => key },
    "../../../service/log": logger,
    "../../../tools/system_user": { getRunAsUserParams: async () => ({}) },
    "../../instance/instance": {},
    "../base/command_parser": { commandStringToArray: (text) => [text] },
    "../base/process_adapter": processModule(),
    "../dispatcher": class {},
    "../general/general_start": class {},
    "../start": class {},
    ...overrides
  }, environment);
}

test("missing executables reject startup and release their child error listeners", async () => {
  const { ChildProcessAdapter, waitForSpawn } = processModule();
  const process = spawn(path.join(os.tmpdir(), "elements-nonexistent-start-command"), [], {
    windowsHide: true,
    stdio: "pipe"
  });
  const closed = new Promise((resolve) => process.once("close", resolve));
  const adapter = new ChildProcessAdapter(process);
  await assert.rejects(waitForSpawn(process), /ENOENT/);
  await adapter.destroy();
  await closed;
  assert.equal(process.listenerCount("error"), 0);
  assert.equal(process.listenerCount("exit"), 0);
  assert.equal(process.stdout.destroyed, true);
  assert.equal(process.stdin.destroyed, true);
});

test("process disposal preserves unrelated listeners and safely handles late stream errors", async () => {
  const { ChildProcessAdapter } = processModule();
  const process = child();
  const external = () => {};
  process.on("exit", external);
  process.kill = () => true;
  const adapter = new ChildProcessAdapter(process);
  await adapter.destroy();
  await adapter.destroy();
  assert.deepEqual(process.listeners("exit"), [external]);
  assert.doesNotThrow(() => process.emit("error", new Error("late kill error")));
  assert.doesNotThrow(() => process.stdin.emit("error", new Error("late EPIPE")));
  process.emit("close", 0);
  assert.equal(process.listenerCount("error"), 0);
});

test("process exit waits for the final large stdout block before releasing its streams", async () => {
  const { ChildProcessAdapter, waitForSpawn } = processModule();
  const size = 2 * 1024 * 1024;
  const process = spawn(global.process.execPath, ["-e", `process.stdout.end(Buffer.alloc(${size}, 120))`], {
    windowsHide: true, stdio: "pipe"
  });
  const adapter = new ChildProcessAdapter(process);
  let bytes = 0;
  adapter.on("data", (data) => { bytes += data.length; });
  const stopped = new Promise((resolve) => adapter.once("exit", () => {
    adapter.destroy();
    resolve();
  }));
  await waitForSpawn(process);
  await stopped;
  assert.equal(bytes, size);
});

test("ordinary and PTY startup reject missing programs before marking an instance running", async () => {
  const unavailable = path.join(os.tmpdir(), "elements-nonexistent-start-command");
  for (const kind of ["ordinary", "pty"]) {
    let closed;
    let process;
    const childProcess = {
      spawn(...args) {
        process = spawn(...args);
        closed = new Promise((resolve) => process.once("close", resolve));
        return process;
      }
    };
    let Startup;
    if (kind === "pty") {
      Startup = ptyModule({
        child_process: childProcess,
        "../../../const": { PTY_PATH: unavailable },
        "fs-extra": { existsSync: () => true },
        os: { platform: () => "win32" }
      }).default;
    } else {
      Startup = load(base + "entity/commands/general/general_start.ts", {
        child_process: childProcess,
        "../../../i18n": { $t: (key) => key },
        "../../../service/log": logger,
        "../../../tools/system_user": { getRunAsUserParams: async () => ({}) },
        "../base/command_parser": { commandStringToArray: (text) => [text] },
        "../base/process_adapter": processModule(),
        "../start": class {}
      }).default;
    }
    const instance = {
      config: {
        ie: "utf8", oe: "utf8", processType: "general", startCommand: unavailable,
        terminalOption: { pty: kind === "pty", ptyWindowCol: 100, ptyWindowRow: 40 }
      },
      hasCwdPath: () => true,
      absoluteCwdPath: () => os.tmpdir(),
      parseTextParams: async (text) => text,
      generateEnv: () => ({}),
      println() {},
      started() { assert.fail("failed spawn must not become running"); }
    };
    await assert.rejects(new Startup().createProcess(instance), /ENOENT/);
    await closed;
    assert.equal(process.listenerCount("error"), 0);
    assert.equal(process.listenerCount("exit"), 0);
  }
});

test("PTY handshake preserves following output and removes its timer and listeners", async () => {
  let timer;
  let cleared = false;
  const { default: PtyStart } = ptyModule({}, {
    setTimeout: (callback) => (timer = callback),
    clearTimeout: (callback) => { cleared = callback === timer; }
  });
  const process = child();
  const pending = new PtyStart().readPtySubProcessConfig(process);
  process.stdout.write(Buffer.from('{"pid":'));
  process.stdout.write(Buffer.from('321}\nserver ready\n'));
  assert.deepEqual(await pending, { pid: 321 });
  assert.equal(process.stdout.read().toString(), "server ready\n");
  assert.equal(cleared, true);
  assert.equal(process.listenerCount("error"), 0);
  assert.equal(process.listenerCount("exit"), 0);
  assert.equal(process.stdout.listenerCount("data"), 0);
});

test("PTY handshake rejects malformed, timed-out and prematurely exited helpers", async () => {
  for (const scenario of ["malformed", "timeout", "exit", "error"]) {
    let timeout;
    const { default: PtyStart } = ptyModule({}, {
      setTimeout: (callback) => (timeout = callback), clearTimeout() {}
    });
    const process = child();
    const pending = new PtyStart().readPtySubProcessConfig(process);
    const rejected = assert.rejects(pending);
    if (scenario === "malformed") process.stdout.write('{"pid":0}\n');
    if (scenario === "timeout") timeout();
    if (scenario === "exit") process.emit("exit", 1);
    if (scenario === "error") process.emit("error", new Error("cannot spawn"));
    await rejected;
    assert.equal(process.stdout.listenerCount("data"), 0);
    assert.equal(process.listenerCount("exit"), 0);
    assert.equal(process.listenerCount("error"), 0);
  }
});

test("PTY disposal cancels delayed pipe creation and closes an already pending file handle", async () => {
  const opening = deferred();
  const closed = [];
  const removed = [];
  let openCalls = 0;
  let timer;
  let cleared;
  const { GoPtyProcessAdapter } = ptyModule({
    os: { platform: () => "linux" },
    "fs-extra": {
      constants: fs.constants,
      open: () => { openCalls++; return opening.promise; },
      close: async (fd) => { closed.push(fd); },
      remove: async (file) => { removed.push(file); },
      createWriteStream() { assert.fail("a disposed adapter must not create a pipe stream"); }
    }
  }, {
    setTimeout: (callback) => (timer = callback),
    clearTimeout: (callback) => { cleared = callback; }
  });
  const firstChild = child();
  const first = new GoPtyProcessAdapter(firstChild, 20, "/tmp/first-pipe");
  first.attachOutput();
  await first.destroy();
  assert.equal(cleared, timer);
  assert.equal(openCalls, 0);

  const secondChild = child();
  const second = new GoPtyProcessAdapter(secondChild, 21, "/tmp/second-pipe");
  second.attachOutput();
  timer();
  const cleanup = second.destroy();
  assert.equal(second.destroy(), cleanup);
  opening.resolve(17);
  await cleanup;
  assert.deepEqual(closed, [17]);
  assert.deepEqual(removed, ["/tmp/first-pipe", "/tmp/second-pipe"]);
  assert.equal(secondChild.listenerCount("exit"), 0);
});

test("missing PTY helpers fall back within the original startup state and lock", async () => {
  let fallback = 0;
  const { default: PtyStart } = ptyModule({
    "fs-extra": { existsSync: (name) => name !== "missing-pty-helper" },
    "../general/general_start": class {
      async createProcess(instance) {
        assert.equal(instance.status(), 2);
        fallback++;
      }
    }
  });
  const instance = {
    config: { ie: "utf8", oe: "utf8", startCommand: "server", terminalOption: { pty: true } },
    status: () => 2,
    hasCwdPath: () => true,
    absoluteCwdPath: () => path.resolve(os.tmpdir()),
    println() {},
    forceExec: async () => {},
    execPreset() { assert.fail("cannot reenter the start preset while starting"); }
  };
  await new PtyStart().createProcess(instance);
  assert.equal(instance.config.terminalOption.pty, false);
  assert.equal(fallback, 1);
});

test("startup claims its state before directory creation and waits for failed startup cleanup", async () => {
  const directory = deferred();
  const cleanup = deferred();
  const { default: Start } = load(base + "entity/commands/start.ts", {
    "fs-extra": { existsSync: () => false, mkdirs: () => directory.promise },
    "../../i18n": { $t: (key) => key },
    "../../service/disk_limit_service": {},
    "../instance/instance": { STATUS_STOP: 0, STATUS_STARTING: 2 },
    "./base/command": class {}
  }, { setTimeout: (callback) => { callback(); } });
  let status = 0;
  let lock = false;
  let created = 0;
  const instance = {
    config: {}, startCount: 0,
    status(value) { if (value != null) status = value; return status; },
    setLock(value) { if (value && lock) throw new Error("locked"); lock = value; },
    absoluteCwdPath: () => "/unused",
    println() {},
    releaseResources: () => cleanup.promise,
    failure(error) { throw error; },
    execPreset() { assert.fail("startup failure must not enqueue a delayed kill"); }
  };
  class FailingStart extends Start {
    async createProcess() { created++; throw new Error("start failed"); }
  }
  const start = new FailingStart();
  const first = start.exec(instance);
  await assert.rejects(start.exec(instance), /TXT_CODE_start.instanceNotDown/);
  directory.resolve();
  await settle();
  assert.equal(status, 2);
  assert.equal(lock, true);
  const rejection = assert.rejects(first, /start failed/);
  cleanup.resolve();
  await rejection;
  assert.equal(status, 0);
  assert.equal(lock, false);
  assert.equal(created, 1);
  assert.equal(instance.startTimestamp, 0);
});

function lifecycle() {
  return load(base + "entity/instance/life_cycle.ts", { "../../service/log": logger });
}

test("lifecycle retries a failed start after cleanup and waits for replaced tasks to stop", async () => {
  const { LifeCycleTaskManager } = lifecycle();
  const manager = new LifeCycleTaskManager({});
  const events = [];
  const ending = deferred();
  let starts = 0;
  const task = {
    name: "old", status: 0,
    async start() {
      events.push("start");
      if (++starts === 1) throw new Error("partially initialized");
    },
    async stop() {
      events.push("stop");
      if (starts === 2) await ending.promise;
    }
  };
  manager.registerLifeCycleTask(task);
  await manager.execLifeCycleTask(1);
  assert.equal(task.status, 0);
  await manager.execLifeCycleTask(1);
  assert.equal(task.status, 1);
  const stopped = manager.clearLifeCycleTask();
  manager.registerLifeCycleTask({
    name: "new", status: 0,
    async start() { events.push("new"); }, async stop() {}
  });
  const started = manager.execLifeCycleTask(1);
  await settle();
  assert.deepEqual(events, ["start", "stop", "start", "stop"]);
  ending.resolve();
  await Promise.all([stopped, started]);
  assert.deepEqual(events, ["start", "stop", "start", "stop", "new"]);
});

function instanceFixture() {
  const saved = [];
  const logs = [];
  const { default: Instance } = load(base + "entity/instance/instance.ts", {
    "mcsmanager-common": {},
    "../../common/string_cache": { CircularBuffer: class {
      getCache() { return { items: [], wasDeleted: false }; }
      clear() {} pushLog() {}
    } },
    "../../common/system_storage": { store: (...args) => saved.push(args) },
    "../../const": {},
    "../../i18n": { $t: (key) => key },
    "../../service/java_access": {},
    "../../service/log": { ...logger, error: (...args) => logs.push(args) },
    "../commands/base/command_parser": {},
    "../commands/dispatcher": {},
    "../commands/task/openfrp": {},
    "../config": { globalConfiguration: { config: { outputBufferSize: 256 } } },
    "./Instance_config": {},
    "./life_cycle": lifecycle(),
    "./preset": { PresetCommandManager: class {} }
  }, { setInterval: () => 1, clearInterval() {} });
  const instance = new Instance("test", {
    nickname: "test", oe: "utf8", terminalOption: { pty: false },
    eventTask: { autoRestart: false, ignore: false }, docker: {}
  });
  const output = [];
  instance.on("data", (text) => output.push(text));
  return { instance, Instance, saved, output, logs };
}

test("instance exit waits for asynchronous destruction, reports quick exits and preserves file work", async () => {
  const { instance, Instance, saved, output } = instanceFixture();
  const cleanup = deferred();
  let destroyed = 0;
  const process = Object.assign(new EventEmitter(), {
    destroy() { destroyed++; return cleanup.promise; }, pid: 4
  });
  const exits = [];
  instance.on("exit", (event) => exits.push(event));
  instance.started(process);
  instance.info.fileLock = 2;
  const stopped = instance.stopped(1);
  assert.equal(instance.stopped(1), stopped);
  await settle();
  assert.equal(instance.status(), Instance.STATUS_STOPPING);
  assert.deepEqual(exits, []);
  cleanup.resolve();
  await stopped;
  assert.equal(instance.status(), Instance.STATUS_STOP);
  assert.equal(destroyed, 1);
  assert.equal(instance.startTimestamp, 0);
  assert.equal(instance.info.fileLock, 2);
  assert.deepEqual(exits, [{ code: 1, isCrash: true }]);
  assert.equal(saved.length, 1);
  assert.ok(output.some((text) => text.includes("TXT_CODE_aae2918f")));
});

test("rejected destruction is handled and intentional stops do not report quick-exit warnings", async () => {
  const { instance, Instance, output, logs } = instanceFixture();
  instance.started(Object.assign(new EventEmitter(), {
    destroy: async () => { throw new Error("remove failed"); }, pid: 5
  }));
  instance.setUserRequestedStop(true);
  await instance.stopped(0);
  assert.equal(instance.status(), Instance.STATUS_STOP);
  assert.equal(logs.length, 1);
  assert.equal(output.some((text) => text.includes("TXT_CODE_aae2918f")), false);
});

test("new schedules reject unknown actions but restore optional plugin actions from storage", () => {
  const jobs = [];
  const scheduler = load(base + "service/system_instance_control.ts", {
    "node-schedule": {},
    "../common/system_storage": { list: () => [], store() {}, delete() {} },
    "../entity/instance/instance": {},
    "../i18n": { $t: (key) => key },
    "../utils/sleep": {},
    "./file_access": { fileSubsystem: () => ({ FileManager: { checkFileName: () => true } }) },
    "./log": logger,
    "../plugin/context": { ctx: { schedules: new Map() } },
    "./system_instance": {}
  }, {
    setInterval(callback) { jobs.push(callback); return jobs.length; }, clearInterval() {}
  }).default;
  const task = {
    instanceUuid: "instance", name: "task", count: 1, time: "3", type: 1,
    actions: [{ type: "missing-plugin-action", payload: "" }]
  };
  assert.throws(() => scheduler.registerScheduleJob(task), /crateTaskErr/);
  assert.equal(jobs.length, 0);
  scheduler.registerScheduleJob(task, false);
  assert.equal(scheduler.listScheduleJob("instance").length, 1);
  scheduler.dispose();
});
