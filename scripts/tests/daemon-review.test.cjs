const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const { Readable, PassThrough, Writable } = require("node:stream");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const daemonRequire = Module.createRequire(path.join(root, "daemon/package.json"));
const ts = daemonRequire("typescript");
const fse = daemonRequire("fs-extra");
const logger = { info() {}, warn() {}, error() {} };
const settle = () => new Promise((resolve) => setImmediate(resolve));

function load(filename, overrides = {}, environment = {}) {
  const absolute = path.join(root, filename);
  const mod = new Module(absolute, module);
  mod.environment = environment;
  mod.require = (id) => (Object.hasOwn(overrides, id) ? overrides[id] : daemonRequire(id));
  const compiled = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    fileName: absolute,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  const globals = Object.keys(environment)
    .map((key) => `const ${key} = module.environment.${key};`)
    .join("\n");
  mod._compile(`${globals}\n${compiled}`, absolute);
  return mod.exports;
}

function directory(t) {
  const result = fs.mkdtempSync(path.join(os.tmpdir(), "elements-daemon-review-"));
  t.after(() => fs.rmSync(result, { recursive: true, force: true }));
  return result;
}

function authFixture(key) {
  const events = new Map();
  const replies = [];
  const plugin = load("daemon/plugins/auth/src/backend/index.ts", {
    "../i18n": { localeMessages: {} }
  });
  plugin.apply({
    i18n: { define() {}, $t: (key) => key },
    logger,
    settings: { config: { key } },
    transfer: { passports: {} },
    setTimeout() {},
    protocol: {
      on: (name, callback) => events.set(name, callback),
      use() {},
      msg: (_ctx, _name, result) => replies.push(result)
    }
  });
  const ctx = { socket: { id: "test", handshake: { address: "127.0.0.1" } }, session: {} };
  return { authenticate: (value) => events.get("auth")(ctx, value), replies, ctx };
}

test("daemon authentication compares real UTF-8 bytes and rejects empty/non-string keys", () => {
  const auth = authFixture("abcdef");
  auth.authenticate("uvwxyz");
  assert.equal(auth.replies.pop(), false);
  assert.equal(auth.ctx.session.login, undefined);
  auth.authenticate("abcdef");
  assert.equal(auth.replies.pop(), true);
  const numeric = authFixture("1234");
  numeric.authenticate(1234);
  assert.equal(numeric.replies.pop(), false);
  const empty = authFixture("");
  empty.authenticate("");
  assert.equal(empty.replies.pop(), false);
  const unicode = authFixture("密钥");
  unicode.authenticate("密钥");
  assert.equal(unicode.replies.pop(), true);
});

test("passports reject expired, future and revoked credentials at lookup time", (t) => {
  const { missionPassport: passports } = load(
    "daemon/plugins/runtime/src/backend/service/mission_passport.ts"
  );
  t.after(() => passports.dispose());
  const mission = {
    name: "upload",
    parameter: {},
    start: Date.now() - 100,
    end: Date.now() + 60000
  };
  passports.registerMission("valid", mission);
  assert.equal(passports.getMission("valid", "download"), null);
  assert.equal(passports.getMission("valid", "upload"), mission);
  passports.deleteMission("valid");
  assert.equal(passports.getMission("valid", "upload"), null);
  passports.registerMission("expired", { ...mission, end: Date.now() - 1 });
  assert.equal(passports.getMission("expired", "upload"), null);
  passports.registerMission("future", { ...mission, start: Date.now() + 10000 });
  assert.equal(passports.getMission("future", "upload"), null);
  passports.dispose();
  passports.registerMission("reloaded", mission);
  assert.equal(passports.getMission("reloaded", "upload"), mission);
  assert.equal(passports.cleanupTimer.hasRef(), false);
});

function writerFixture(t, overrides = {}) {
  const cwd = directory(t);
  const deleted = [];
  class FileManager {
    static checkFileName(value) {
      return typeof value === "string" && !!value;
    }
    async unzip() {}
  }
  const Writer = load("daemon/plugins/file/src/backend/file_writer.ts", {
    "./system_file": FileManager,
    "./runtime": { logger: () => logger },
    "./upload_manager": { delete: (id) => deleted.push(id) },
    ...overrides
  }).default;
  const writer = new Writer(cwd, "upload.bin", 3, false, "utf8", path.join(cwd, "upload.bin"));
  writer.id = "upload";
  t.after(() => writer.stop());
  return { Writer, writer, cwd, deleted };
}

