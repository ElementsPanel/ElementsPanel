const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { createHash } = require("node:crypto");
const { EventEmitter } = require("node:events");
const { Readable, PassThrough } = require("node:stream");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const panelRequire = Module.createRequire(path.join(root, "panel/package.json"));
const frontendRequire = Module.createRequire(path.join(root, "frontend/package.json"));
const ts = panelRequire("typescript");
const vue = frontendRequire("vue");
const translate = (key) => key;
const logger = { info() {}, error() {} };

// Execute source in memory with network/process boundaries replaced. No build,
// HTTP server, Minecraft binary or installer is needed for these regressions.
function load(filename, overrides = {}, source) {
  filename = path.join(root, filename);
  const mod = new Module(filename, module);
  const localRequire = Module.createRequire(filename);
  mod.require = (id) => (Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id));
  mod._compile(
    ts.transpileModule(source ?? fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      },
      fileName: filename + ".ts"
    }).outputText,
    filename
  );
  return mod.exports;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await settle();
  }
  assert.fail("Operation did not settle");
}
function directory(t) {
  const parent = path.resolve(os.tmpdir());
  const cwd = fs.mkdtempSync(path.join(parent, "elements-minecraft-test-"));
  t.after(() => {
    assert.equal(path.dirname(cwd), parent);
    assert.ok(path.basename(cwd).startsWith("elements-minecraft-test-"));
    fs.rmSync(cwd, { recursive: true, force: true });
  });
  return cwd;
}

const catalog = load("panel/plugins/instance/src/minecraft.ts");
const javaCommands = load("common/src/java.ts");
const install = load("daemon/plugins/market/src/backend/minecraft_install.ts", {
  "../../../../../common/src/java": javaCommands
});
const { AsyncTask } = load("daemon/plugins/instance/src/backend/service/async_task_core.ts", {
  "../runtime": { logger }
});

function mirrorFixture(override) {
  const requests = [];
  const response = {
    "/mirrors?view=list": ["paper", "vanilla", "forge", "bedrock-server", "nukkitx"],
    "/mirrors/paper": { versions: ["1.21.4"], description: "Paper" },
    "/mirrors/paper/1.21.4": ["latest", "232"],
    "/download/server/paper/1.21.4?build=latest": {
      url: "https://cdn.example/server/jar?signature=123",
      sha256: "a".repeat(64)
    }
  };
  const { MslMirrorsService } = load("panel/plugins/instance/src/backend/service/msl_mirrors.ts", {
    "../../minecraft": catalog,
    "../runtime": { $t: translate },
    axios: {
      get: async (url, options) => {
        const endpoint = url.replace("https://api.mslmc.cn/v4", "");
        requests.push({ endpoint, url, options });
        const data = override ? await override(endpoint, requests.length) : response[endpoint];
        assert.notEqual(data, undefined, endpoint);
        return { data: { code: 200, data } };
      }
    }
  });
  return { mirrors: new MslMirrorsService(), requests };
}

test("MSL metadata is cached, download links are refreshed, and the app identifies itself", async () => {
  const { mirrors, requests } = mirrorFixture();
  const selected = { server: "paper", version: "1.21.4", build: "latest" };
  const first = await mirrors.resolve(selected, "minecraft/java");
  assert.equal(first.type, "minecraft/java/paper");
  assert.equal(first.url, "https://cdn.example/server/jar?signature=123");
  assert.equal(first.sha256, "a".repeat(64));
  await mirrors.resolve(selected, "minecraft/java/paper");
  assert.equal(requests.filter((entry) => entry.endpoint.startsWith("/download/")).length, 2);
  assert.equal(requests.filter((entry) => entry.endpoint.startsWith("/mirrors")).length, 3);
  for (const entry of requests) {
    assert.equal(entry.options.headers["User-Agent"], "ElementsPanel");
    assert.equal(entry.options.headers.deviceID, undefined);
    assert.ok(entry.options.timeout > 0);
  }
});

test("MSL rejects invalid paths, wrong editions and unavailable versions/builds", async () => {
  const { mirrors, requests } = mirrorFixture();
  await assert.rejects(mirrors.versions("../private"), /invalidSelection/);
  assert.equal(requests.length, 0);
  await assert.rejects(
    mirrors.resolve({ server: "paper", version: "1.21.4", build: "latest" }, "minecraft/bedrock"),
    /invalidSelection/
  );
  await assert.rejects(
    mirrors.resolve({ server: "paper", version: "0.0", build: "latest" }, "minecraft/java"),
    /invalidSelection/
  );
  await assert.rejects(
    mirrors.resolve({ server: "paper", version: "1.21.4", build: "missing" }, "minecraft/java"),
    /invalidSelection/
  );
  assert.ok(requests.every((entry) => !entry.endpoint.startsWith("/download/")));
  assert.deepEqual(
    catalog.minecraftServersForType(
      ["paper", "nukkitx", "bedrock-server", "constructor", "spongeforge"],
      "minecraft/bedrock"
    ),
    ["nukkitx", "bedrock-server"]
  );
});

