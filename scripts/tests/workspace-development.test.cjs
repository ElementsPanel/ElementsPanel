const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const { createLoader, from, settle } = require("./helpers.cjs");
const { write } = require("./npm-fixtures.cjs");
const { initialize } = require("../../packages/init-elementspanel/index.cjs");
const { setupWorkspace } = require("../../packages/init-elementspanel/workspace.cjs");
const { resolveNpmPlugins } = require("../runtime/npm-plugins.cjs");
const { parseArgs, workerEnvironment } = require("../runtime/cli.cjs");
const { installBackendSources } = require("../../packages/init-elementspanel/development.cjs");

const load = createLoader({
  resolve(id, { filename, localRequire, load }) {
    const target = path.resolve(path.dirname(filename), id) + ".ts";
    return id.startsWith(".") && fs.existsSync(target) ? load(target) : localRequire(id);
  }
});

async function fixture(t, mode = "full") {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "epanel workspace 开发-"));
  const previous = new Map(
    ["EPANEL_PROJECT_ROOT", "EPANEL_PACKAGE_ROOT", "EPANEL_RUNTIME_ROOT", "EPANEL_DEV"].map(
      (key) => [key, process.env[key]]
    )
  );
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(project, { recursive: true, force: true });
  });
  const initialized = await initialize({
    directory: project,
    mode,
    install: false,
    versions: { panel: "1.0.0", daemon: "1.0.0" },
    builtinPlugins: {}
  });
  const plugin = await setupWorkspace(project, ["example", "--both", "--no-install"]);
  const hosts = {};
  for (const side of ["panel", "daemon"]) {
    const host = (hosts[side] = path.join(project, "node_modules/@elementspanel", side));
    write(path.join(host, "package.json"), {
      name: `@elementspanel/${side}`,
      elementspanel: { side, plugins: { runtime: "epanel-plugin-runtime" } }
    });
    for (const file of ["npm-plugins.cjs", "workspace-plugins.cjs"])
      write(
        path.join(host, "runtime", file),
        fs.readFileSync(path.join(__dirname, "../runtime", file), "utf8")
      );
  }
  process.env.EPANEL_PROJECT_ROOT = project;
  process.env.EPANEL_PACKAGE_ROOT = hosts.panel;
  process.env.EPANEL_RUNTIME_ROOT = path.join(project, "panel");
  process.env.EPANEL_DEV = "0";
  return { project, hosts, plugin, manifest: initialized.manifest };
}

test("generated dev commands retain each installation mode and explicitly isolate start", async (t) => {
  for (const mode of ["full", "panel", "daemon"]) {
    const f = await fixture(t, mode);
    assert.equal(
      f.manifest.scripts.dev,
      mode === "full"
        ? "epanel dev --with-daemon"
        : mode === "panel"
        ? "epanel dev"
        : "epanel-daemon dev"
    );
    assert.equal(parseArgs(["dev"], "panel").command, "dev");
    process.env.EPANEL_DEV = "1";
    assert.equal(workerEnvironment({ project: f.project }, { side: "panel" }).EPANEL_DEV, "0");
    assert.equal(
      workerEnvironment({ project: f.project, development: true }, { side: "daemon" }).EPANEL_DEV,
      "1"
    );
    assert.equal(fs.readFileSync(path.join(f.project, "README.md"), "utf8"), "# ElementsPanel\n");
  }
});

test("dev discovers unbuilt workspaces directly and start retains compiled entry points", async (t) => {
  const f = await fixture(t);
  const discover = load("core/common/src/plugin_manifest.ts").discoverPluginsFromRoots;
  const paths = load("core/common/src/runtime_paths.ts");
  const originals = new Map(
    ["panel", "daemon"].map((side) => {
      const filename = path.join(f.plugin.root, side, "plugin.json");
      return [filename, fs.readFileSync(filename, "utf8")];
    })
  );
  for (const side of ["panel", "daemon"]) {
    process.env.EPANEL_PACKAGE_ROOT = f.hosts[side];
    process.env.EPANEL_RUNTIME_ROOT = path.join(f.project, side);
    process.env.EPANEL_DEV = "0";
    assert.deepEqual(resolveNpmPlugins(f.hosts[side], side, { skipInvalid: true }), []);
    process.env.EPANEL_DEV = "1";
    const [plugin] = discover(paths.packagePluginRoots(side), {
      entryFields: [side, "backend"],
      includeDisabled: true
    });
    assert.equal(plugin.entry, path.join(f.plugin.root, side, "src/backend/index.ts"));
    assert.equal(plugin.development, true);
    assert.notEqual(plugin.manifest.enabled, false);
    write(path.join(f.plugin.root, side, "backend/index.cjs"), "exports.apply = () => {};\n");
    fs.mkdirSync(path.join(f.project, side, "node_modules"), { recursive: true });
    fs.symlinkSync(
      f.plugin.root,
      path.join(f.project, side, "node_modules", f.plugin.manifest.name),
      "dir"
    );
    process.env.EPANEL_DEV = "0";
    const [compiled] = discover(paths.packagePluginRoots(side), {
      entryFields: [side, "backend"],
      includeDisabled: true
    });
    assert.equal(compiled.entry, path.join(f.plugin.root, side, "backend/index.cjs"));
    assert.equal(compiled.development, undefined);
  }
  for (const [filename, original] of originals)
    assert.equal(fs.readFileSync(filename, "utf8"), original);
  const reserved = {
    ...f.plugin.manifest,
    elementspanel: {
      ...f.plugin.manifest.elementspanel,
      id: "runtime"
    }
  };
  write(path.join(f.plugin.root, "package.json"), reserved);
  process.env.EPANEL_DEV = "1";
  assert.deepEqual(
    resolveNpmPlugins(f.hosts.daemon, "daemon", { skipInvalid: true }),
    [],
    "external workspaces must not override a built-in plugin id"
  );
});