test("chunk uploads do not merge a missing byte and finish only after durable writes", async (t) => {
  const { writer, deleted } = writerFixture(t);
  await writer.init();
  await writer.write(0, Buffer.from("a"));
  await writer.write(2, Buffer.from("c"));
  assert.deepEqual(writer.received, [
    { start: 0, end: 1 },
    { start: 2, end: 3 }
  ]);
  assert.deepEqual(deleted, []);
  await writer.write(1, Buffer.from("b"));
  assert.deepEqual(deleted, ["upload"]);
  assert.equal(fs.readFileSync(writer.path, "utf8"), "abc");
  await writer.stop();
  assert.equal(fs.existsSync(writer.path), true, "stale cancellation preserves a completed upload");
});

test("uploads reject invalid sizes/offsets and finish partial filesystem writes", async (t) => {
  const partialFs = {
    ...fse,
    write: (fd, chunk, offset, length, position) =>
      fse.write(fd, chunk, offset, Math.min(length, 1), position)
  };
  const { writer, Writer, cwd } = writerFixture(t, { "fs-extra": partialFs });
  for (const size of [-1, NaN, Infinity, 0.5]) {
    assert.throws(() => new Writer(cwd, "x", size, false, "utf8", path.join(cwd, "x")), /size/);
  }
  await writer.init();
  for (const offset of [-1, NaN, Infinity, 0.5]) {
    await assert.rejects(writer.write(offset, Buffer.from("a")), /size limit/);
  }
  await writer.write(0, Buffer.from("abc"));
  assert.equal(fs.readFileSync(writer.path, "utf8"), "abc");
});

test("a competing upload cannot truncate a locked file", async (t) => {
  const { writer, Writer, cwd } = writerFixture(t);
  await writer.init();
  await writer.write(0, Buffer.from("a"));
  const competing = new Writer(cwd, "upload.bin", 3, false, "utf8", writer.path);
  await assert.rejects(competing.init(), /lock/i);
  assert.equal(fs.readFileSync(writer.path)[0], "a".charCodeAt(0));
  await writer.write(1, Buffer.from("bc"));
});

test("cancelling an upload holds its path lock until file removal finishes", async (t) => {
  let beginRemove;
  const removing = new Promise((resolve) => {
    beginRemove = resolve;
  });
  let finishRemove;
  const pending = new Promise((resolve) => {
    finishRemove = resolve;
  });
  const { writer, Writer, cwd } = writerFixture(t, {
    "fs-extra": {
      ...fse,
      remove: async (target) => {
        beginRemove();
        await pending;
        await fse.remove(target);
      }
    }
  });
  await writer.init();
  const stopping = writer.stop();
  await removing;
  const replacement = new Writer(cwd, "upload.bin", 3, false, "utf8", writer.path);
  await assert.rejects(replacement.init(), /lock/i);
  finishRemove();
  await stopping;
  await replacement.init();
  await replacement.write(0, Buffer.from("new"));
  assert.equal(fs.readFileSync(writer.path, "utf8"), "new");
});

test("failed upload initialization closes descriptors and releases its lock", async (t) => {
  let closed = 0;
  const { writer } = writerFixture(t, {
    "fs-extra": {
      ...fse,
      ftruncate: async () => {
        throw new Error("disk full");
      },
      close: async (fd) => {
        closed++;
        await fse.close(fd);
      }
    }
  });
  await assert.rejects(writer.init(), /disk full/);
  assert.equal(closed, 1);
  assert.equal(fs.existsSync(writer.path + ".lock"), false);
});

function downloadsFixture(t, axios) {
  const manager = load("daemon/plugins/runtime/src/backend/service/download_manager.ts", {
    axios,
    "./public_download": load("daemon/plugins/runtime/src/backend/service/public_download.ts"),
    "../entity/config": { globalConfiguration: { config: { uploadSpeedRate: 0 } } },
    "../common/network": { getCommonHeaders: () => ({}) }
  }).default;
  t.after(() => manager.stop());
  return manager;
}

test("URL downloads use fallback after stream failure and report actual completed bytes", async (t) => {
  const cwd = directory(t);
  const calls = [];
  const manager = downloadsFixture(t, async ({ url }) => {
    calls.push(url);
    return {
      headers: {},
      data: url.endsWith("primary")
        ? Readable.from(
            (async function* () {
              yield "broken";
              throw new Error("connection reset");
            })()
          )
        : Readable.from([Buffer.from("complete")])
    };
  });
  const target = path.join(cwd, "server.jar");
  fs.writeFileSync(target, "original");
  await manager.downloadFromUrl(
    "https://example.com/primary",
    target,
    "https://example.com/fallback"
  );
  assert.equal(fs.readFileSync(target, "utf8"), "complete");
  assert.equal(calls.length, 2);
  assert.equal(manager.task.current, 8);
  assert.equal(manager.downloadingCount, 0);
  assert.deepEqual(fs.readdirSync(cwd), ["server.jar"]);
});