test("malformed MSL data is not cached and retry can recover", async () => {
  const { mirrors } = mirrorFixture((_endpoint, count) =>
    count === 1 ? { wrong: "shape" } : ["paper"]
  );
  await assert.rejects(mirrors.servers(), /sourceError/);
  assert.deepEqual(await mirrors.servers(), ["paper"]);
});

test("Minecraft API requires an administrator and resolves downloads on the panel", async () => {
  const requests = [],
    logs = [],
    resolutions = [];
  let result = { instanceUuid: "created", taskId: "task", status: 1 };
  const runtime = {
    $t: translate,
    roles: () => ({ ADMIN: 10 }),
    middleware: () => ({
      validator: load("panel/plugins/runtime/src/backend/middleware/validator.ts").default,
      permission:
        ({ level }) =>
        async (ctx, next) => {
          if (ctx.role < level) ctx.status = 403;
          else await next();
        }
    }),
    identity: () => ({ identify: (ctx) => ({ role: ctx.role, userName: "admin" }) }),
    operations: () => ({ log: (...args) => logs.push(args) }),
    remote: () => ({
      services: { getInstance: (id) => ({ id }) },
      Request: class {
        constructor(node) {
          this.node = node;
        }
        async request(event, data) {
          requests.push({ node: this.node.id, event, data });
          return result;
        }
      }
    })
  };
  const { createMinecraftRouter } = load(
    "panel/plugins/instance/src/backend/routers/minecraft_router.ts",
    {
      "../runtime": runtime,
      "../service/msl_mirrors": {
        MslMirrorsService: class {
          async resolve(selection, type) {
            resolutions.push({ selection, type });
            return {
              url: "https://cdn.example/server.jar",
              sha256: "b".repeat(64),
              type: "minecraft/java/paper",
              kind: "jar"
            };
          }
        }
      }
    }
  );
  const dispatch = createMinecraftRouter().routes();
  const request = async (role = 10, body = {}) => {
    const ctx = {
      path: "/instance/minecraft",
      method: "POST",
      query: { daemonId: "node" },
      request: { body },
      role,
      ip: "127.0.0.1",
      status: 200
    };
    await dispatch(ctx, async () => {});
    return ctx;
  };
  const body = {
    selection: {
      server: "paper",
      version: "1.21.4",
      build: "latest",
      url: "https://untrusted.example"
    },
    config: { nickname: "Paper", type: "minecraft/java", cwd: "/untrusted", startCommand: "" }
  };
  assert.equal((await request(1, body)).status, 403);
  assert.equal(requests.length, 0);
  assert.equal((await request(10)).status, 400);
  assert.equal((await request(10, body)).body.instanceUuid, "created");
  assert.equal(resolutions[0].type, "minecraft/java");
  const task = requests[0].data;
  assert.equal(task.taskName, "minecraft_install");
  assert.equal(task.parameter.targetLink, "https://cdn.example/server.jar");
  assert.equal(task.parameter.minecraft.sha256, "b".repeat(64));
  assert.equal(task.parameter.setupInfo.type, "minecraft/java/paper");
  assert.equal(task.parameter.setupInfo.cwd, "");
  assert.equal(logs.length, 1);
  result = true; // Older daemon or disabled market plugin.
  assert.match((await request(10, body)).body.message, /nodeUnsupported/);
  assert.equal(logs.length, 1);
});

function downloadFixture(t, handlers = {}) {
  const calls = [];
  const input = vue.ref("minecraft/java");
  const api = Object.fromEntries(
    ["minecraftServers", "minecraftVersions", "minecraftBuilds"].map((name) => [
      name,
      () => ({
        execute: async (options) => {
          calls.push({ name, options });
          const handler = handlers[name];
          const value = handler
            ? await handler(options)
            : name === "minecraftServers"
            ? ["paper", "vanilla", "bedrock-server"]
            : name === "minecraftVersions"
            ? { versions: ["1.21.4", "1.20.1"], description: options.params.server }
            : ["latest"];
          return vue.ref(value);
        }
      })
    ])
  );
  const { useMinecraftDownload } = load(
    "panel/plugins/instance/src/hooks/useMinecraftDownload.ts",
    {
      vue,
      "@/lang/i18n": { t: translate },
      "../api": api,
      "../minecraft": catalog
    }
  );
  const scope = vue.effectScope();
  const state = scope.run(() => useMinecraftDownload(input));
  t.after(() => scope.stop());
  return { state, input, calls, scope };
}

