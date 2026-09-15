const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { createHash } = require("node:crypto");
const { Readable, PassThrough } = require("node:stream");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const daemonRequire = Module.createRequire(path.join(root, "daemon/package.json"));
const frontendRequire = Module.createRequire(path.join(root, "frontend/package.json"));
const ts = daemonRequire("typescript");
const fse = daemonRequire("fs-extra");
const tar = daemonRequire("tar");
const vue = frontendRequire("vue");
const translate = (key) => key;

// Exercise source in memory. Downloads are streams of fixture data; Java is never executed.
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
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(predicate) {
  for (let i = 0; i < 300; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Operation did not settle");
}
function directory(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "elements-java-test-"));
  t.after(() => {
    assert.equal(path.dirname(cwd), path.resolve(os.tmpdir()));
    assert.ok(path.basename(cwd).startsWith("elements-java-test-"));
    fs.rmSync(cwd, { recursive: true, force: true });
  });
  return cwd;
}
const javaCommands = load("common/src/java.ts");
const { JavaInfo } = load("daemon/plugins/java/src/backend/java_info.ts");

function sourceFixture(platform = "linux", arch = "x64", respond) {
  const requests = [];
  const { MslJavaSource } = load("daemon/plugins/java/src/backend/msl_java.ts", {
    axios: {
      get: async (url, options) => {
        requests.push({ url, options });
        const data = respond
          ? await respond(url, options)
          : url.endsWith("/jdk")
          ? ["8", "21", "17", "21"]
          : { url: "https://cdn.example/java.tar.gz", sha256: "a".repeat(64) };
        return { data: { code: 200, data } };
      }
    }
  });
  return { source: new MslJavaSource(translate, platform, arch), requests };
}

test("MSL Java catalog maps all supported platforms and architectures, caches and sorts versions", async () => {
  for (const [platform, expected] of [
    ["linux", "linux"],
    ["win32", "windows"],
    ["darwin", "mac"]
  ]) {
    for (const arch of ["x64", "arm64"]) {
      const { source, requests } = sourceFixture(platform, arch);
      assert.deepEqual(await source.versions(), {
        platform: expected,
        arch,
        versions: ["21", "17", "8"]
      });
      await source.versions();
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, "https://api.mslmc.cn/v4/jdk");
      assert.deepEqual(requests[0].options.params, { os: expected, arch });
      assert.equal(requests[0].options.headers["User-Agent"], "ElementsPanel");
      assert.equal(requests[0].options.headers.deviceID, undefined);
      assert.ok(requests[0].options.timeout > 0);
      source.dispose();
      assert.equal(requests[0].options.signal.aborted, true);
    }
  }
});

test("unsupported targets and malformed versions fail without requesting a download", async () => {
  for (const target of [
    ["freebsd", "x64"],
    ["linux", "ia32"]
  ]) {
    const f = sourceFixture(...target);
    await assert.rejects(f.source.versions(), /unsupportedPlatform/);
    assert.equal(f.requests.length, 0);
  }
  const f = sourceFixture();
  for (const version of ["../21", "21/x", "", 21, "99"]) {
    await assert.rejects(f.source.download(version), /invalidVersion/);
  }
  assert.ok(f.requests.every(({ url }) => !url.includes("/download/")));
});

test("MSL downloads refresh URLs, reject bad metadata and infer signed archive formats", async () => {
  for (const [platform, archive] of [
    ["linux", "tar.gz"],
    ["win32", "zip"],
    ["darwin", "tar.gz"]
  ]) {
    let download = { url: "https://cdn.example/signed?token=fixture", sha256: "b".repeat(64) };
    const f = sourceFixture(platform, "x64", (url) => (url.endsWith("/jdk") ? ["21"] : download));
    assert.equal((await f.source.download("21")).archive, archive);
    download = { url: "https://cdn.example/new.zip", sha256: "c".repeat(64) };
    assert.equal((await f.source.download("21")).url, download.url);
    assert.equal(f.requests.filter(({ url }) => url.endsWith("/download/jdk/21")).length, 2);
    for (const bad of [
      { url: "http://cdn.example/a.zip" },
      { url: "https://user:pw@cdn.example/a.zip" },
      { url: download.url, sha256: "wrong" }
    ]) {
      download = bad;
      await assert.rejects(f.source.download("21"), /sourceError/);
    }
  }
  let catalog = [21];
  const f = sourceFixture("linux", "x64", () => catalog);
  await assert.rejects(f.source.versions(), /sourceError/);
  catalog = ["21"];
  assert.deepEqual((await f.source.versions()).versions, ["21"]);
});

