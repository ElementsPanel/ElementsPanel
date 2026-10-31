const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { test } = require("node:test");
const { createLoader, deferred, from, settle } = require("./helpers.cjs");

const daemonRequire = from("daemon");
const { Context, Service } = daemonRequire("cordis");
const base = "plugins/instance/daemon/src/backend/";
const root = path.resolve(__dirname, "../..");
const commonLoad = createLoader({ host: "daemon" });
const common = {
  ...commonLoad("core/common/src/typecheck.ts"),
  InstanceStreamListener: commonLoad("core/common/src/instance_stream.ts").default,
  QueryMapWrapper: class {},
  bundledToolPath: (name) => path.join(os.tmpdir(), name),
  killProcess: (_pid, child, signal) => child.kill(signal)
};

function child() {
  const process = Object.assign(new EventEmitter(), {
    pid: 123,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new PassThrough(),
    exitCode: null,
    signalCode: null,
    kills: 0,
    kill(signal) {
      this.kills++;
      this.signalCode = signal;
      this.emit("close", 0);
      return true;
    }
  });
  return process;
}

async function until(check) {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > deadline) assert.fail("instance handover did not settle");
    await settle();
  }
}

async function fixture(t, { sleep = async () => {} } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-handover-"));
  const ctx = new Context();
  const cleanup = commonLoad("core/common/src/plugin_lifecycle.ts").trackPluginDisposal(ctx);
  const events = [];
  const saved = [];
  const records = new Map();
  let generation = 0;
  let foundations;
  let current;
  ctx.set("plugins", { inventory: () => [{ id: "instance", enabled: true }] });
  const provide = () => {
    const version = generation + 1;
    foundations = ctx.plugin((scope) => {
      scope.set("i18n", { define() {}, $t: (key) => key });
      scope.set("settings", {
        config: {
          outputBufferSize: 8192,
          defaultInstancePath: directory,
          allocatablePortRange: [10000, 20000],
          currentAllocatablePort: 10000,
          portAssignInterval: 1,
          port: 24444
        },
        save() {}
      });
      scope.set("storage", {
        list: (category) =>
          [...records.keys()]
            .filter((key) => key.startsWith(`${category}/`))
            .map((key) => key.slice(category.length + 1)),
        load: (category, Type, id) => {
          const value = records.get(`${category}/${id}`);
          return value ? Object.assign(new Type(), structuredClone(value)) : null;
        },
        store: (category, id, value) => {
          saved.push({ version, category, id });
          records.set(`${category}/${id}`, structuredClone(value));
        },
        delete: (category, id) => records.delete(`${category}/${id}`)
      });
      scope.set("files", {
        getFileManager() {},
        FileManager: class {
          static checkFileName() {
            return true;
          }
        }
      });
      scope.set("transfer", {});
      scope.set("features", { add() {} });
      scope.set("overview", { provide() {} });
      scope.plugin(
        class extends Service {
          constructor(scope) {
            super(scope, "protocol", true);
          }
          on() {
            return this.ctx.effect(() => () => {});
          }
          use() {
            return this.ctx.effect(() => () => {});
          }
          msg() {}
        }
      );
    });
  };
  const install = async ({ failJava = false } = {}) => {
    const version = ++generation;
    const cache = new Map();
    const sampleTask = (name) =>
      class {
        name = name;
        status = 0;
        async start(instance) {
          events.push(`start:${name}:${version}:${instance.instanceUuid}`);
        }
        async stop(instance) {
          events.push(`stop:${name}:${version}:${instance.instanceUuid}`);
        }
      };
    const noopCommand = {
      default: class {
        async exec() {}
      }
    };
    const mocks = new Map(
      Object.entries({
        "tools/steam_cmd.ts": { initSteamCmd() {} },
        "service/version_adapter.ts": { migrateConfig() {} },
        "settings.ts": { registerSettings() {} },
        "install_task.ts": { createInstanceInstallTaskClass: () => class {} },
        "minecraft_task.ts": { apply() {} },
        "java/index.ts": {
          async registerJavaManager() {
            if (failJava) throw new Error("replacement failed");
            return true;
          }
        },
        "mcstats.ts": {
          registerMinecraftStatus(scope) {
            scope.presets.register("refreshPlayers", () => ({ exec: async () => version }));
            scope.instanceLifecycle.register(() => new (sampleTask("extension"))());
          }
        },
        "routers/Instance_router.ts": {},
        "routers/schedule_router.ts": {},
        "routers/environment_router.ts": {},
        "service/docker_service.ts": { DockerManager: class {}, DefaultDocker: class {} },
        "service/takeover_container.ts": {
          default: async () => events.push(`takeover:${version}`)
        },
        "service/instance_update_action.ts": { InstanceUpdateAction: class {} },
        "service/java_access.ts": {},
        "utils/sleep.ts": { sleep },
        "entity/commands/task/time.ts": { default: sampleTask("expiry") },
        "entity/commands/task/any_stats.ts": { default: sampleTask("disk") },
        "entity/commands/task/docker_stats.ts": { default: sampleTask("docker") },
        "entity/commands/general/general_start.ts": {
          default: class {
            async exec(instance) {
              events.push(`launch:${instance.instanceUuid}`);
            }
          }
        },
        "entity/commands/pty/pty_start.ts": noopCommand,
        "entity/commands/docker/docker_start.ts": noopCommand,
        "entity/commands/general/general_restart.ts": noopCommand,
        "entity/commands/general/general_update.ts": noopCommand,
        "entity/commands/steam/rcon_command.ts": noopCommand,
        "entity/commands/task/openfrp.ts": {}
      })
    );
    const load = createLoader({
      host: "daemon",
      resolve(id, { filename, localRequire }) {
        if (id === "mcsmanager-common") return common;
        if (id.startsWith(".")) {
          const file = path.resolve(path.dirname(filename), id);
          const candidates = file.endsWith(".ts")
            ? [file]
            : [file + ".ts", path.join(file, "index.ts")];
          const resolved = candidates.find((candidate) => fs.existsSync(candidate));
          if (resolved) return source(path.relative(root, resolved));
        }
        return localRequire(id);
      }
    });
    function source(filename) {
      if (filename.startsWith(base) && mocks.has(filename.slice(base.length)))
        return { __esModule: true, ...mocks.get(filename.slice(base.length)) };
      if (cache.has(filename)) return cache.get(filename);
      const exports = { __esModule: true };
      cache.set(filename, exports);
      Object.assign(exports, load(filename));
      if (filename === base + "service/system_instance.ts") {
        exports.default.LOG_DIR = path.join(directory, "logs");
      }
      return exports;
    }
    const scope = ctx.plugin(source(base + "index.ts"));
    await cleanup();
    current = { scope, source, version };
    return current;
  };
  const pause = async () => {
    ctx.lifecycle.isActive = false;
    await ctx.parallel("plugins/reloading");
    current.scope.dispose();
    await cleanup();
    foundations.dispose();
    await cleanup();
  };
  const resume = async (options) => {
    provide();
    await install(options);
    await ctx.parallel("plugins/reloaded");
    await ctx.start();
    await cleanup();
  };
  t.after(async () => {
    await ctx.stop();
    await cleanup();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  provide();
  await install();
  await ctx.start();
  const create = (id = "running") => {
    const { Instance, Config, subsystem } = ctx.instances;
    const config = new Config();
    config.nickname = id;
    config.cwd = directory;
    config.terminalOption.pty = false;
    const instance = new Instance(id, config);
    subsystem.addInstance(instance);
    return instance;
  };
  const adapter = (process) => {
    const { ChildProcessAdapter } = current.source(
      base + "entity/commands/base/process_adapter.ts"
    );
    return new ChildProcessAdapter(process);
  };
  return {
    ctx,
    cleanup,
    events,
    saved,
    records,
    directory,
    create,
    adapter,
    pause,
    resume,
    install,
    get current() {
      return current;
    }
  };
}

test("foundation replacements retain live owners, output, counters and commands across module generations", async (t) => {
  const f = await fixture(t);
  const instance = f.create();
  const process = child();
  const adapter = f.adapter(process);
  const output = [];
  instance.on("data", (text) => output.push(text));
  const Dispatcher = f.current.source(base + "entity/commands/dispatcher.ts").default;
  await instance.forceExec(new Dispatcher());
  instance.started(adapter);
  instance.startTimestamp = Date.now() - 10000;
  instance.startCount = 4;
  instance.autoRestartCount = 2;
  instance.info.fileLock = 1;
  const timestamp = instance.startTimestamp;
  const stopped = f.create("intentionally-stopped");
  stopped.config.eventTask.autoStart = true;
  const first = f.ctx.instances.subsystem;
  const command = instance.getPreset("command");
  for (let index = 0; index < 3; index++) {
    process.stdout.write(`before-${index}\n`);
    await f.pause();
    assert.ok(
      fs
        .readFileSync(path.join(f.directory, "logs/running.log"), "utf8")
        .includes(`before-${index}\n`)
    );
    process.stdout.write(`during-${index}\n`);
    assert.equal(process.kills, 0);
    await f.resume();
    assert.equal(f.ctx.instances.subsystem.getInstance(instance.instanceUuid), instance);
    assert.equal(instance.process, adapter);
    assert.equal(instance.process.pid, 123);
    assert.equal(instance.startTimestamp, timestamp);
    assert.equal(instance.startCount, 4);
    assert.equal(instance.autoRestartCount, 2);
    assert.equal(instance.info.fileLock, 1);
    assert.equal(instance.status(), 3);
    assert.equal(stopped.status(), 0);
    assert.equal(instance.listenerCount("exit"), 1);
    assert.equal(adapter.listenerCount("exit"), 1);
    assert.equal(process.stdout.listenerCount("data"), 1);
    assert.equal(await instance.execPreset("refreshPlayers"), f.current.version);
  }
  stopped.parameters({ terminalOption: { pty: true } }, false);
  assert.equal(
    stopped.getPreset("start").constructor,
    f.current.source(base + "entity/commands/pty/pty_start.ts").default,
    "changing a retained instance config must keep using the replacement dispatcher"
  );
  assert.notEqual(f.ctx.instances.subsystem, first);
  assert.equal(first.instances.size, 0);
  assert.notEqual(instance.getPreset("command"), command);
  assert.ok(output.join("").includes("during-2"));
  let sent = "";
  process.stdin.on("data", (data) => {
    sent += data;
  });
  await instance.execPreset("command", "status");
  assert.equal(sent, "status\n");
  instance.parameters({ nickname: "retained" });
  assert.equal(
    f.saved.at(-1).version,
    f.current.version,
    "old entities use the new storage service"
  );
  assert.equal(f.events.filter((event) => event.startsWith("takeover:")).length, 1);
  assert.equal(
    f.events.some((event) => event.startsWith("launch:")),
    false
  );
  await f.ctx.stop();
  await f.cleanup();
  assert.equal(process.kills, 1, "a real daemon shutdown still stops the retained process");
  const log = fs.readFileSync(path.join(f.directory, "logs/running.log"), "utf8");
  for (let index = 0; index < 3; index++) {
    assert.equal(log.split(`during-${index}\n`).length - 1, 1);
  }
  assert.equal(f.events.filter((event) => event === "start:extension:1:running").length, 1);
  assert.equal(f.events.filter((event) => event === "stop:extension:1:running").length, 1);
});

test("a process that exits during handover is cleaned up and restarts only after new presets exist", async (t) => {
  const f = await fixture(t);
  const instance = f.create();
  instance.config.eventTask.autoRestart = true;
  const process = child();
  instance.started(f.adapter(process));
  await f.pause();
  process.exitCode = 1;
  process.emit("close", 1);
  await until(() => instance.status() === 0);
  assert.equal(
    f.events.some((event) => event.startsWith("launch:")),
    false
  );
  await f.resume();
  await settle();
  assert.equal(instance.process, undefined);
  assert.equal(f.events.filter((event) => event === "launch:running").length, 1);
  assert.equal(instance.autoRestartCount, 1);
  assert.equal(process.kills, 0);
});

test("failed replacements retain processes for retry and shutdown also cleans up an unclaimed handover", async (t) => {
  const f = await fixture(t);
  const instance = f.create();
  const process = child();
  instance.started(f.adapter(process));
  instance.startTimestamp = Date.now() - 10000;
  await f.pause();
  await f.resume({ failJava: true });
  assert.equal(process.kills, 0);
  assert.equal(f.ctx.instances, undefined);
  f.current.scope.dispose();
  await f.cleanup();
  await f.install();
  await f.cleanup();
  assert.equal(f.ctx.instances.subsystem.getInstance("running"), instance);
  assert.equal(instance.status(), 3);
  await f.pause();
  await f.ctx.stop();
  await f.cleanup();
  assert.equal(process.kills, 1);
});

test("retained PTY and Docker adapters keep their streams and accept new resize commands", async (t) => {
  const f = await fixture(t);
  const pty = f.create("pty");
  pty.config.terminalOption.pty = true;
  const process = child();
  const pipe = new PassThrough();
  let openPipe;
  let removed = 0;
  const ptyLoad = createLoader({ host: "daemon", globals: true });
  const { GoPtyProcessAdapter } = ptyLoad(
    base + "entity/commands/pty/pty_start.ts",
    {
      "fs-extra": {
        constants: fs.constants,
        open: async () => 17,
        createWriteStream: () => pipe,
        remove: async () => {
          removed++;
        }
      },
      "../../../const": {},
      "../../../i18n": { $t: (key) => key },
      "../../../service/log": { error() {}, warn() {} },
      "../../../tools/system_user": {},
      "../base/command_parser": {},
      "../base/process_adapter": f.current.source(base + "entity/commands/base/process_adapter.ts"),
      "../dispatcher": class {},
      "../general/general_start": class {},
      "../start": class {}
    },
    {
      setTimeout: (callback) => {
        openPipe = callback;
        return 1;
      },
      clearTimeout() {}
    }
  );
  const ptyAdapter = new GoPtyProcessAdapter(
    process,
    process.pid,
    path.join(f.directory, "pty-pipe")
  );
  pty.started(ptyAdapter);
  pty.startTimestamp = Date.now() - 10000;
  ptyAdapter.attachOutput();

  const docker = f.create("docker");
  docker.config.processType = "docker";
  const { DockerProcessAdapter } = f.current.source(base + "service/docker_process_service.ts");
  const stream = new PassThrough();
  const sizes = [];
  let waited;
  let attaches = 0;
  let kills = 0;
  let removals = 0;
  const container = {
    id: "retained-container",
    resize: async (size) => {
      sizes.push(size);
    },
    attach: async () => {
      attaches++;
      return stream;
    },
    wait: (callback) => {
      waited = callback;
    },
    kill: async () => {
      kills++;
      await waited(0);
    },
    remove: async () => {
      removals++;
    }
  };
  const dockerAdapter = new DockerProcessAdapter({});
  await dockerAdapter.start({ isTty: true, w: 120, h: 40 }, container);
  docker.started(dockerAdapter);
  docker.startTimestamp = Date.now() - 10000;

  await f.pause();
  openPipe();
  await settle();
  process.stdout.write("pty-during\n");
  stream.write("docker-during\n");
  assert.equal(pipe.destroyed, false);
  assert.equal(kills, 0);
  assert.equal(removals, 0);
  await f.resume();
  assert.equal(pty.process, ptyAdapter);
  assert.equal(docker.process, dockerAdapter);
  assert.equal(attaches, 1);
  assert.equal(process.kills, 0);
  assert.equal(removed, 0);
  await pty.execPreset("resize");
  const resize = pipe.read();
  assert.equal(resize[0], 4);
  assert.deepEqual(JSON.parse(resize.subarray(3)), { width: 164, height: 40 });
  await docker.execPreset("resize");
  assert.deepEqual(sizes.at(-1), { w: 164, h: 40 });
  let input = "";
  process.stdin.on("data", (data) => {
    input += data;
  });
  await pty.execPreset("command", "status");
  assert.equal(input, "status\n");
  await f.ctx.stop();
  await f.cleanup();
  assert.equal(pipe.destroyed, true);
  assert.equal(process.kills, 1);
  assert.equal(removed, 1);
  assert.equal(kills, 1);
});

test("reloading cancels delayed schedule actions and restores a single replacement job", async (t) => {
  const entered = deferred();
  const delay = deferred();
  const f = await fixture(t, {
    sleep: async (ms) => {
      if (ms !== 101) return;
      entered.resolve();
      await delay.promise;
    }
  });
  const instance = f.create();
  const process = child();
  instance.started(f.adapter(process));
  instance.startTimestamp = Date.now() - 10000;
  let sent = "";
  process.stdin.on("data", (data) => {
    sent += data;
  });
  const scheduler = f.current.source(base + "service/system_instance_control.ts").default;
  scheduler.registerScheduleJob({
    instanceUuid: "running",
    name: "retained-job",
    count: -1,
    type: 2,
    time: "0 0 0 1 1 *",
    actions: [
      { type: "delay", payload: "101" },
      { type: "command", payload: "scheduled" }
    ]
  });
  const task = scheduler.taskMap.get("running")[0];
  task.job.invoke();
  await entered.promise;
  await f.pause();
  delay.resolve();
  await until(() => !task.running);
  assert.equal(task.cancelled, true);
  assert.equal(sent, "", "a previous generation must not continue its delayed action");
  await f.resume();
  const replacement = f.current.source(base + "service/system_instance_control.ts").default;
  assert.equal(replacement.listScheduleJob("running").length, 1);
  const restored = replacement.taskMap.get("running")[0];
  assert.notEqual(restored.job, task.job);
  restored.job.invoke();
  await until(() => !restored.running);
  assert.equal(sent, "scheduled\n");
});

test("shutdown during resume prevents samplers and deferred restarts from being started", async (t) => {
  const f = await fixture(t);
  const running = f.create();
  const process = child();
  running.started(f.adapter(process));
  await running.suspendForReload();
  const entered = deferred();
  const release = deferred();
  const resuming = running.resumeAfterReload({
    async exec() {
      entered.resolve();
      await release.promise;
    }
  });
  await entered.promise;
  running.beginShutdown();
  release.resolve();
  await resuming;
  assert.equal(running.outputLoopTask, undefined);
  assert.equal(
    f.events.some((event) => event.startsWith("start:")),
    false
  );
  await running.stopped();
  assert.equal(process.kills, 1);

  const late = f.create("late-start");
  late.beginShutdown();
  const lateProcess = child();
  late.started(f.adapter(lateProcess));
  await until(() => late.status() === 0);
  assert.equal(lateProcess.kills, 1);
  assert.equal(late.outputLoopTask, undefined);

  const crashed = f.create("crashed");
  crashed.config.eventTask.autoRestart = true;
  const crashedProcess = child();
  crashed.started(f.adapter(crashedProcess));
  await crashed.suspendForReload();
  crashedProcess.exitCode = 1;
  crashedProcess.emit("close", 1);
  await until(() => crashed.status() === 0);
  crashed.beginShutdown();
  await crashed.resumeAfterReload({
    async exec() {
      assert.fail("shutdown must cancel resume");
    }
  });
  assert.equal(
    f.events.some((event) => event.startsWith("launch:")),
    false
  );
});

test("a real child keeps its PID and stdin/stdout while foundation services are replaced", async (t) => {
  const f = await fixture(t);
  const instance = f.create();
  const process = spawn(
    global.process.execPath,
    [
      "-e",
      `
    const readline = require("node:readline");
    readline.createInterface({input: process.stdin}).on("line", (line) => {
      process.stdout.write(process.pid + ":" + line + "\\n");
    });
  `
    ],
    { stdio: "pipe", windowsHide: true }
  );
  t.after(() => process.kill("SIGKILL"));
  await new Promise((resolve, reject) => {
    process.once("spawn", resolve);
    process.once("error", reject);
  });
  const adapter = f.adapter(process);
  instance.started(adapter);
  instance.startTimestamp = Date.now() - 10000;
  const pid = process.pid;
  const echo = (text) =>
    new Promise((resolve, reject) => {
      let received = "";
      const timeout = setTimeout(() => {
        process.stdout.off("data", onData);
        reject(new Error("child process stopped responding"));
      }, 3000);
      const onData = (data) => {
        received += data;
        if (!received.includes(`${pid}:${text}\n`)) return;
        clearTimeout(timeout);
        process.stdout.off("data", onData);
        resolve();
      };
      process.stdout.on("data", onData);
      adapter.write(text + "\n");
    });
  await echo("before");
  await f.pause();
  await echo("during");
  await f.resume();
  await echo("after");
  assert.equal(instance.process.pid, pid);
  assert.equal(process.exitCode, null);
  assert.equal(process.signalCode, null);
});