test("changing server ignores stale versions and aborts the previous request", async (t) => {
  const old = deferred();
  const { state, calls } = downloadFixture(t, {
    minecraftVersions: async ({ params }) =>
      params.server === "vanilla" ? old.promise : { versions: ["1.21.4"], description: "Paper" }
  });
  await until(() => calls.some((entry) => entry.name === "minecraftVersions"));
  const previous = calls.find((entry) => entry.name === "minecraftVersions");
  await state.selectServer("paper");
  assert.equal(previous.options.signal.aborted, true);
  assert.deepEqual(state.selection.value, { server: "paper", version: "1.21.4", build: "latest" });
  old.resolve({ versions: ["old"], description: "obsolete" });
  await settle();
  assert.deepEqual(state.versions.value, ["1.21.4"]);
  assert.equal(state.description.value, "Paper");
});

test("changing version clears the build immediately and ignores stale builds", async (t) => {
  const old = deferred();
  const { state, calls } = downloadFixture(t, {
    minecraftBuilds: async ({ params }) =>
      params.version === "1.21.4" ? old.promise : ["new-build"]
  });
  await until(() => calls.some((entry) => entry.name === "minecraftBuilds"));
  const changing = state.selectVersion("1.20.1");
  assert.equal(state.selection.value, undefined);
  assert.equal(state.build.value, "");
  await changing;
  old.resolve(["old-build"]);
  await settle();
  assert.deepEqual(state.selection.value, {
    server: "vanilla",
    version: "1.20.1",
    build: "new-build"
  });
});

test("download errors are retryable and changing instance edition resets the selection", async (t) => {
  let failure = true;
  const { state, input } = downloadFixture(t, {
    minecraftBuilds: async () => {
      if (failure) throw new Error("temporarily unavailable");
      return ["latest"];
    }
  });
  await until(() => state.error.value);
  assert.equal(state.selection.value, undefined);
  failure = false;
  await state.retry();
  assert.ok(state.selection.value);
  input.value = "minecraft/bedrock";
  assert.equal(state.selection.value, undefined);
  await until(() => state.selection.value);
  assert.equal(state.server.value, "bedrock-server");
  assert.deepEqual(state.servers.value, ["bedrock-server"]);
});

function taskFixture(t, options = {}) {
  const cwd = directory(t);
  const bytes = Buffer.from("test download; never executed");
  const chmods = [];
  const fse = Module.createRequire(path.join(root, "daemon/package.json"))("fs-extra");
  const fixtureInstall = load("daemon/plugins/market/src/backend/minecraft_install.ts", {
    "../../../../../common/src/java": javaCommands,
    "fs-extra": {
      ...fse,
      chmod: async (file, mode) => {
        chmods.push({ file, mode });
        await fse.chmod(file, mode);
      }
    }
  });
  const output = [],
    updates = [],
    unzips = [],
    downloads = [];
  const instance = {
    instanceUuid: "instance",
    config: { cwd, processType: "general", startCommand: "", updateCommand: "", stopCommand: "^c" },
    absoluteCwdPath() {
      return this.config.cwd;
    },
    status(value) {
      if (value != null) this.currentStatus = value;
      return this.currentStatus;
    },
    print(text) {
      output.push(String(text));
    },
    println(level, text) {
      output.push(`${level}: ${text}`);
    },
    resetConfigWithoutDocker() {
      this.config.startCommand = "";
      this.config.updateCommand = "";
    },
    parameters(config) {
      Object.assign(this.config, config);
    }
  };
  const ctx = {
    tasks: { AsyncTask },
    i18n: { $t: translate },
    logger,
    instances: {
      Instance: { STATUS_BUSY: 2, STATUS_STOP: 0 },
      Config: class {},
      UpdateAction: class extends AsyncTask {
        constructor(instance) {
          super();
          this.instance = instance;
        }
        async onStart() {
          updates.push(this.instance.config.updateCommand);
          await options.update?.(this.instance, updates.length);
          await this.stop();
        }
        async onStop() {}
        async onError() {}
      },
      fileManager: () => ({
        toAbsolutePath: (file) => path.join(cwd, file),
        unzip: async (file) => {
          unzips.push(file);
          return options.unzip ? options.unzip(cwd) : true;
        }
      }),
      headers: () => ({}),
      subsystem: {
        createInstance: (config) => {
          Object.assign(instance.config, config, { cwd });
          return instance;
        }
      }
    }
  };
  const { createQuickInstallTaskClass } = load(
    "daemon/plugins/market/src/backend/quick_install.ts",
    {
      "./minecraft_install": {
        ...fixtureInstall,
        validateMinecraftInstall: (selection, url, translate) =>
          fixtureInstall.validateMinecraftInstall(
            selection,
            url,
            translate,
            options.platform ?? "linux",
            "x64"
          ),
        minecraftStartCommand: (cwd, selection, translate) =>
          fixtureInstall.minecraftStartCommand(
            cwd,
            selection,
            translate,
            options.platform ?? "linux"
          )
      },
      axios: async (config) => {
        downloads.push(config);
        await options.download?.();
        return { data: options.stream || Readable.from(bytes), headers: {} };
      }
    }
  );
  const Task = createQuickInstallTaskClass(ctx);
  const create = (minecraft, config = {}) => {
    const task = new Task(
      "Test",
      "https://cdn.example/server/jar?signature=abc",
      {
        nickname: "Test",
        startCommand: "",
        updateCommand: "",
        cwd: "",
        type: "minecraft/java",
        ...config
      },
      undefined,
      minecraft
    );
    task.on("error", () => {});
    return task;
  };
  return { create, cwd, bytes, instance, output, updates, unzips, downloads, ctx, chmods };
}