async function tarFixture(t, relative, symlink) {
  const cwd = directory(t);
  const source = path.join(cwd, "source");
  const file = path.join(source, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (symlink) fs.symlinkSync(symlink, file);
  else fs.writeFileSync(file, "fixture java - never executed", { mode: 0o644 });
  const archive = path.join(cwd, "payload.tar.gz");
  await tar.create({ cwd: source, file: archive, gzip: true }, [relative.split("/")[0]]);
  return fs.readFileSync(archive);
}
function installerFixture(t, payload, overrides = {}) {
  const cwd = directory(t);
  const progress = [],
    unzips = [];
  const controller = new AbortController();
  const stream = overrides.stream || Readable.from([payload]);
  const installer = load("daemon/plugins/java/src/backend/java_install.ts", {
    axios: {
      get: async (_url, options) => {
        assert.equal(options.headers["User-Agent"], "ElementsPanel");
        return { data: stream, headers: { "content-length": String(payload.length) } };
      }
    }
  });
  const options = {
    download: {
      url: "https://cdn.example/java.tar.gz",
      archive: "tar.gz",
      sha256: createHash("sha256").update(payload).digest("hex")
    },
    directory: cwd,
    signal: controller.signal,
    platform: "linux",
    translate,
    progress: (value) => progress.push(value),
    unzip: async (...args) => {
      unzips.push(args);
      return false;
    },
    ...overrides
  };
  return { ...installer, options, cwd, stream, controller, progress, unzips };
}

test("Java archives keep actual Linux and macOS runtime roots and executable permissions", async (t) => {
  for (const [platform, home] of [
    ["linux", "jdk-21+35"],
    ["darwin", "temurin-21.jdk/Contents/Home"]
  ]) {
    const payload = await tarFixture(t, `${home}/bin/java`);
    const f = installerFixture(t, payload, { platform });
    const installed = await f.installJavaArchive(f.options);
    assert.equal(installed, path.join(f.cwd, "runtime", home));
    assert.equal(fs.statSync(path.join(installed, "bin/java")).mode & 0o777, 0o755);
    assert.equal(fs.existsSync(path.join(f.cwd, ".install")), false);
    assert.ok(f.progress.length);
  }
});

test("Windows ZIP installation locates Java even when its folder differs from the archive name", async (t) => {
  const f = installerFixture(t, Buffer.from("zip fixture"), { platform: "win32" });
  f.options.download.archive = "zip";
  let extracted = false;
  f.options.unzip = async (directory, file, destination) => {
    assert.equal(file, "archive.zip");
    assert.equal(destination, "runtime");
    const executable = path.join(directory, destination, "jdk-21.0.5+11", "bin/java.exe");
    await fse.outputFile(executable, "fixture");
    extracted = true;
    return true;
  };
  const installed = await f.installJavaArchive(f.options);
  assert.equal(extracted, true);
  assert.equal(installed, path.join(f.cwd, "runtime/jdk-21.0.5+11"));
  assert.equal(
    await f.findJavaExecutable(installed, "win32"),
    path.join(installed, "bin/java.exe")
  );
});

test("checksum and extraction failures never leave an installed runtime", async (t) => {
  const f = installerFixture(t, Buffer.from("broken package"));
  f.options.download = { ...f.options.download, archive: "zip", sha256: "0".repeat(64) };
  await assert.rejects(f.installJavaArchive(f.options), /checksumFailed/);
  assert.equal(f.unzips.length, 0);
  assert.equal(fs.existsSync(path.join(f.cwd, "runtime")), false);
  assert.equal(fs.existsSync(path.join(f.cwd, ".install")), false);
  const extract = installerFixture(t, Buffer.from("zip fixture"));
  extract.options.download.archive = "zip";
  await assert.rejects(extract.installJavaArchive(extract.options), /extractFailed/);
  assert.equal(fs.existsSync(path.join(extract.cwd, "runtime")), false);
  const missing = installerFixture(t, await tarFixture(t, "jdk-21/LICENSE"));
  await assert.rejects(missing.installJavaArchive(missing.options), /82c8bca3/);
});

test("escaping tar symlinks are rejected, and interrupted downloads clean up their streams", async (t) => {
  const unsafe = installerFixture(t, await tarFixture(t, "jdk/bin/java", "../../../outside"));
  await assert.rejects(unsafe.installJavaArchive(unsafe.options), /extractFailed/);
  assert.equal(fs.existsSync(path.join(unsafe.cwd, "runtime")), false);
  const f = installerFixture(t, Buffer.alloc(1), { stream: new PassThrough() });
  const promise = f.installJavaArchive(f.options);
  await until(() => fs.existsSync(path.join(f.cwd, ".install/archive.tar.gz")));
  const rejection = assert.rejects(promise, /abort|interrupted/i);
  f.controller.abort();
  await rejection;
  assert.equal(f.stream.destroyed, true);
  assert.equal(fs.existsSync(path.join(f.cwd, ".install")), false);
});

function managerFixture(t, options = {}) {
  const cwd = directory(t),
    installs = [],
    sources = [];
  const realInstaller = load("daemon/plugins/java/src/backend/java_install.ts");
  const { JavaManager } = load("daemon/plugins/java/src/backend/java_manager.ts", {
    "../../../../../common/src/java": javaCommands,
    "./java_info": { JavaInfo },
    "./msl_java": {
      MslJavaSource: class {
        constructor() {
          sources.push(this);
        }
        async versions() {
          return { platform: "linux", arch: "x64", versions: ["21", "17", "8"] };
        }
        async download() {
          return { url: "https://cdn.example/java.tar.gz", archive: "tar.gz" };
        }
        dispose() {
          this.disposed = true;
        }
      }
    },
    "./java_install": {
      findJavaExecutable: realInstaller.findJavaExecutable,
      installJavaArchive: async (args) => {
        installs.push(args);
        if (options.install) return options.install(args, installs.length);
        const home = path.join(args.directory, "runtime/jdk-21");
        await fse.outputFile(path.join(home, "bin/java"), "fixture");
        return home;
      }
    },
    ...(options.overrides || {})
  });
  const dependencies = {
    defaultJavaDataPath: cwd,
    translate,
    unzip: async () => true,
    logger: { info() {}, warn() {} }
  };
  const manager = new JavaManager(dependencies);
  t.after(() => manager.dispose());
  return { manager, cwd, installs, sources, JavaManager, dependencies };
}

test("concurrent Java downloads share one installation and persist in the configured data directory", async (t) => {
  const gate = deferred();
  const f = managerFixture(t, {
    install: async (args) => {
      args.progress(42);
      await gate.promise;
      const home = path.join(args.directory, "runtime/real-jdk");
      await fse.outputFile(path.join(home, "bin/java"), "fixture");
      return home;
    }
  });
  const [a, b] = await Promise.all([f.manager.startInstall("21"), f.manager.startInstall("21")]);
  assert.equal(a, b);
  await until(() => f.installs.length === 1);
  assert.equal(a.info.downloading, true);
  assert.equal(a.info.progress, 42);
  const infoPath = path.join(f.cwd, "msl_21/java_info.json");
  assert.equal(fse.readJsonSync(infoPath).downloading, true);
  await assert.rejects(f.manager.getJavaRuntimeCommand("msl_21"), /45d02bb7/);
  await assert.rejects(f.manager.removeJava("msl_21"), /887fee99/);
  gate.resolve();
  await until(() => !a.info.downloading);
  assert.equal(a.info.error, undefined);
  assert.equal(a.info.progress, 100);
  assert.equal(fse.readJsonSync(infoPath).path, a.info.path);
  assert.equal(fse.readJsonSync(infoPath).downloading, false);
  assert.equal(await f.manager.getJavaRuntimeCommand("msl_21"), `"${a.info.path}/bin/java"`);
  assert.equal(await f.manager.startInstall("21"), a);
  assert.equal(f.installs.length, 1);
  const reloaded = new f.JavaManager(f.dependencies);
  await reloaded.ready;
  assert.equal(reloaded.getJava("msl_21").info.path, a.info.path);
  await reloaded.dispose();
});

test("failed Java installations record an error and can be retried", async (t) => {
  const f = managerFixture(t, {
    install: async (args, attempt) => {
      if (attempt === 1) throw new Error("checksum failed fixture");
      const home = path.join(args.directory, "runtime/jdk");
      await fse.outputFile(path.join(home, "bin/java"), "fixture");
      return home;
    }
  });
  const runtime = await f.manager.startInstall("21");
  await until(() => !runtime.info.downloading);
  assert.match(runtime.info.error, /checksum failed/);
  assert.equal(runtime.info.path, undefined);
  await assert.rejects(f.manager.getJavaRuntimeCommand("msl_21"), /checksum failed/);
  const retry = await f.manager.startInstall("21");
  await until(() => !retry.info.downloading);
  assert.equal(retry.info.error, undefined);
  assert.equal(f.installs.length, 2);
});

test("unloading Java aborts its installation and interrupted metadata remains retryable", async (t) => {
  const f = managerFixture(t, {
    install: ({ signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      })
  });
  const runtime = await f.manager.startInstall("17");
  await until(() => f.installs.length === 1);
  await f.manager.dispose();
  assert.equal(runtime.info.downloading, false);
  assert.match(runtime.info.error, /interrupted/);
  assert.equal(f.sources[0].disposed, true);
  assert.equal(f.installs[0].signal.aborted, true);
  await assert.rejects(f.manager.startInstall("21"), /interrupted/);
  const brokenPath = path.join(f.cwd, "msl_8");
  await fse.outputJson(path.join(brokenPath, "java_info.json"), {
    name: "msl",
    version: "8",
    downloading: true
  });
  await fse.outputFile(path.join(brokenPath, ".install/archive.zip"), "partial");
  const reloaded = new f.JavaManager(f.dependencies);
  await reloaded.ready;
  assert.match(reloaded.getJava("msl_8").info.error, /interrupted/);
  assert.equal(fs.existsSync(path.join(brokenPath, ".install")), false);
  await reloaded.dispose();
});

test("legacy Zulu and external Java remain usable, and deleting metadata keeps external files", async (t) => {
  const f = managerFixture(t);
  await f.manager.ready;
  const external = directory(t);
  await fse.outputFile(path.join(external, "bin/java"), "existing");
  const legacyPath = path.join(f.cwd, "zulu_17");
  await fse.outputJson(path.join(legacyPath, "java_info.json"), {
    name: "zulu",
    version: "17",
    downloading: false
  });
  await fse.outputFile(path.join(legacyPath, "bin/java"), "legacy");
  await f.manager.loadJavaList();
  assert.equal(await f.manager.getJavaRuntimeCommand("zulu_17"), `"${legacyPath}/bin/java"`);
  const info = new JavaInfo("External", Date.now());
  info.path = external;
  f.manager.addJava(info);
  assert.equal(await f.manager.getJavaRuntimeCommand("External"), `"${external}/bin/java"`);
  f.manager.getJava("External").usingInstances.push("running-instance");
  await assert.rejects(f.manager.removeJava("External"), /ea8ea5d1/);
  f.manager.getJava("External").usingInstances = [];
  await f.manager.removeJava("External");
  assert.equal(fs.existsSync(path.join(external, "bin/java")), true);
  assert.equal(fs.existsSync(path.join(f.cwd, "External")), false);
});

test("Java command binding preserves quoted arguments and leaves custom scripts intact", () => {
  const args = ' -Xmx2G -Dname="a b" -jar "server with spaces.jar" nogui';
  for (const executable of [
    "java",
    '"C:\\Program Files\\Java\\bin\\java.exe"',
    '"/opt/java 21/bin/java"',
    "{mcsm_java}"
  ]) {
    assert.equal(
      javaCommands.bindJavaCommand(executable + args, "{mcsm_java}"),
      "{mcsm_java}" + args
    );
  }
  assert.equal(javaCommands.bindJavaCommand("bash run.sh", "{mcsm_java}"), "bash run.sh");
  assert.equal(javaCommands.javaExecutableCommand("{mcsm_java}"), "{mcsm_java}");
  assert.equal(
    javaCommands.bindJavaCommand("java -jar server.jar", "/java path/bin/java"),
    '"/java path/bin/java" -jar server.jar'
  );
});

test("Java HTTP routes allow admin setup before instance creation and retain instance ownership checks", async () => {
  const routes = new Map(),
    requests = [];
  const router = Object.fromEntries(
    ["get", "post", "delete"].map((method) => [
      method,
      (name, ...handlers) => routes.set(`${method}:${name}`, handlers)
    ])
  );
  const { registerJavaManagerRoutes } = load("panel/plugins/java/src/backend/java_router.ts");
  registerJavaManagerRoutes({
    koa: { router: () => router },
    roles: { USER: 1, ADMIN: 10 },
    i18n: { $t: translate },
    middleware: {
      validator: load("panel/plugins/runtime/src/backend/middleware/validator.ts").default,
      permission:
        ({ level }) =>
        async (ctx, next) => {
          if (ctx.role < level) throw new Error("forbidden");
          await next();
        },
      speedLimit: () => async (_ctx, next) => next()
    },
    identity: {
      of: (ctx) => ({ elevated: ctx.role === 10 }),
      canAccessInstance: (_ctx, daemonId, instanceId) =>
        daemonId === "node" && instanceId === "owned"
    },
    remote: {
      services: { getInstance: (id) => ({ id }) },
      Request: class {
        constructor(node) {
          this.node = node;
        }
        async request(...args) {
          requests.push([this.node, ...args]);
          return [];
        }
      }
    }
  });
  async function dispatch(
    route,
    role = 10,
    query = { daemonId: "node" },
    body = { name: "msl", version: "21" }
  ) {
    const ctx = { role, query, request: { body } };
    const handlers = routes.get(route);
    async function next(index = 0) {
      if (handlers[index]) await handlers[index](ctx, () => next(index + 1));
    }
    await next();
    return ctx;
  }
  for (const route of ["get:/list", "get:/catalog", "post:/download"]) await dispatch(route);
  assert.deepEqual(
    requests.map((request) => request[1]),
    ["java_manager/list", "java_manager/catalog", "java_manager/download"]
  );
  assert.equal(requests[1][3], 20000);
  const missing = await dispatch("get:/list", 1);
  assert.equal(missing.status, 400);
  assert.match(missing.body, /eb401a37/);
  const denied = await dispatch("get:/list", 1, { daemonId: "node", instanceId: "someone-else" });
  assert.equal(denied.status, 400);
  assert.match(denied.body, /eb401a37/);
  await dispatch("get:/list", 1, { daemonId: "node", instanceId: "owned" });
  await assert.rejects(dispatch("get:/catalog", 1), /forbidden/);
  await assert.rejects(dispatch("post:/download", 1), /forbidden/);
  await dispatch("post:/using", 1, { daemonId: "node", instanceId: "owned" }, { id: "msl_21" });
  assert.equal(
    (
      await dispatch(
        "post:/using",
        1,
        { daemonId: "node", instanceId: "someone-else" },
        { id: "msl_21" }
      )
    ).status,
    400
  );
});

test("Java protocol replies once to downloads and preserves quotes when binding a runtime", async () => {
  const handlers = new Map(),
    replies = [],
    failures = [],
    updates = [];
  let available = true;
  const manager = {
    startInstall: async (version) => ({ info: { fullname: `msl_${version}`, downloading: true } }),
    getJavaRuntimeCommand: async () => {
      if (!available) throw new Error("not ready");
      return '"/java/bin/java"';
    }
  };
  const { registerJavaManagerRoutes } = load("daemon/plugins/java/src/backend/java_router.ts", {
    "../../../../../common/src/java": javaCommands,
    "./java_info": { JavaInfo }
  });
  registerJavaManagerRoutes(
    {
      i18n: { $t: translate },
      protocol: {
        on: (name, handler) => handlers.set(name, handler),
        response: (_ctx, data) => replies.push(data),
        responseError: (_ctx, error) => failures.push(error)
      },
      instances: {
        subsystem: {
          getInstance: () => ({
            config: { startCommand: 'java -Dname="a b" -jar "server name.jar"' },
            parameters: (value) => updates.push(value)
          })
        }
      }
    },
    manager
  );
  await handlers.get("java_manager/download")({}, { name: "zulu", version: "21" });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].info.fullname, "msl_21");
  await handlers.get("java_manager/using")({}, { instanceId: "instance", id: "msl_21" });
  assert.equal(updates[0].startCommand, '{mcsm_java} -Dname="a b" -jar "server name.jar"');
  available = false;
  await handlers.get("java_manager/using")({}, { instanceId: "instance", id: "msl_21" });
  assert.equal(updates.length, 1);
  assert.equal(failures.length, 1);
});

