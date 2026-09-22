const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { EventEmitter, once } = require("node:events");
const { PassThrough } = require("node:stream");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const commonRequire = Module.createRequire(path.join(root, "common/package.json"));
const ts = commonRequire("typescript");

function load(file, overrides = {}, environment = {}) {
  const filename = path.join(root, file);
  const mod = new Module(filename, module);
  const localRequire = Module.createRequire(filename);
  mod.require = (id) => (Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id));
  mod.environment = environment;
  const globals = Object.keys(environment)
    .map((key) => `const ${key} = module.environment.${key};`)
    .join("\n");
  mod._compile(
    globals +
      "\n" +
      ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true
        },
        fileName: filename
      }).outputText,
    filename
  );
  return mod.exports;
}

function storageFixture(t, overrides) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-storage-review-"));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("elements-storage-review-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const { default: Storage } = load("common/src/system_storage.ts", overrides);
  Storage.DATA_PATH = path.join(directory, "data");
  return { directory, storage: new Storage() };
}

test("storage writes nested histories, restores defaults and lists only complete JSON entities", (t) => {
  const { storage, directory } = storageFixture(t);
  class Config {
    nickname = "default";
    nested = { enabled: true, count: 1 };
    optional = null;
  }
  storage.store("Config", "one", {
    nickname: "saved",
    nested: { count: 2 },
    optional: { value: 3 },
    extra: true
  });
  const value = storage.load("Config", Config, "one");
  assert.deepEqual(
    value,
    Object.assign(new Config(), {
      nickname: "saved",
      nested: { enabled: true, count: 2 },
      optional: { value: 3 }
    })
  );
  storage.writeFile("logs/node/instance.jsonl", '{"event":"created"}\n');
  assert.match(storage.readFile("logs/node/instance.jsonl"), /created/);
  storage.writeFile("Config/one.json.backup", "old");
  storage.writeFile("Config/one.json.partial.tmp", "unfinished");
  fs.mkdirSync(path.join(directory, "data/Config/directory.json"));
  assert.deepEqual(storage.list("Config"), ["one"]);
  assert.equal(storage.load("Config", Config, "missing"), null);
});

test("storage rejects traversal and cannot delete its root or a neighbouring directory", (t) => {
  const { storage, directory } = storageFixture(t);
  const outside = path.join(directory, "outside.json");
  fs.writeFileSync(outside, "keep");
  for (const filename of [
    "",
    ".",
    "..",
    "../outside.json",
    outside,
    "C:\\outside.json",
    "Config/a:stream",
    "a\0b"
  ]) {
    assert.throws(() => storage.deleteFile(filename), /Invalid storage path/);
    assert.throws(() => storage.writeFile(filename, "bad"), /Invalid storage path/);
  }
  for (const id of ["../outside", "a/b", "a\\b", "a:stream", "", null]) {
    assert.throws(() => storage.delete("Config", id), /UUID/);
    assert.throws(() => storage.store("Config", id, {}), /UUID/);
  }
  assert.throws(() => storage.store("../outside", "entity", {}), /Invalid storage path/);
  assert.equal(fs.readFileSync(outside, "utf8"), "keep");
});

test("a failed atomic replacement preserves the prior settings and cleans its temporary file", (t) => {
  const fse = commonRequire("fs-extra");
  let fail = false;
  const { storage, directory } = storageFixture(t, {
    "fs-extra": {
      ...fse,
      renameSync(source, target) {
        if (fail) throw new Error("disk replacement failed");
        return fse.renameSync(source, target);
      }
    }
  });
  storage.store("Config", "global", { value: "original" });
  fail = true;
  assert.throws(() => storage.store("Config", "global", { value: "new" }), /replacement failed/);
  assert.deepEqual(JSON.parse(storage.readFile("Config/global.json")), { value: "original" });
  assert.deepEqual(fs.readdirSync(path.join(directory, "data/Config")), ["global.json"]);
});

test("pagination rejects zero, negative and non-finite sizes and handles typed search values", () => {
  const { QueryMapWrapper, LocalFileSource } = load("common/src/query_wrapper.ts");
  const data = [
    { name: "Alice", value: null },
    { name: "Bob", value: false },
    { name: "Bobby", value: 3 }
  ];
  const map = new QueryMapWrapper(new Map(data.map((value, i) => [i, value])));
  const source = new LocalFileSource(data);
  for (const wrapper of [map, source]) {
    for (const value of [0, -1, NaN, Infinity, 0.5, "10"]) {
      assert.throws(() => wrapper.page(data, 1, value), /positive integers/);
      assert.throws(() => wrapper.page(data, value, 10), /positive integers/);
    }
    assert.deepEqual(wrapper.page(data, 2, 2), {
      page: 2,
      pageSize: 2,
      maxPage: 2,
      total: 3,
      data: [data[2]]
    });
    assert.equal(wrapper.page([], 1, 10).maxPage, 0);
    assert.deepEqual(wrapper.page(data, 5, 2).data, []);
  }
  assert.deepEqual(source.select({ value: null }), [data[0]]);
  assert.deepEqual(source.select({ value: false }), [data[1]]);
  assert.deepEqual(source.select({ name: "%Bob%" }), data.slice(1));
  assert.deepEqual(source.select({ value: "%3%" }), []);
  assert.equal(source.selectPage({ name: "%Bob%" }, 1, 1).total, 2);
});