const paper = { server: "paper", version: "1.21.4", kind: "jar", javaPath: "/java path/bin/java" };

test("signed/extensionless JAR URLs use a safe filename, verify SHA-256 and keep the instance directory", async (t) => {
  const f = taskFixture(t);
  const task = f.create({ ...paper, sha256: createHash("sha256").update(f.bytes).digest("hex") });
  await task.start();
  assert.equal(task.status(), AsyncTask.STATUS_STOP);
  assert.equal(f.instance.config.cwd, f.cwd);
  assert.equal(task.filePath, path.join(f.cwd, "server.jar"));
  assert.deepEqual(fs.readFileSync(task.filePath), f.bytes);
  assert.equal(f.instance.config.startCommand, '"/java path/bin/java" -jar server.jar nogui');
  assert.equal(f.unzips.length, 0);
  assert.equal(f.downloads[0].headers["User-Agent"], "ElementsPanel");
  assert.equal(task.downloadProgress.downloadedBytes, f.bytes.length);
  assert.equal(fs.existsSync(path.join(f.cwd, "eula.txt")), false);
  assert.equal(f.instance.asynchronousTask, undefined);
});

test("checksum failure stops installation before extraction or executing commands", async (t) => {
  const f = taskFixture(t);
  const task = f.create({ ...paper, sha256: "0".repeat(64) });
  await task.start();
  assert.equal(task.status(), AsyncTask.STATUS_ERROR);
  assert.match(task.toObject().error, /hashMismatch/);
  assert.equal(fs.existsSync(task.filePath), false);
  assert.equal(f.unzips.length, 0);
  assert.equal(f.updates.length, 0);
  assert.ok(!f.output.some((line) => line.includes("TXT_CODE_1562f6cf")));
});

test("file-open failures become task errors while waiting for a download response", async (t) => {
  const response = deferred();
  const f = taskFixture(t, { download: () => response.promise });
  fs.mkdirSync(path.join(f.cwd, "server.jar"));
  const task = f.create(paper);
  const running = task.start();
  await settle();
  response.resolve();
  await running;
  assert.equal(task.status(), AsyncTask.STATUS_ERROR);
  assert.equal(f.updates.length, 0);
});

test("Forge and NeoForge install before generating commands from their argument files", async (t) => {
  for (const kind of ["forge", "neoforge"])
    await t.test(kind, async (t) => {
      const library = kind === "forge" ? "net/minecraftforge/forge" : "net/neoforged/neoforge";
      const f = taskFixture(t, {
        update: async (instance) => {
          const args = path.join(instance.config.cwd, "libraries", library, "1.0", "unix_args.txt");
          fs.mkdirSync(path.dirname(args), { recursive: true });
          fs.writeFileSync(args, "test arguments");
          fs.writeFileSync(path.join(instance.config.cwd, "user_jvm_args.txt"), "");
        }
      });
      const task = f.create({ ...paper, server: kind, kind });
      await task.start();
      assert.equal(task.status(), AsyncTask.STATUS_STOP);
      assert.deepEqual(f.updates, [
        '"/java path/bin/java" -jar server-installer.jar --installServer'
      ]);
      assert.equal(
        f.instance.config.startCommand,
        `"/java path/bin/java" @user_jvm_args.txt "@libraries/${library}/1.0/unix_args.txt" nogui`
      );
      assert.equal(f.instance.config.updateCommand, "");
      assert.equal(f.instance.config.cwd, f.cwd);
    });
});

test("old Forge JARs and custom startup commands are preserved", async (t) => {
  const f = taskFixture(t, {
    update: async (instance) =>
      fs.writeFileSync(path.join(instance.config.cwd, "forge-1.12.2.jar"), "test")
  });
  const task = f.create(
    { ...paper, kind: "forge", server: "forge" },
    { startCommand: "custom command" }
  );
  await task.start();
  assert.equal(task.status(), AsyncTask.STATUS_STOP);
  assert.equal(f.instance.config.startCommand, "custom command");
  assert.equal(
    await install.minecraftStartCommand(
      f.cwd,
      { ...paper, kind: "forge", server: "forge" },
      translate
    ),
    '"/java path/bin/java" -jar "forge-1.12.2.jar" nogui'
  );
});