function mountComponent(t, component, props = {}) {
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
  return { app, state: app._instance.setupState, props: app._instance.props };
}
function mountScript(t, filename, props, overrides) {
  const { parse, compileScript } = frontendRequire("@vue/compiler-sfc");
  const descriptor = parse(fs.readFileSync(path.join(root, filename), "utf8"), {
    filename
  }).descriptor;
  const source = compileScript(descriptor, { id: "java-test" }).content;
  return mountComponent(
    t,
    load(
      filename,
      { vue, "vuetify/components": new Proxy({}, { get: (_target, name) => name }), ...overrides },
      source
    ).default,
    props
  );
}
function setupFixture(t, options = {}) {
  const downloads = [],
    polls = [],
    validEvents = [];
  const installed = [{ info: { fullname: "external", downloading: false }, usingInstances: [] }];
  const fixture = mountScript(
    t,
    "panel/plugins/java/src/components/JavaSetup.vue",
    { daemonId: "node", onValid: (value) => validEvents.push(value) },
    {
      "@/lang/i18n": { t: translate },
      "../hooks/useJavaList": {
        useJavaList: () => ({
          javaList: vue.ref(installed),
          loading: vue.ref(false),
          error: vue.ref(""),
          refresh: async () => installed
        })
      },
      "./JavaVersionSelect.vue": {},
      "../api": {
        downloadJava: () => ({
          execute: async (request) => {
            downloads.push(request);
            return vue.ref({ info: { fullname: "msl_21", downloading: true } });
          }
        }),
        getJavaList: () => ({
          execute: async (request) => {
            polls.push(request);
            return vue.ref(
              options.list
                ? await options.list(polls.length)
                : [{ info: { fullname: "msl_21", downloading: false } }, ...installed]
            );
          }
        })
      }
    }
  );
  return { ...fixture, downloads, polls, validEvents };
}