for (const type of ["commonjs", "module"]) {
  test(`${type}: backend TypeScript and extensionless shared sources execute without emitted files`, async (t) => {
    const f = await fixture(t);
    const manifest = { ...f.plugin.manifest, type };
    write(path.join(f.plugin.root, "package.json"), manifest);
    const entry = path.join(f.plugin.root, "panel/src/backend/index.ts");
    write(path.join(f.plugin.root, "panel/src/shared.ts"), "export enum Result { Value = 42 }\n");
    write(
      entry,
      'import { Result } from "../shared"; export const value: number = Result.Value;\n'
    );
    const hooks = installBackendSources(
      [{ packageRoot: f.plugin.root }],
      from("frontend")("esbuild")
    );
    t.after(() => hooks.deregister());
    const modules = load("core/common/src/plugin_modules.ts");
    process.env.EPANEL_DEV = "1";
    const revision = modules.pluginBackendRevision(entry, f.plugin.root);
    assert.equal((await modules.loadPluginModule(entry, f.plugin.root, revision)).value, 42);
    write(path.join(f.plugin.root, "panel/src/shared.ts"), "export enum Result { Value = 43 }\n");
    const next = modules.pluginBackendRevision(entry, f.plugin.root);
    assert.notEqual(next, revision);
    modules.forgetPluginModules(f.plugin.root);
    assert.equal((await modules.loadPluginModule(entry, f.plugin.root, next)).value, 43);
    assert.equal(fs.existsSync(path.join(f.plugin.root, "panel/backend")), false);
  });
}

test("workspace source changes trigger reconciliation after settling", async (t) => {
  const f = await fixture(t);
  process.env.EPANEL_DEV = "1";
  let poll,
    reloads = 0;
  load("core/common/src/plugin_watch.ts").watchNpmPlugins(
    {
      setInterval(fn) {
        poll = fn;
      },
      logger: {
        warn(error) {
          throw error;
        }
      }
    },
    "panel",
    async () => {
      reloads++;
    }
  );
  write(path.join(f.plugin.root, "panel/src/shared.ts"), "export const value = 1;\n");
  poll();
  assert.equal(reloads, 0);
  poll();
  await settle();
  assert.equal(reloads, 1);
});