test("failed or cancelled downloads preserve existing files and isolate replacement tasks", async (t) => {
  const cwd = directory(t);
  const target = path.join(cwd, "server.jar");
  fs.writeFileSync(target, "original");
  let firstRequested;
  const requested = new Promise((resolve) => {
    firstRequested = resolve;
  });
  const manager = downloadsFixture(t, async ({ url }) => {
    if (url.endsWith("first")) {
      firstRequested();
      return { headers: {}, data: new PassThrough() };
    }
    return { headers: {}, data: Readable.from([Buffer.from("replacement")]) };
  });
  const first = manager.downloadFromUrl("https://example.com/first", target);
  const rejected = assert.rejects(first, /abort|cancel/i);
  await requested;
  assert.equal(manager.stop(path.join(cwd, "someone-else.jar")), false);
  assert.equal(fs.readFileSync(target, "utf8"), "original");
  await manager.downloadFromUrl("https://example.com/second", target);
  await rejected;
  assert.equal(fs.readFileSync(target, "utf8"), "replacement");
  assert.equal(manager.task.status, 1);
  assert.deepEqual(fs.readdirSync(cwd), ["server.jar"]);
});

test("file paths reject sibling-prefix traversal and outside junctions", (t) => {
  const cwd = directory(t);
  const rootDir = path.join(cwd, "instance");
  const outside = path.join(cwd, "instance-other");
  fs.mkdirSync(rootDir);
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(rootDir, "linked"), "junction");
  const filepath = load("daemon/plugins/file/src/backend/filepath.ts");
  const FileManager = load("daemon/plugins/file/src/backend/system_file.ts", {
    "mcsmanager-common": { ProcessWrapper: class {} },
    "./filepath": filepath,
    "./runtime": { $t: (key) => key, settings: () => ({ config: {} }) }
  }).default;
  const files = new FileManager(rootDir);
  assert.throws(() => files.toAbsolutePath(path.join(outside, "secret")));
  assert.throws(() => files.toAbsolutePath("../instance-other/secret"));
  assert.throws(() => files.toAbsolutePath("linked/new-file"));
  assert.equal(files.toAbsolutePath("sub/file"), path.join(rootDir, "sub/file"));
  for (const value of [".", "..", "alternate:stream", "nul\0file", "a/b"]) {
    assert.equal(FileManager.checkFileName(value), false);
  }
});

test("mod operations validate final paths instead of following outside directory junctions", async (t) => {
  const cwd = directory(t);
  const rootDir = path.join(cwd, "instance");
  const outside = path.join(cwd, "outside");
  fs.mkdirSync(rootDir);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "example.jar"), "keep");
  for (const name of ["mods", "config"])
    fs.symlinkSync(outside, path.join(rootDir, name), "junction");
  const FileManager = load("daemon/plugins/file/src/backend/system_file.ts", {
    "mcsmanager-common": { ProcessWrapper: class {} },
    "./filepath": load("daemon/plugins/file/src/backend/filepath.ts"),
    "./runtime": { $t: (key) => key, settings: () => ({ config: {} }) }
  }).default;
  const { ModService } = load("daemon/plugins/mod/src/backend/mod_service.ts");
  const service = new ModService({
    effect() {},
    transfer: { downloads: {} },
    files: { getFileManager: () => new FileManager(rootDir) }
  });
  await assert.rejects(service.listMods("instance"));
  await assert.rejects(service.toggleMod("instance", "example.jar"));
  await assert.rejects(service.deleteMod("instance", "example.jar"));
  await assert.rejects(service.getModConfig("instance", "example", "mod"));
  assert.equal(fs.readFileSync(path.join(outside, "example.jar"), "utf8"), "keep");
});

function taskCore() {
  return load("daemon/plugins/instance/src/backend/service/async_task_core.ts", {
    "../runtime": { logger }
  });
}