test("creating with Java defaults to system paths and validates existing environment selection", async (t) => {
  const f = setupFixture(t);
  assert.deepEqual(await f.state.prepare(), { id: "", path: "java" });
  assert.equal(f.downloads.length, 0);
  f.state.customPath = "/java with spaces/bin/java";
  assert.deepEqual(await f.state.prepare(), { id: "", path: "/java with spaces/bin/java" });
  f.state.customPath = 'invalid"path';
  await assert.rejects(f.state.prepare(), /selectJava/);
  f.state.mode = "installed";
  assert.equal(f.state.valid, false);
  f.state.runtimeId = "external";
  assert.deepEqual(await f.state.prepare(), { id: "external", path: "{mcsm_java}" });
  assert.equal(f.downloads.length, 0);
});

test("online Java preparation waits for installation, reports progress, and ignores repeated submission", async (t) => {
  const f = setupFixture(t, {
    list: (count) => [
      { info: { fullname: "msl_21", downloading: count === 1, progress: count === 1 ? 42 : 100 } }
    ]
  });
  f.state.mode = "download";
  f.state.version = "21";
  const first = f.state.prepare();
  const second = f.state.prepare();
  assert.equal(first, second);
  await until(() => f.state.progress === 42);
  assert.equal(f.state.preparing, true);
  assert.equal(f.downloads.length, 1);
  assert.deepEqual(f.downloads[0].data, { name: "msl", version: "21" });
  assert.deepEqual(await first, { id: "msl_21", path: "{mcsm_java}" });
  assert.equal(f.state.preparing, false);
});

