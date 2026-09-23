const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { EventEmitter } = require("node:events");
const { test, after } = require("node:test");

const root = path.resolve(__dirname, "../..");
const frontendRequire = Module.createRequire(path.join(root, "frontend/package.json"));
const panelRequire = Module.createRequire(path.join(root, "panel/package.json"));
const ts = panelRequire("typescript");
const { JSDOM } = frontendRequire("jsdom");
const dom = new JSDOM("<!doctype html><div id='app-mount-point'></div>", {
  url: "http://localhost"
});
for (const name of [
  "window",
  "CustomEvent",
  "document",
  "SVGElement",
  "Element",
  "Node",
  "HTMLElement",
  "localStorage",
  "history",
  "location"
]) {
  global[name] = dom.window[name];
}
after(() => dom.window.close());

const vue = frontendRequire("vue");
const { Context, Logger } = frontendRequire("cordis");
const { createRouter, createMemoryHistory } = frontendRequire("vue-router");

function load(filename, overrides = {}, environment = {}) {
  filename = path.join(root, filename);
  const mod = new Module(filename, module);
  const localRequire = Module.createRequire(filename);
  const requireSource = (id) => {
    const candidate = path.resolve(path.dirname(filename), id) + ".ts";
    if (id.startsWith(".") && fs.existsSync(candidate)) return load(path.relative(root, candidate));
    return localRequire(id);
  };
  mod.environment = environment;
  mod.require = (id) => {
    if (Object.hasOwn(overrides, id)) return overrides[id];
    return id.startsWith(".") ? requireSource(id) : frontendRequire(id);
  };
  const source = fs.readFileSync(filename, "utf8").replaceAll("import.meta.env.DEV", "true");
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  const globals = Object.keys(environment)
    .map((key) => `const ${key} = module.environment.${key};`)
    .join("\n");
  mod._compile(`${globals}\n${compiled}`, filename);
  return mod.exports;
}

function frontendFixture(t, { user = true, failStatus = false } = {}) {
  const ctx = new Context();
  t.after(() => ctx.stop());
  const events = [];
  const state = { language: "en_us", userInfo: null };
  const store = {
    state,
    async updatePanelStatus() {
      await Promise.resolve();
      if (failStatus) throw new Error("Request failed with status code 500");
      state.language = "zh_cn";
      events.push("status");
    },
    async updateUserInfo() {
      await Promise.resolve();
      state.userInfo = { permission: 10 };
      events.push(user ? "session" : "anonymous");
    }
  };
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  const Root = {
    setup() {
      events.push("mount");
      return () => vue.h("main", { id: "plugin-console" }, String(state.userInfo?.permission));
    }
  };
  const loading = { setLoadingTitle() {}, setAppLoadingError() {} };
  const runtime = load("panel/plugins/runtime/src/frontend.ts", {
    "@console/stores/useAppStateStore": { useAppStateStore: () => store },
    "@console/tools/dom": loading
  });
  const i18n = load("panel/plugins/i18n/src/frontend.ts", {
    "@/lang/i18n": { LANGUAGE_KEY: "test-language", toStandardLang: (value) => value || "en_us" },
    "./messages": { baseLocaleMessages: { en_us: {}, zh_cn: {} } }
  });
  const services = load("panel/plugins/console/src/plugin/services.ts", {
    "@console/config/router": { router }
  });
  const bootstrap = load("panel/plugins/console/src/bootstrap.ts", {
    "@/lang/i18n": { getI18nInstance: () => ctx.i18n.instance },
    "./config/router": { router },
    "./stores/useAppStateStore": { useAppStateStore: () => store },
    "./tools/dom": loading,
    "./ConsoleApp.vue": Root,
    "./plugin/services": services
  });
  const session = load("panel/plugins/user/src/session.ts", {
    "@/lang/i18n": { t: (key) => key },
    "@/stores/useAppStateStore": { useAppStateStore: () => store }
  });
  const modules = {
    runtime,
    i18n,
    console: {
      inject: ["i18n", "startup"],
      async apply(scope) {
        const { ctx: application } = await bootstrap.prepareApplication(scope);
        application.set("console", { root: Root });
        application.routes.add({ path: "/", component: Root });
        application.routes.add({ path: "/404", component: Root });
        events.push("console");
      }
    },
    feature: {
      inject: ["console", "routes", "menus", "desktop"],
      apply(scope) {
        scope.routes.add({ path: "/feature", component: Root });
        scope.menus.app({ title: "Feature", click() {} });
        scope.desktop.app({ id: "feature", label: "Feature", route: "/feature", icon: "icon" });
        scope.on("ready", () => {
          assert.equal(document.querySelector("#plugin-console")?.textContent, "10");
          events.push("ready");
        });
      }
    }
  };
  if (user)
    modules.user = {
      inject: ["console"],
      apply(scope) {
        scope.set("user", { restoreSession: session.restoreSession });
      }
    };
  const sources = Object.entries(modules)
    .reverse()
    .map(([id, plugin]) => ({
      metadata: { id },
      directory: id,
      assetDirectory: id,
      load: async () => plugin
    }));
  const loader = load("frontend/src/plugin/loader.ts", {
    "./context": { ctx },
    "virtual:panel-plugins": { panelPluginModules: sources }
  });
  const install = load("frontend/src/plugin/install.ts", {
    "./context": { ctx },
    "./loader": loader
  });
  return { ctx, events, loader, router, sources, start: install.setupPanelFrontendPlugins };
}