test("early NeoForge and Windows installations use the argument file actually installed", async (t) => {
  const cwd = directory(t);
  const args = "libraries/net/neoforged/forge/1.20.1/win_args.txt";
  fs.mkdirSync(path.dirname(path.join(cwd, args)), { recursive: true });
  fs.writeFileSync(path.join(cwd, args), "test arguments");
  const command = await install.minecraftStartCommand(
    cwd,
    {
      ...paper,
      kind: "neoforge",
      server: "neoforge",
      javaPath: "C:\\Program Files\\Java\\bin\\java.exe"
    },
    translate,
    "win32"
  );
  assert.equal(command, `"C:\\Program Files\\Java\\bin\\java.exe" "@${args}" nogui`);
  await assert.rejects(
    install.minecraftStartCommand(
      cwd,
      { ...paper, kind: "neoforge", server: "neoforge" },
      translate,
      "linux"
    ),
    /missingFiles/
  );
});

test("market registers Minecraft as a separate admin task and validates before creating an instance", () => {
  const registrations = new Map();
  const created = [];
  const { apply } = load("daemon/plugins/market/src/backend/index.ts", {
    "../i18n": { localeMessages: {} },
    "./install_command": { createInstallCommandClass: () => class {} },
    "./minecraft_install": install,
    "./quick_install": {
      createQuickInstallTaskClass: () =>
        class {
          static TYPE = "QuickInstallTask";
          constructor(...args) {
            created.push(args);
          }
        }
    }
  });
  apply({
    i18n: { define() {}, $t: translate },
    logger,
    presets: { register() {} },
    tasks: { register: (name, task) => registrations.set(name, task) }
  });
  const registration = registrations.get("minecraft_install");
  assert.equal(registration.requiredRole, 10);
  assert.equal(registration.requiresInstance, false);
  assert.ok(registrations.has("quick_install"));
  assert.throws(
    () =>
      registration.create(undefined, {
        newInstanceName: "Test",
        targetLink: "file:///private",
        minecraft: paper
      }),
    /invalidDownload/
  );
  assert.equal(created.length, 0);
  registration.create(undefined, {
    newInstanceName: "Test",
    targetLink: "https://cdn.example/server.jar",
    minecraft: paper
  });
  assert.equal(created[0][4].kind, "jar");
});

test("installer failure restores the update command and is reported as a failed task", async (t) => {
  const f = taskFixture(t, {
    update: async () => {
      throw new Error("installer failed");
    }
  });
  const task = f.create(
    { ...paper, kind: "forge", server: "forge" },
    { updateCommand: "user update command" }
  );
  await task.start();
  assert.equal(task.status(), AsyncTask.STATUS_ERROR);
  assert.match(task.toObject().error, /installer failed/);
  assert.equal(f.instance.config.updateCommand, "user update command");
  assert.equal(f.updates.length, 1);
  assert.ok(!f.output.some((line) => line.includes("TXT_CODE_1562f6cf")));
});

test("Bedrock enforces OS/architecture before creation and sets Linux executable permissions", async (t) => {
  const options = { kind: "bedrock", server: "bedrock-server", version: "linux-release-1.21.0" };
  assert.throws(
    () =>
      install.validateMinecraftInstall(
        options,
        "https://cdn.example/server.zip",
        translate,
        "win32",
        "x64"
      ),
    /platformMismatch/
  );
  assert.throws(
    () =>
      install.validateMinecraftInstall(
        options,
        "https://cdn.example/server.zip",
        translate,
        "linux",
        "arm64"
      ),
    /platformMismatch/
  );
  assert.throws(
    () =>
      install.validateMinecraftInstall(
        { ...paper, javaPath: 'bad"path' },
        "https://cdn.example/server.jar",
        translate
      ),
    /invalidDownload/
  );
  const f = taskFixture(t, {
    unzip: async (cwd) => {
      fs.writeFileSync(path.join(cwd, "bedrock_server"), "test", { mode: 0o644 });
      return true;
    }
  });
  const task = f.create(options);
  await task.start();
  assert.equal(task.status(), AsyncTask.STATUS_STOP);
  assert.deepEqual(f.unzips, ["mcsm_install_package.zip"]);
  assert.equal(f.instance.config.startCommand, "env LD_LIBRARY_PATH=. ./bedrock_server");
  assert.deepEqual(f.chmods, [{ file: path.join(f.cwd, "bedrock_server"), mode: 0o755 }]);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(path.join(f.cwd, "bedrock_server")).mode & 0o777, 0o755);
  }
  assert.equal(f.updates.length, 0);
});