test("Java preparation exposes failures for retry and stops polling after unmount", async (t) => {
  let error = "checksum failed";
  const f = setupFixture(t, {
    list: () => [{ info: { fullname: "msl_21", downloading: false, error } }]
  });
  f.state.mode = "download";
  f.state.version = "21";
  await assert.rejects(f.state.prepare(), /checksum failed/);
  assert.equal(f.state.installError, "checksum failed");
  error = undefined;
  assert.equal((await f.state.prepare()).id, "msl_21");
  const disposed = setupFixture(t, {
    list: () => [{ info: { fullname: "msl_21", downloading: true } }]
  });
  disposed.state.mode = "download";
  disposed.state.version = "21";
  const pending = disposed.state.prepare();
  await until(() => disposed.polls.length === 1);
  const rejection = assert.rejects(pending, /interrupted/);
  disposed.app.unmount();
  await rejection;
  assert.equal(disposed.polls.length, 1);
  assert.equal(disposed.downloads[0].signal.aborted, true);
});

test("changing a Java catalog node discards stale versions and aborts its request", async (t) => {
  const requests = [],
    gates = [deferred(), deferred()];
  const f = mountScript(
    t,
    "panel/plugins/java/src/components/JavaVersionSelect.vue",
    { daemonId: "old" },
    {
      "@/lang/i18n": { t: translate },
      "../assets/msl-logo.png": "logo.png",
      "../api": {
        getJavaCatalog: () => ({
          execute: async (request) => {
            const index = requests.length;
            requests.push(request);
            return vue.ref(await gates[index].promise);
          }
        })
      }
    }
  );
  f.props.daemonId = "new";
  await vue.nextTick();
  assert.equal(requests[0].signal.aborted, true);
  gates[1].resolve({ versions: ["21"] });
  await until(() => f.state.versions.length === 1);
  gates[0].resolve({ versions: ["8"] });
  await tick();
  assert.deepEqual([...f.state.versions], ["21"]);
});