test("process wrapper rejects a missing executable without an unhandled child error", async () => {
  const { ProcessWrapper } = load("common/src/process_tools.ts");
  const wrapper = new ProcessWrapper(
    path.join(os.tmpdir(), "elements-nonexistent-executable"),
    [],
    os.tmpdir()
  );
  const running = wrapper.start();
  const closed = once(wrapper.process, "close").catch(() => {});
  await assert.rejects(running, /task start error.*ENOENT/);
  await closed;
});

test("process wrapper drains split UTF-8 output and records successful and failed exit codes", async () => {
  const { ProcessWrapper } = load("common/src/process_tools.ts");
  const wrapper = new ProcessWrapper(
    process.execPath,
    [
      "-e",
      "const b=Buffer.from('你好'); process.stdout.write(b.subarray(0,2)); setTimeout(()=>process.stdout.write(b.subarray(2)),20)"
    ],
    os.tmpdir()
  );
  let output = "";
  wrapper.on("data", (text) => {
    output += text;
  });
  const running = wrapper.start();
  await assert.rejects(wrapper.start(), /already running/);
  assert.equal(await running, true);
  assert.equal(output, "你好");
  assert.equal(wrapper.status(), true);
  assert.equal(wrapper.exitCode(), 0);
  assert.equal(wrapper.process, undefined);
  const failing = new ProcessWrapper(process.execPath, ["-e", "process.exit(2)"], os.tmpdir());
  await assert.rejects(failing.start(), /task error/);
  assert.equal(failing.exitCode(), 2);
});