test("cancelling a download prevents installation from continuing", async (t) => {
  const stream = new PassThrough();
  const f = taskFixture(t, { stream });
  const task = f.create(paper);
  const running = task.start();
  await until(() => task.downloadStream);
  await task.stop();
  await running;
  assert.equal(task.status(), AsyncTask.STATUS_STOP);
  assert.equal(f.instance.config.startCommand, "");
  assert.equal(f.updates.length, 0);
  assert.ok(!f.output.some((line) => line.includes("TXT_CODE_1562f6cf")));
});

test("a missing Java executable fails the update task without an unhandled process error", async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const { InstanceUpdateAction } = load(
    "daemon/plugins/instance/src/backend/service/instance_update_action.ts",
    {
      child_process: {
        spawn: () => {
          setImmediate(() => child.emit("error", new Error("spawn java ENOENT")));
          return child;
        }
      },
      "mcsmanager-common": { killProcess() {} },
      "../entity/commands/base/command_parser": {
        commandStringToArray: () => ["java", "-jar", "server-installer.jar"]
      },
      "../i18n": { $t: translate },
      "../service/async_task_service": { AsyncTask },
      "../service/log": logger,
      "./docker_process_service": { SetupDockerContainer: class {} }
    }
  );
  const task = new InstanceUpdateAction({
    config: { updateCommand: "java", oe: "utf-8" },
    parseTextParams: async (value) => value,
    absoluteCwdPath: () => os.tmpdir(),
    print() {},
    println() {}
  });
  await task.start();
  await assert.rejects(task.wait(), /ENOENT/);
  assert.equal(task.status(), AsyncTask.STATUS_ERROR);
});

function mountScript(t, filename, props, overrides) {
  const { parse, compileScript } = frontendRequire("@vue/compiler-sfc");
  const descriptor = parse(fs.readFileSync(path.join(root, filename), "utf8"), {
    filename
  }).descriptor;
  const script = compileScript(descriptor, { id: "minecraft-test" }).content;
  const components = new Proxy({}, { get: (_target, name) => name });
  const component = load(
    filename,
    { vue, "vuetify/components": components, ...overrides },
    script
  ).default;
  component.render = () => null;
  const renderer = vue.createRenderer({
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    setText() {},
    setElementText() {},
    parentNode: () => null,
    nextSibling: () => null,
    insert() {},
    remove() {},
    patchProp() {}
  });
  const app = renderer.createApp(component, props);
  app.mount({});
  t.after(() => app.unmount());
  return app._instance.setupState;
}

const methods = Object.fromEntries(
  ["IMPORT", "DOWNLOAD", "FILE", "DOCKER", "EXIST"].map((value) => [value, value])
);
const instanceTypes = {
  TYPE_MINECRAFT_BUNGEECORD: "minecraft/java/bungeecord",
  INSTANCE_TYPE_TRANSLATION: { universal: "Any app", "minecraft/java": "Minecraft" }
};

test("instance creation requires type, then method, then node; changing type clears dependent choices", async (t) => {
  const state = mountScript(
    t,
    "panel/plugins/instance/src/views/CreateInstance.vue",
    {},
    {
      "@/config/router": { router: { push() {} } },
      "@/lang/i18n": { t: translate },
      "@/services/apis": {
        remoteNodeList: () => ({
          execute: async () => {},
          state: vue.ref([]),
          isLoading: vue.ref(false)
        })
      },
      "@/hooks/widgets/quickStartFlow": { QUICKSTART_METHOD: methods },
      "@/hooks/useInstance": instanceTypes,
      "../widgets/setupApp/CreateInstanceForm.vue": {}
    }
  );
  assert.equal(state.step, 1);
  state.goNext();
  assert.equal(state.step, 1);
  state.instanceType = "minecraft/java";
  state.goNext();
  assert.equal(state.step, 2);
  assert.ok(state.methodOptions.some((option) => option.value === "DOWNLOAD"));
  await state.chooseMethod("DOWNLOAD");
  assert.equal(state.step, 3);
  state.goNext();
  assert.equal(state.step, 3);
  state.chooseNode({ uuid: "node", available: true });
  state.goNext();
  assert.equal(state.step, 4);
  state.formBusy = true;
  state.goBack();
  assert.equal(state.step, 4);
  state.formBusy = false;
  state.goBack();
  assert.equal(state.step, 3);
  state.instanceType = "universal";
  state.changeInstanceType();
  assert.equal(state.createMethod, "");
  assert.equal(state.daemonId, "");
  assert.ok(!state.methodOptions.some((option) => option.value === "DOWNLOAD"));
});