test("async tasks surface startup failure, clean up once and release wait listeners", async () => {
  const { AsyncTask, TaskCenter } = taskCore();
  class Task extends AsyncTask {
    stops = 0;
    async onStart() {
      throw new Error("spawn failed");
    }
    async onError() {}
    async onStop() {
      this.stops++;
    }
    toObject() {
      return {};
    }
  }
  const direct = new Task();
  await assert.rejects(direct.start(), /spawn failed/);
  await assert.rejects(direct.wait(), /spawn failed/);
  assert.equal(direct.stops, 1);
  const task = new Task();
  TaskCenter.addTask(task);
  await assert.rejects(task.wait(), /spawn failed/);
  await settle();
  assert.equal(task.stops, 1);
  assert.equal(task.listenerCount("error"), 1, "only TaskCenter's listener remains");
  assert.equal(task.listenerCount("stopped"), 1);
});

test("instance lifecycle waits for asynchronous start before stopping resources", async () => {
  const { LifeCycleTaskManager } = load(
    "daemon/plugins/instance/src/backend/entity/instance/life_cycle.ts",
    {
      "../../service/log": logger
    }
  );
  const events = [];
  let finish;
  const manager = new LifeCycleTaskManager({});
  manager.registerLifeCycleTask({
    name: "resource",
    status: 0,
    async start() {
      events.push("starting");
      await new Promise((resolve) => {
        finish = resolve;
      });
      events.push("started");
    },
    async stop() {
      events.push("stopped");
    }
  });
  manager.execLifeCycleTask(1);
  await settle();
  manager.clearLifeCycleTask();
  assert.deepEqual(events, ["starting"]);
  finish();
  await settle();
  assert.deepEqual(events, ["starting", "started", "stopped"]);
});

function scheduleFixture(t) {
  const saved = new Map();
  const jobs = [];
  let failStore = false;
  let failDelete;
  let finishDelay;
  const commands = [];
  const storage = {
    list: () => [],
    store: (_type, key, value) => {
      if (failStore) throw new Error("disk full");
      saved.set(key, structuredClone(value));
    },
    delete: (_type, key) => {
      if (key === failDelete) throw new Error("delete denied");
      return saved.delete(key);
    }
  };
  const createJob = (callback) => {
    const job = {
      callback,
      cancelled: false,
      cancel() {
        this.cancelled = true;
      }
    };
    jobs.push(job);
    return job;
  };
  const scheduler = load(
    "daemon/plugins/instance/src/backend/service/system_instance_control.ts",
    {
      "node-schedule": {
        scheduleJob: (time, callback) => (time.includes("invalid") ? null : createJob(callback))
      },
      "../common/system_storage": storage,
      "../entity/instance/instance": { STATUS_RUNNING: 3, STATUS_STOP: 0 },
      "../i18n": { $t: (key) => key },
      "../utils/sleep": {
        sleep: () =>
          new Promise((resolve) => {
            finishDelay = resolve;
          })
      },
      "./file_access": {
        fileSubsystem: () => ({ FileManager: { checkFileName: (name) => !!name } })
      },
      "./log": logger,
      "../plugin/context": { ctx: { schedules: new Map() } },
      "./system_instance": {
        getInstance: () => ({
          config: {},
          status: () => 3,
          execPreset: async (...args) => commands.push(args)
        })
      }
    },
    { setInterval: (callback) => createJob(callback), clearInterval: (job) => job.cancel() }
  ).default;
  t.after(() => scheduler.dispose());
  const task = {
    instanceUuid: "instance",
    name: "job",
    count: 2,
    time: "3",
    type: 1,
    actions: [{ type: "command", payload: "say hello" }]
  };
  return {
    scheduler,
    task,
    saved,
    jobs,
    commands,
    failStore: () => {
      failStore = true;
    },
    failDelete: (key) => {
      failDelete = key;
    },
    finishDelay: () => finishDelay()
  };
}

test("schedule edits validate and persist before replacing the original job", (t) => {
  const { scheduler, task, saved, jobs, failStore } = scheduleFixture(t);
  scheduler.registerScheduleJob(task);
  const original = jobs[0];
  for (const time of ["Infinity", "NaN", "0", "2147484"]) {
    assert.throws(() => scheduler.registerScheduleJob({ ...task, time }, true, "job"));
    assert.equal(original.cancelled, false);
  }
  assert.throws(() =>
    scheduler.registerScheduleJob({ ...task, type: 2, time: "0 0 0 invalid * *" }, true, "job")
  );
  assert.equal(original.cancelled, false);
  scheduler.registerScheduleJob({ ...task, name: "renamed", time: "5" }, true, "job");
  assert.equal(original.cancelled, true);
  assert.equal(saved.has("instance_job"), false);
  assert.equal(saved.has("instance_renamed"), true);
  failStore();
  const current = jobs.at(-1);
  assert.throws(
    () => scheduler.registerScheduleJob({ ...task, name: "renamed" }, true, "renamed"),
    /disk full/
  );
  assert.equal(current.cancelled, false);
  assert.equal(jobs.at(-1).cancelled, true);
  assert.equal(scheduler.listScheduleJob("instance")[0].time, "5");
});