test("the packaged worker installs development tooling before loading the compiled host", async (t) => {
  const f = await fixture(t);
  const host = f.hosts.panel;
  fs.cpSync(path.join(__dirname, "../runtime"), path.join(host, "runtime"), { recursive: true });
  const toolkit = path.join(f.project, "node_modules/@elementspanel/init");
  write(path.join(toolkit, "package.json"), { name: "@elementspanel/init" });
  write(
    path.join(toolkit, "development.cjs"),
    fs.readFileSync(
      path.join(__dirname, "../../packages/init-elementspanel/development.cjs"),
      "utf8"
    )
  );
  fs.mkdirSync(path.join(toolkit, "node_modules"));
  fs.symlinkSync(
    path.dirname(from("frontend").resolve("esbuild/package.json")),
    path.join(toolkit, "node_modules/esbuild"),
    "dir"
  );
  const entry = path.join(f.plugin.root, "panel/src/backend/index.ts");
  write(entry, "export enum Result { Value = 42 }\nexport const value: number = Result.Value;\n");
  const report = path.join(f.project, "worker-result.json");
  write(
    path.join(host, "app.js"),
    `
    const source = require(${JSON.stringify(entry)});
    require('node:fs').writeFileSync(${JSON.stringify(report)}, JSON.stringify({
      value: source.value, environment: process.env.NODE_ENV,
      toolkit: !!globalThis[Symbol.for('elementspanel.development')]
    }));
  `
  );
  const child = spawn(process.execPath, [path.join(host, "runtime/worker.cjs")], {
    cwd: path.join(f.project, "panel"),
    env: { ...process.env, EPANEL_DEV: "1" },
    stdio: ["ignore", "ignore", "pipe"]
  });
  let error = "";
  child.stderr.on("data", (data) => {
    error += data;
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  assert.equal(code, 0, error);
  assert.deepEqual(JSON.parse(fs.readFileSync(report)), {
    value: 42,
    environment: "development",
    toolkit: true
  });
});

test("frontend uses same-port middleware and host module bridges without starting a server", async (t) => {
  const f = await fixture(t);
  process.env.EPANEL_DEV = "1";
  const previous = globalThis[Symbol.for("elementspanel.development")];
  t.after(() => {
    if (previous === undefined) delete globalThis[Symbol.for("elementspanel.development")];
    else globalThis[Symbol.for("elementspanel.development")] = previous;
  });
  let config,
    closed = false;
  const toolkit = createLoader()("packages/init-elementspanel/development.cjs", {
    esbuild: from("frontend")("esbuild"),
    "@vitejs/plugin-vue": () => ({ name: "vue" }),
    "@vitejs/plugin-vue-jsx": () => ({ name: "vue-jsx" }),
    "vue/compiler-sfc": {},
    vite: {
      async createServer(value) {
        config = value;
        return {
          close: async () => {
            closed = true;
          },
          middlewares: (_req, _res, next) => next()
        };
      }
    },
    "node:module": { registerHooks: () => ({ deregister() {} }) }
  });
  const runtime = await toolkit.installDevelopmentRuntime({ packageRoot: f.hosts.panel });
  const server = {};
  const close = await runtime.attach(server, "/panel");
  assert.equal(config.server.middlewareMode, true);
  assert.equal(config.server.hmr.server, server);
  assert.equal(config.base, "/panel/plugins/__dev/");
  const entry = path.join(f.plugin.root, "panel/src/frontend.ts");
  assert.equal(
    runtime.frontendEntry(entry, "revision"),
    "./__dev/example/panel/src/frontend.ts?v=revision"
  );
  const hostBridge = config.plugins[0].resolveId("vue");
  assert.equal(hostBridge.external, true);
  const response = {
    setHeader() {},
    end(source) {
      this.body = source;
    }
  };
  runtime.middleware({ url: "/plugins/__dev/@id/" + hostBridge.id }, response, assert.ifError);
  assert.equal(response.body, 'export * from "vue";\n');
  assert.match(
    config.plugins[1].transform("export const apply = () => {};", entry),
    /\/panel\/plugins\/__dev\/@vite\/client/
  );
  const common = {
    ...load("core/common/src/runtime_paths.ts"),
    ...load("core/common/src/plugin_manifest.ts"),
    ...load("core/common/src/plugin_revision.ts")
  };
  const { getPanelFrontendManifest } = load("core/panel/src/app/plugin/loader.ts", {
    "mcsmanager-common": {
      ...common,
      applyPluginOverrides: (value) => value,
      createPluginQueue: () => (fn) => fn(),
      trackPluginDisposal: () => async () => {},
      readPluginOverrides: () => ({ plugins: {} })
    },
    "./context": { ctx: {} }
  });
  const [frontend] = getPanelFrontendManifest();
  assert.match(frontend.entry, /^\.\/__dev\/example\/panel\/src\/frontend\.ts\?v=/);
  assert.deepEqual(frontend.styles, []);
  const raw = new EventEmitter();
  raw.setHeader = () => {};
  raw.end = (source) => {
    raw.body = source;
    raw.emit("finish");
  };
  const request = {
    req: { url: "/panel/plugins/__dev/@id/" + hostBridge.id },
    res: raw,
    path: "/plugins/__dev/@id/" + hostBridge.id,
    method: "GET",
    query: {},
    set() {
      assert.fail("raw development responses must bypass API serialization");
    }
  };
  const assets = load("plugins/server/panel/src/backend/plugin_assets.ts", {
    "mcsmanager-common": common
  }).pluginAssets({
    plugins: { frontendManifest: () => [] },
    setInterval() {},
    effect(fn) {
      fn();
    }
  });
  const protocol = load("plugins/server/panel/src/backend/protocol.ts").protocol({});
  await protocol(request, () =>
    assets(request, () => assert.fail("development route fell through"))
  );
  assert.equal(raw.body, 'export * from "vue";\n');
  assert.equal(request.respond, false);
  assert.equal(raw.listenerCount("finish"), 0);
  assert.equal(raw.listenerCount("close"), 0);
  await close();
  assert.equal(closed, true);
});