function formFixture(t, createMethod = "DOWNLOAD", javaSetup) {
  const confirms = [],
    creates = [],
    uploads = [],
    errors = [],
    successes = [];
  const constants = load("panel/plugins/console/src/types/const.ts", {
    "@/lang/i18n": { t: translate }
  });
  const cfg = vue.ref();
  const instanceResponse = vue.ref();
  const fileManager = {
    getFileConfigAddr: () => "https://node.example",
    uploadService: {
      uiData: vue.ref({}),
      getFileNth: () => 1,
      append(file, _url, _password, options, beforeMounted) {
        const callbacks = {};
        const task = {
          file,
          options,
          uploadedSize: 0,
          callbacks,
          addCallback: (name, callback) => {
            callbacks[name] = callback;
          },
          removeCallback() {}
        };
        uploads.push(task);
        beforeMounted(task);
        return task;
      }
    }
  };
  const state = mountScript(
    t,
    "panel/plugins/instance/src/widgets/setupApp/CreateInstanceForm.vue",
    { createMethod, daemonId: "node", instanceType: "minecraft/java", isDesktop: true },
    {
      "@/hooks/useInstance": instanceTypes,
      "@/hooks/widgets/quickStartFlow": { QUICKSTART_METHOD: methods },
      "@/lang/i18n": { t: translate },
      "@/services/apis/instance": {
        uploadAddress: () => ({
          state: cfg,
          execute: async (request) => {
            creates.push(request);
            cfg.value = { instanceUuid: "uploaded-instance", password: "test" };
          }
        }),
        createInstance: () => ({
          state: instanceResponse,
          execute: async (request) => {
            creates.push(request);
            instanceResponse.value = { instanceUuid: "existing-directory-instance" };
          }
        })
      },
      "@/plugin/context": {
        usePluginService: (name) =>
          name === "file"
            ? fileManager
            : name === "java" && javaSetup
            ? { setupComponent: {} }
            : undefined
      },
      "../../../../../../common/src/java": javaCommands,
      "@/tools/protocol": { parseForwardAddress: (url) => url },
      "@/tools/validator": { reportErrorMsg: (error) => errors.push(error) },
      "@/types/const": constants,
      "@/tools/vuetifyToast": { message: { success: (text) => successes.push(text) } },
      "@/tools/vuetifyModal": {
        Modal: {
          confirm: (options) => {
            confirms.push(options);
            return { destroy() {} };
          }
        }
      },
      "../../api": {
        createMinecraftInstance: () => ({
          execute: async (request) => {
            creates.push(request);
            return vue.ref({ instanceUuid: "downloaded-instance" });
          }
        })
      },
      "../../minecraft": catalog,
      "./MinecraftServerDownload.vue": {},
      "../instance/dialogs/components/DockerImageSelect.vue": {},
      "../instance/dialogs/SelectUnzipCode.vue": {}
    }
  );
  state.formRef = { validate: async () => ({ valid: true }) };
  state.formData.nickname = "Test";
  if (javaSetup) state.javaSetup = javaSetup;
  return { state, constants, confirms, creates, uploads, errors, successes };
}

test("download submission is validated and concurrent clicks create just one instance", async (t) => {
  const f = formFixture(t);
  await f.state.finalConfirm();
  assert.equal(f.confirms.length, 0);
  f.state.downloadSelection = { server: "paper", version: "1.21.4", build: "latest" };
  f.state.javaPath = "/java/bin/java";
  await Promise.all([f.state.finalConfirm(), f.state.finalConfirm()]);
  assert.equal(f.confirms.length, 1);
  await Promise.all([f.confirms[0].onOk(), f.confirms[0].onOk()]);
  assert.equal(f.creates.length, 1);
  assert.deepEqual(f.creates[0].data.selection, {
    server: "paper",
    version: "1.21.4",
    build: "latest",
    javaPath: "/java/bin/java"
  });
  assert.equal(f.state.createdInstanceUuid, "downloaded-instance");
  assert.equal(f.constants.defaultInstanceInfo.nickname, "");
  f.state.formData.docker.image = "custom";
  assert.notEqual(f.constants.defaultInstanceInfo.docker.image, "custom");
});

test("own JAR uploads stay intact, ZIP uploads are extracted, and cancellation is not success", async (t) => {
  for (const extension of ["jar", "zip"])
    await t.test(extension, async (t) => {
      const f = formFixture(t, "IMPORT");
      f.state.onFileChange({ name: `server.${extension}`, size: 10 });
      await f.state.selectedFile();
      const task = f.uploads[0];
      assert.equal(task.options.unzip, extension === "zip");
      assert.equal(f.state.createdInstanceUuid, "uploaded-instance");
      task.callbacks.end();
      assert.equal(f.successes.length, 0);
      assert.ok(f.errors.length);
      task.uploadedSize = task.file.size;
      task.callbacks.end();
      assert.equal(f.successes.length, 1);
      await f.state.finalConfirm();
      assert.equal(f.creates.length, 1);
    });
});