test("all new Java messages are translated in every panel and daemon locale", () => {
  const reference = JSON.parse(
    fs.readFileSync(path.join(root, "panel/plugins/java/src/i18n/en_US.json"))
  );
  const keys = Object.keys(reference).filter((key) => key.startsWith("TXT_CODE_javaMsl."));
  assert.ok(keys.length >= 10);
  for (const side of ["panel", "daemon"]) {
    const dir = path.join(root, side, "plugins/java/src/i18n");
    const files = fs.readdirSync(dir).filter((name) => name.endsWith(".json"));
    assert.equal(files.length, 12);
    for (const file of files) {
      const messages = JSON.parse(fs.readFileSync(path.join(dir, file)));
      for (const key of keys) assert.ok(messages[key], `${side}/${file}: ${key}`);
    }
  }
});

test("Java list refresh after a download cannot reuse an older in-flight response", async (t) => {
  const requests = [],
    gates = [deferred(), deferred(), deferred()];
  const active = vue.ref(true);
  const daemonId = vue.ref("first");
  const { useJavaList } = load("panel/plugins/java/src/hooks/useJavaList.ts", {
    vue,
    "../api": {
      getJavaList: () => ({
        execute: async (request) => {
          const index = requests.length;
          requests.push(request);
          return vue.ref(await gates[index].promise);
        }
      })
    }
  });
  const f = mountComponent(
    t,
    vue.defineComponent({
      setup: () => useJavaList({ daemonId: () => daemonId.value, active: () => active.value })
    })
  );
  const refreshed = f.state.refresh(true);
  assert.equal(requests.length, 1);
  gates[0].resolve([]);
  await until(() => requests.length === 2);
  gates[1].resolve([{ info: { fullname: "msl_21", downloading: true } }]);
  await refreshed;
  assert.equal(f.state.javaList[0].info.downloading, true);
  daemonId.value = "second";
  await vue.nextTick();
  assert.equal(requests[1].signal.aborted, true);
  assert.equal(requests[2].params.daemonId, "second");
  active.value = false;
  await vue.nextTick();
  assert.equal(requests[2].signal.aborted, true);
  gates[2].resolve([{ info: { fullname: "stale", downloading: false } }]);
  await tick();
  assert.equal(f.state.javaList.length, 0);
});

test("Java persistence errors are reported instead of rejecting an unobserved background job", async (t) => {
  const f = managerFixture(t, {
    overrides: {
      "fs-extra": {
        ...fse,
        writeJsonSync(file, data) {
          if (data.downloading === false) throw new Error("disk is full");
          return fse.writeJsonSync(file, data);
        }
      }
    }
  });
  const runtime = await f.manager.startInstall("21");
  await until(() => !runtime.info.downloading);
  assert.match(runtime.info.error, /persistFailed.*disk is full/);
  await assert.rejects(f.manager.getJavaRuntimeCommand("msl_21"), /persistFailed/);
  await f.manager.dispose();
});