test("frontend foundations restore language and session before mounting and ready hooks", async (t) => {
  const fixture = frontendFixture(t);
  await fixture.start();
  assert.equal(fixture.ctx.i18n.getCurrentLang(), "zh_cn");
  assert.deepEqual(fixture.events, ["status", "console", "session", "mount", "ready"]);
  assert.equal(fixture.ctx.routes.ownerOf("/feature"), "feature");
  assert.equal(fixture.ctx.menus.appMenus.length, 1);
  await fixture.router.push("/feature");
  await fixture.loader.unloadPlugin("feature");
  assert.equal(fixture.router.currentRoute.value.path, "/404");
  assert.equal(fixture.ctx.routes.ownerOf("/feature"), undefined);
  assert.equal(fixture.ctx.menus.appMenus.length, 0);
  assert.equal(fixture.ctx.desktop.apps.length, 0);
});

test("frontend without the user plugin mounts with the anonymous identity", async (t) => {
  const fixture = frontendFixture(t, { user: false });
  await fixture.start();
  assert.deepEqual(fixture.events, ["status", "console", "anonymous", "mount", "ready"]);
});

test("a failed startup request stops before loading language or mounting the console", async (t) => {
  const fixture = frontendFixture(t, { failStatus: true });
  await assert.rejects(fixture.start(), /backend is currently unavailable/);
  assert.equal(fixture.ctx.get("i18n"), undefined);
  assert.equal(fixture.ctx.get("console"), undefined);
  assert.equal(document.querySelector("#plugin-console"), null);
});

test("feature-owned configuration migrations retain data and are idempotent", () => {
  for (const [side, plugin, category, input, expected] of [
    [
      "panel",
      "user",
      "User",
      { instances: [{ instanceUuid: "instance", serviceUuid: "node" }] },
      { instances: [{ instanceUuid: "instance", daemonId: "node" }] }
    ],
    [
      "daemon",
      "instance",
      "InstanceConfig",
      { endTime: "2030-01-01T00:00:00Z", passWordType: 1 },
      { endTime: Date.parse("2030-01-01T00:00:00Z"), passWordType: 1 }
    ]
  ]) {
    const { migrateConfig } = load(
      `${side}/plugins/${plugin}/src/backend/service/version_adapter.ts`
    );
    let stored = JSON.stringify(input);
    let writes = 0;
    const ctx = {
      storage: {
        readDir: (name) => {
          assert.equal(name, category);
          return ["record.json"];
        },
        readFile: () => stored,
        writeFile: (_name, value) => {
          stored = value;
          writes++;
        }
      },
      logger: {
        info() {},
        error: (error) => {
          throw error;
        }
      },
      i18n: { $t: (key) => key }
    };
    migrateConfig(ctx);
    assert.deepEqual(JSON.parse(stored), expected);
    migrateConfig(ctx);
    assert.equal(writes, 1);
  }
});