test("a process timeout kills its child once and invalid PIDs never reach an operating-system command", async () => {
  const child = new EventEmitter();
  Object.assign(child, {
    pid: 123,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    exitCode: null,
    signalCode: null
  });
  let killed = 0;
  child.kill = () => {
    killed++;
    child.signalCode = "SIGKILL";
    child.stdout.end();
    child.stderr.end();
    child.emit("exit", null);
    setImmediate(() => child.emit("close", null));
    return true;
  };
  const { ProcessWrapper, killProcess } = load("common/src/process_tools.ts", {
    child_process: {
      spawn: () => {
        setImmediate(() => child.emit("spawn"));
        return child;
      }
    },
    os: { platform: () => "linux" },
    process: { kill: () => child.kill() }
  });
  for (const pid of [0, -1, "1 & echo bad", NaN, Infinity])
    assert.throws(() => killProcess(pid, child), /Invalid process ID/);
  const wrapper = new ProcessWrapper("fake", [], ".", 0.01);
  await assert.rejects(wrapper.start(), /timeout/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(killed, 1);
  assert.equal(wrapper.process, undefined);
});

function pingFixture() {
  const socket = new EventEmitter();
  socket.write = () => {};
  socket.destroy = () => {
    socket.destroyed = true;
    socket.emit("close");
  };
  let expire;
  const { default: Ping } = load(
    "common/src/mcping.ts",
    { net: { connect: () => socket } },
    {
      setTimeout: (callback) => {
        expire = callback;
        return 1;
      },
      clearTimeout() {}
    }
  );
  return { socket, ping: new Ping(25565, "localhost"), expire: () => expire() };
}

test("Minecraft status decodes fragmented UTF-16 responses and shares in-flight requests", async () => {
  const { ping, socket } = pingFixture();
  const text = "§1\0" + "127\0" + "1.21\0" + "你好 世界\0" + "2\0" + "20";
  const payload = Buffer.from(text, "utf16le").swap16();
  const header = Buffer.alloc(3);
  header[0] = 0xff;
  header.writeUInt16BE(payload.length / 2, 1);
  const packet = Buffer.concat([header, payload]);
  const pending = ping.getStatus();
  assert.equal(ping.getStatus(), pending);
  for (let i = 0; i < packet.length; i += 3) socket.emit("data", packet.subarray(i, i + 3));
  const response = await pending;
  assert.equal(response.motd, "你好 世界");
  assert.equal(response.version, "1.21");
  assert.equal(response.current_players, 2);
  assert.equal(response.max_players, 20);
  assert.equal(response.online, true);
  assert.equal(socket.destroyed, true);
  assert.equal(ping.client, undefined);
});

test("Minecraft malformed, partial and timed-out responses reject and close their sockets", async () => {
  for (const scenario of ["invalid", "partial", "timeout"]) {
    const f = pingFixture();
    const pending = f.ping.getStatus();
    const rejection = assert.rejects(pending, /Invalid|Incomplete|timed out/);
    if (scenario === "invalid") f.socket.emit("data", Buffer.from([0, 0, 0]));
    if (scenario === "partial") {
      f.socket.emit("data", Buffer.from([0xff, 0, 20]));
      f.socket.emit("close");
    }
    if (scenario === "timeout") f.expire();
    await rejection;
    assert.equal(f.socket.destroyed, true);
    assert.equal(f.ping.status.online, false);
  }
});

test("instance stream subscriptions are idempotent and disconnect releases all instance references", () => {
  const { default: Streams } = load("common/src/instance_stream.ts");
  const streams = new Streams();
  const socket = Object.assign(new EventEmitter(), { id: "client", connected: true });
  let received = 0;
  socket.on("instance/stdout", () => received++);
  for (let i = 0; i < 20; i++) streams.requestForward(socket, String(i));
  streams.requestForward(socket, "0");
  assert.equal(socket.listenerCount("disconnect"), 1);
  streams.forward("0", "test");
  assert.equal(received, 1);
  streams.cannelForward(socket, "0");
  streams.cannelForward(socket, "0");
  assert.equal(streams.listenMap.has("0"), false);
  socket.connected = false;
  socket.emit("disconnect");
  assert.equal(streams.listenMap.size, 0);
  assert.equal(socket.listenerCount("disconnect"), 0);
});

test("storage rejects directory links that escape the configured data root", (t) => {
  const { storage, directory } = storageFixture(t);
  const outside = path.join(directory, "outside");
  fs.mkdirSync(outside);
  fs.mkdirSync(path.join(directory, "data"));
  fs.writeFileSync(path.join(outside, "victim.json"), "keep");
  fs.symlinkSync(outside, path.join(directory, "data/escape"), "junction");
  assert.throws(() => storage.readFile("escape/victim.json"), /Invalid storage path/);
  assert.throws(() => storage.writeFile("escape/new.json", "bad"), /Invalid storage path/);
  assert.throws(() => storage.deleteFile("escape/victim.json"), /Invalid storage path/);
  assert.equal(fs.readFileSync(path.join(outside, "victim.json"), "utf8"), "keep");
});

test("POSIX termination addresses the requested game PID rather than its PTY helper", () => {
  const killed = [];
  const { killProcess } = load("common/src/process_tools.ts", {
    os: { platform: () => "linux" },
    process: {
      kill: (pid, signal) => {
        killed.push({ pid, signal });
        return true;
      }
    }
  });
  const helper = {
    pid: 100,
    kill() {
      assert.fail("Must not terminate the PTY helper");
    }
  };
  assert.equal(killProcess(200, helper, "SIGTERM"), true);
  assert.deepEqual(killed, [{ pid: 200, signal: "SIGTERM" }]);
});

test("operation histories flush before reads and retain buffered entries after a failed save", async (t) => {
  const { storage } = storageFixture(t);
  const { JsonlStorage } = load("panel/plugins/monitor/src/backend/service/jsonl_storage.ts", {
    "mcsmanager-common": {
      StorageSubsystem: class {
        constructor() {
          return storage;
        }
      }
    }
  });
  const { OperationLogger } = load(
    "panel/plugins/monitor/src/backend/service/operation_logger.ts",
    {
      "./jsonl_storage": { JsonlStorage }
    }
  );
  const logger = new OperationLogger(2);
  t.after(() => logger.dispose());
  const first = logger.info("user_login", { operator_name: "first" });
  const save = storage.writeFile.bind(storage);
  storage.writeFile = () => {
    throw new Error("disk full");
  };
  logger.info("user_login", { operator_name: "second" });
  storage.writeFile = save;
  const entries = await logger.get(10);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].operation_id, first);
  assert.equal(entries[1].operator_name, "second");
  assert.deepEqual(await logger.get(0), []);
  for (let i = 0; i < 210; i++) logger.info("user_login", { operator_name: String(i) });
  const recent = await logger.get(250);
  assert.equal(recent.length, 200);
  assert.equal(recent[0].operator_name, "10");
  assert.equal(recent[199].operator_name, "209");
  storage.writeFile = () => {
    throw new Error("disk full");
  };
  for (let i = 0; i < 250; i++) logger.info("user_login", { operator_name: `failed-${i}` });
  assert.equal((await logger.get(250)).length, 200);
  storage.writeFile = save;
});

test("plugin compiler refuses to erase source trees and unowned output directories", (t) => {
  const { directory } = storageFixture(t);
  fs.mkdirSync(path.join(directory, "scripts"));
  const script = path.join(directory, "scripts/compile-plugin.mjs");
  fs.copyFileSync(path.join(root, "scripts/compile-plugin.mjs"), script);
  const workspace = path.join(directory, "external/example");
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, "source.txt"), "keep source");
  const sourceDirectory = path.join(directory, "panel");
  fs.mkdirSync(sourceDirectory);
  fs.writeFileSync(path.join(sourceDirectory, "source.txt"), "keep panel");
  const { spawnSync } = require("node:child_process");
  for (const out of [sourceDirectory, workspace, path.join(directory, "external")]) {
    const result = spawnSync(process.execPath, [script, "--workspace", workspace, "--out", out], {
      encoding: "utf8"
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /拒绝清理|不能包含/);
    assert.equal(fs.readFileSync(path.join(sourceDirectory, "source.txt"), "utf8"), "keep panel");
    assert.equal(fs.readFileSync(path.join(workspace, "source.txt"), "utf8"), "keep source");
  }
});