test("Java is prepared once before downloading, uploading, or creating from an existing directory", async (t) => {
  for (const method of ["DOWNLOAD", "IMPORT", "EXIST"]) {
    await t.test(method, async (t) => {
      const gate = deferred();
      let prepared = 0;
      const f = formFixture(t, method, {
        prepare: () => {
          prepared++;
          return gate.promise;
        }
      });
      f.state.downloadSelection = { server: "paper", version: "1.21.4", build: "latest" };
      f.state.formData.startCommand = 'java -Dname="a b" -jar "server name.jar"';
      if (method === "IMPORT") f.state.onFileChange({ name: "server.jar", size: 10 });
      await f.state.finalConfirm();
      const first = f.confirms[0].onOk();
      const repeated = f.confirms[0].onOk();
      assert.equal(prepared, 1);
      assert.equal(f.creates.length, 0);
      assert.equal(f.state.busy, true);
      gate.resolve({ id: "msl_21", path: "{mcsm_java}" });
      await Promise.all([first, repeated]);
      assert.equal(f.creates.length, 1);
      const config = method === "DOWNLOAD" ? f.creates[0].data.config : f.creates[0].data;
      assert.equal(config.java.id, "msl_21");
      assert.equal(config.startCommand, '{mcsm_java} -Dname="a b" -jar "server name.jar"');
      if (method === "DOWNLOAD") assert.equal(f.creates[0].data.selection.javaPath, "{mcsm_java}");
    });
  }
});

test("Java preparation failure does not create an instance and permits retry", async (t) => {
  let failing = true;
  const f = formFixture(t, "IMPORT", {
    prepare: async () => {
      if (failing) throw new Error("Java checksum failed");
      return { id: "msl_21", path: "{mcsm_java}" };
    }
  });
  f.state.onFileChange({ name: "server.jar", size: 10 });
  await f.state.finalConfirm();
  await f.confirms[0].onOk();
  assert.equal(f.creates.length, 0);
  assert.equal(f.uploads.length, 0);
  assert.match(f.errors[0].message, /checksum failed/);
  assert.equal(f.state.busy, false);
  failing = false;
  await f.state.finalConfirm();
  await f.confirms[1].onOk();
  assert.equal(f.creates.length, 1);
  assert.equal(f.creates[0].data.startCommand, '{mcsm_java} -jar "server.jar" nogui');
});

test("Docker and native Bedrock creation do not prepare host Java", async (t) => {
  const javaSetup = {
    prepare: () => {
      throw new Error("Java should not be installed");
    }
  };
  const docker = formFixture(t, "DOCKER", javaSetup);
  await docker.state.finalConfirm();
  await docker.confirms[0].onOk();
  assert.equal(docker.creates.length, 1);
  const bedrock = formFixture(t, "DOWNLOAD", javaSetup);
  bedrock.state.downloadSelection = {
    server: "bedrock-server",
    version: "linux-release",
    build: "latest"
  };
  await bedrock.state.finalConfirm();
  await bedrock.confirms[0].onOk();
  assert.equal(bedrock.creates.length, 1);
  assert.equal(bedrock.creates[0].data.config.java.id, "");
});

test("managed Java placeholders stay unquoted in Forge installers and generated commands", async (t) => {
  const options = { ...paper, javaPath: "{mcsm_java}" };
  assert.equal(
    install.minecraftInstallerCommand(options),
    "{mcsm_java} -jar server-installer.jar --installServer"
  );
  const cwd = directory(t);
  fs.writeFileSync(path.join(cwd, "server.jar"), "fixture");
  assert.equal(
    await install.minecraftStartCommand(cwd, options, translate),
    "{mcsm_java} -jar server.jar nogui"
  );
});

test("Minecraft UI and daemon messages exist in every language", () => {
  const globalDir = path.join(root, "panel/plugins/i18n/src/languages");
  const files = fs.readdirSync(globalDir).filter((name) => name.endsWith(".json"));
  assert.equal(files.length, 12);
  const keys = Object.keys(JSON.parse(fs.readFileSync(path.join(globalDir, "en_US.json")))).filter(
    (key) => key.startsWith("TXT_CODE_minecraft.")
  );
  for (const file of files) {
    const source = fs.readFileSync(path.join(globalDir, file));
    const messages = JSON.parse(source);
    for (const key of keys) assert.ok(messages[key], `${file}: ${key}`);
    const daemon = JSON.parse(
      fs.readFileSync(path.join(root, "daemon/plugins/market/src/i18n", file))
    );
    for (const key of ["invalidDownload", "platformMismatch", "missingFiles", "hashMismatch"])
      assert.ok(daemon[`TXT_CODE_minecraft.${key}`], `${file}: ${key}`);
  }
});