for (const side of ["panel", "daemon"]) {
  test(`${side} runtime releases file logs and process handlers on shutdown`, async (t) => {
    const ctx = new Context();
    t.after(() => ctx.stop());
    const initialTargets = [...Logger.targets];
    const initialLevels = Logger.levels;
    const openFiles = new Set();
    let nextFd = 0;
    const fakeFs = {
      existsSync: () => false,
      ensureFileSync() {},
      openSync: () => {
        const fd = ++nextFd;
        openFiles.add(fd);
        return fd;
      },
      writeSync() {},
      closeSync: (fd) => openFiles.delete(fd)
    };
    const fakeProcess = Object.assign(new EventEmitter(), { stdin: new EventEmitter() });
    const exited = new Promise((resolve) => {
      fakeProcess.exit = resolve;
    });
    const { setupLogging } = load(`${side}/plugins/runtime/src/backend/service/log.ts`, {
      "fs-extra": fakeFs
    });
    const { setupProcessLifecycle } = load(
      `${side}/plugins/runtime/src/backend/lifecycle.ts`,
      {},
      { process: fakeProcess }
    );
    ctx.plugin({
      apply(scope) {
        setupLogging(scope);
        setupProcessLifecycle(scope);
      }
    });
    assert.equal(fakeProcess.listenerCount("SIGTERM"), 1);
    assert.equal(fakeProcess.stdin.listenerCount("data"), 1);
    assert.equal(openFiles.size, side === "daemon" ? 2 : 1);
    fakeProcess.emit("SIGTERM");
    assert.equal(await exited, 0);
    assert.deepEqual(fakeProcess.eventNames(), []);
    assert.equal(fakeProcess.stdin.listenerCount("data"), 0);
    assert.equal(openFiles.size, 0);
    assert.deepEqual(Logger.targets, initialTargets);
    assert.equal(Logger.levels, initialLevels);
  });
}

test("browser synchronization replaces changed plugin revisions and serializes concurrent refreshes", async (t) => {
  const fixture = frontendFixture(t, { user: false });
  await fixture.start();
  const { ctx, loader, sources } = fixture;
  const index = sources.findIndex((source) => source.metadata.id === "feature");
  let applies = 0;
  sources[index] = {
    ...sources[index],
    revision: "new-generation",
    load: async () => ({
      inject: ["console"],
      apply(scope) {
        applies++;
        scope.set("generation", "new");
      }
    })
  };
  await Promise.all([loader.refreshPlugins(), loader.refreshPlugins()]);
  assert.equal(applies, 1);
  assert.equal(ctx.get("generation"), "new");
  assert.equal(ctx.routes.ownerOf("/feature"), undefined);
  sources.splice(index, 1);
  await loader.refreshPlugins();
  assert.equal(ctx.get("generation"), undefined);
});

test("browser rejects incompatible packages and keeps foundational plugins alive on revision changes", async (t) => {
  const fixture = frontendFixture(t, { user: false });
  await fixture.start();
  const { loader, sources } = fixture;
  const foundation = loader.getLoadedPlugins().find((item) => item.metadata.id === "console");
  const index = sources.findIndex((source) => source.metadata.id === "console");
  sources[index] = { ...sources[index], revision: "changed" };
  let executed = false;
  sources.push({
    metadata: { id: "future", elements: { api: 2 } },
    directory: "future",
    assetDirectory: "future",
    load: async () => {
      executed = true;
      return {};
    }
  });
  await loader.refreshPlugins();
  assert.equal(executed, false);
  assert.match(
    loader.getLoadedPlugins().find((item) => item.metadata.id === "future").error.message,
    /Unsupported/
  );
  assert.equal(
    loader.getLoadedPlugins().find((item) => item.metadata.id === "console"),
    foundation
  );
  assert.equal(foundation.reloadRequired, true);
});

test("a plugin deferred until backend restart loads when the same artifact becomes ready", async (t) => {
  const fixture = frontendFixture(t, { user: false });
  await fixture.start();
  let applications = 0;
  const source = {
    metadata: { id: "deferred", restartRequired: true },
    directory: "deferred",
    assetDirectory: "deferred",
    revision: "same-code",
    load: async () => ({
      apply() {
        applications++;
      }
    })
  };
  fixture.sources.push(source);
  await fixture.loader.refreshPlugins();
  assert.equal(applications, 0);
  fixture.sources[fixture.sources.length - 1] = {
    ...source,
    metadata: { id: "deferred", restartRequired: false }
  };
  await fixture.loader.refreshPlugins();
  assert.equal(applications, 1);
  assert.equal(
    fixture.loader.getLoadedPlugins().find((item) => item.metadata.id === "deferred").error,
    undefined
  );
});