test("failed schedule renames roll back the new stored task", (t) => {
  const { scheduler, task, saved, jobs, failDelete } = scheduleFixture(t);
  scheduler.registerScheduleJob(task);
  failDelete("instance_job");
  assert.throws(
    () => scheduler.registerScheduleJob({ ...task, name: "new" }, true, "job"),
    /delete denied/
  );
  assert.deepEqual([...saved.keys()], ["instance_job"]);
  assert.equal(jobs[0].cancelled, false);
  assert.equal(jobs[1].cancelled, true);
  assert.equal(scheduler.listScheduleJob("instance")[0].name, "job");
});

test("schedules persist remaining counts and stop delayed actions after deletion", async (t) => {
  const { scheduler, task, jobs, commands, saved, finishDelay } = scheduleFixture(t);
  scheduler.registerScheduleJob(task);
  jobs[0].callback();
  await settle();
  assert.equal(saved.get("instance_job").count, 1);
  jobs[0].callback();
  await settle();
  assert.equal(saved.has("instance_job"), false);
  assert.equal(commands.length, 2);
  scheduler.registerScheduleJob({
    ...task,
    count: -1,
    actions: [{ type: "delay", payload: "10" }, ...task.actions]
  });
  const delayed = jobs.at(-1);
  delayed.callback();
  delayed.callback();
  await settle();
  scheduler.deleteScheduleTask("instance", "job");
  finishDelay();
  await settle();
  assert.equal(commands.length, 2, "deleted or overlapping task must not issue commands");
});

test("failed multipart uploads always remove temporary files", async () => {
  const routes = new Map();
  const cleaned = [];
  const { registerHttpRoutes } = load("daemon/plugins/file/src/backend/http_router.ts", {
    "./file_writer": class {},
    "./system_file": class {},
    "./filepath": { clearUploadFiles: (files) => cleaned.push(files) },
    "./upload_manager": {
      get: () => ({
        write: async () => {
          throw new Error("write failed");
        }
      })
    },
    "fs-extra": { readFile: async () => Buffer.from("chunk") },
    "./runtime": {
      core: () => ({
        koa: { router: () => ({ get() {}, post: (name, callback) => routes.set(name, callback) }) }
      }),
      transfer: () => ({ passports: { getMission: () => null, deleteMission() {} } })
    }
  });
  registerHttpRoutes();
  const temporary = { filepath: "temp-upload" };
  const ctx = {
    params: { key: "key", id: "id" },
    query: { offset: "0" },
    request: { files: { file: temporary } }
  };
  await routes.get("/upload/:key")(ctx);
  await routes.get("/upload-piece/:id")(ctx);
  assert.deepEqual(cleaned, [temporary, temporary]);
  assert.equal(ctx.status, 500);
});

test("ZIP restore refuses an existing junction that points outside its destination", async (t) => {
  const cwd = directory(t);
  const destination = path.join(cwd, "instance");
  const outside = path.join(cwd, "outside");
  fs.mkdirSync(destination);
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(destination, "linked"), "junction");
  let closed = false;
  const { decompressWithProgress } = load("daemon/plugins/runtime/src/backend/common/compress.ts", {
    "mcsmanager-common": { ProcessWrapper: class {} },
    "../const": {},
    "../i18n": { $t: (key) => key },
    "../service/log": logger,
    "../service/seven_zip_service": {},
    "node-stream-zip": {
      async: class {
        async entries() {
          return { file: { name: "linked/secret", size: 4, isDirectory: false } };
        }
        async stream() {
          return Readable.from([Buffer.from("data")]);
        }
        async close() {
          closed = true;
        }
      }
    }
  });
  await assert.rejects(decompressWithProgress(path.join(cwd, "backup.zip"), destination));
  assert.equal(fs.existsSync(path.join(outside, "secret")), false);
  assert.equal(closed, true);
});

test("backup quota failures preserve the actual running instance state", async (t) => {
  const cwd = directory(t);
  const backups = path.join(cwd, "backups");
  fs.mkdirSync(path.join(backups, "instance"), { recursive: true });
  fs.writeFileSync(path.join(backups, "instance/previous.zip"), "previous-backup");
  const { AsyncTask, TaskCenter } = taskCore();
  let create;
  let status = 3;
  const instance = {
    instanceUuid: "instance",
    config: { nickname: "test" },
    status: (value) => (value == null ? status : (status = value)),
    println() {},
    print() {}
  };
  load("daemon/plugins/backup/src/backend/index.ts", { "../i18n": { localeMessages: {} } }).apply({
    i18n: { define() {}, $t: (key) => key },
    logger,
    settings: { config: { instanceBackupPath: backups, instanceBackupMaxSize: 0.000000001 } },
    settingsForm: { declare() {} },
    tasks: {
      AsyncTask,
      Center: TaskCenter,
      register: (_name, task) => {
        create = task.create;
      }
    },
    instances: { Instance: { STATUS_STOP: 0, STATUS_BUSY: -1 }, subsystem: {} },
    archive: {},
    schedules: { register() {} },
    features: { add() {} },
    protocol: { on() {} }
  });
  const task = create(instance);
  await task.start();
  assert.equal(task.status(), -1);
  assert.equal(status, 3);
});

test("instance deletion awaits filesystem success and preserves retryable instances on failure", async (t) => {
  const cwd = directory(t);
  const instanceDir = path.join(cwd, "instance");
  fs.mkdirSync(instanceDir);
  fs.writeFileSync(path.join(instanceDir, "world.dat"), "world");
  let failRemove = true;
  const deleted = [];
  const subsystem = load("daemon/plugins/instance/src/backend/service/system_instance.ts", {
    "fs-extra": {
      ...fse,
      remove: async (target) => {
        if (failRemove) throw new Error("permission denied");
        await fse.remove(target);
      }
    },
    "mcsmanager-common": { InstanceStreamListener: class {}, QueryMapWrapper: class {} },
    "../common/system_storage": { delete: (...args) => deleted.push(args) },
    "../entity/commands/dispatcher": class {},
    "../entity/config": {
      globalConfiguration: { load() {}, config: { defaultInstancePath: cwd } }
    },
    "../entity/instance/instance": { STATUS_STOP: 0, STATUS_BUSY: -1 },
    "../entity/instance/Instance_config": class {},
    "../i18n": { $t: (key) => key },
    "../utils/sleep": {},
    "./log": logger,
    "./system_instance_control": { deleteInstanceAllTask() {} },
    "./takeover_container": {}
  }).default;
  let status = 0;
  let destroyed = false;
  const instance = {
    absoluteCwdPath: () => instanceDir,
    status: (value) => (value == null ? status : (status = value)),
    destroy: () => {
      destroyed = true;
    }
  };
  subsystem.instances.set("instance", instance);
  await assert.rejects(subsystem.removeInstance("instance", true), /permission denied/);
  assert.equal(subsystem.instances.get("instance"), instance);
  assert.equal(status, 0);
  assert.equal(destroyed, false);
  assert.deepEqual(deleted, []);
  failRemove = false;
  await subsystem.removeInstance("instance", true);
  assert.equal(subsystem.instances.has("instance"), false);
  assert.equal(fs.existsSync(instanceDir), false);
  assert.equal(destroyed, true);
  subsystem.instances.set("global0001", instance);
  await assert.rejects(subsystem.removeInstance("global0001", true), /global terminal/);
});

test("Java inventory survives one corrupt metadata record", async (t) => {
  const cwd = directory(t);
  fs.mkdirSync(path.join(cwd, "broken"));
  fs.writeFileSync(path.join(cwd, "broken/java_info.json"), "not JSON");
  fs.mkdirSync(path.join(cwd, "msl_17"));
  fs.writeFileSync(
    path.join(cwd, "msl_17/java_info.json"),
    JSON.stringify({ name: "msl", version: "17" })
  );
  const { JavaManager } = load("daemon/plugins/java/src/backend/java_manager.ts", {
    "../../../../../common/src/java": { javaExecutableCommand() {} },
    "./java_info": load("daemon/plugins/java/src/backend/java_info.ts"),
    "./java_install": {},
    "./msl_java": {
      MslJavaSource: class {
        dispose() {}
      }
    }
  });
  const manager = new JavaManager({ defaultJavaDataPath: cwd, translate: (key) => key, logger });
  t.after(() => manager.dispose());
  await manager.ready;
  assert.equal(manager.list().length, 1);
  assert.equal(manager.exists("msl_17"), true);
});
