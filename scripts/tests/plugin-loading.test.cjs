const { from, createBrowser, createLoader, deferred, settle } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, after } = require("node:test");

const frontendRequire = from("frontend");
const { Context } = frontendRequire("cordis");
const dom = createBrowser();
after(() => dom.window.close());

// Exercise production discovery and DOM asset loading with controlled network completions.
const load = createLoader({
  globals: true,
  transform: (source) =>
    source
      .replaceAll("import.meta.env.DEV", "false")
      .replaceAll("import(/* @vite-ignore */ url.href)", "loadPluginModule(url.href)"),
  resolve(id, { filename, localRequire, load }) {
    const target = path.resolve(path.dirname(filename), id) + ".ts";
    if (id.startsWith(".")) return fs.existsSync(target) ? load(target) : localRequire(id);
    return frontendRequire(id);
  }
});

function fixture(t) {
  const ctx = new Context();
  const manifest = [];
  const modules = new Map();
  const imports = [];
  const requests = [];
  const preloads = [];
  const styles = new Map();
  const heldStyles = new Set();
  const failedStyles = new Set();
  const applications = [];
  const idOf = (href) => new URL(href).pathname.split("/")[2].split("@")[0];
  const appendChild = document.head.appendChild.bind(document.head);
  const previousAppendChild = document.head.appendChild;
  document.head.appendChild = (node) => {
    const result = appendChild(node);
    if (node.rel === "stylesheet") {
      const id = idOf(node.href);
      styles.set(id, node);
      if (!heldStyles.has(id))
        queueMicrotask(() => {
          node.dispatchEvent(new dom.window.Event(failedStyles.has(id) ? "error" : "load"));
        });
    } else preloads.push(node);
    return result;
  };
  t.after(async () => {
    await ctx.stop();
    document.head.appendChild = previousAppendChild;
    document.head.replaceChildren();
  });

  const add = (id, { metadata = {}, module, revision = "one" } = {}) => {
    const entry = {
      metadata: { id, ...metadata },
      assetDirectory: id,
      revision,
      entry: `./${id}@${revision}/frontend/index.js`,
      styles: [`./${id}@${revision}/frontend/style.css`]
    };
    manifest.push(entry);
    modules.set(id, module ?? { apply: () => applications.push(id) });
    return entry;
  };
  for (const [id, service, dependencies] of [
    ["runtime", "startup", []],
    ["i18n", "i18n", ["runtime"]],
    ["console", "console", ["runtime", "i18n"]]
  ]) {
    add(id, {
      metadata: { frontendInject: dependencies },
      module: {
        apply(scope) {
          applications.push(id);
          scope.set(service, {});
        }
      }
    });
  }
  const loader = load(
    "frontend/src/plugin/loader.ts",
    {
      "./context": { ctx },
      "virtual:panel-plugins": { panelPluginModules: [] }
    },
    {
      fetch: async (url, options) => {
        requests.push({ url, options });
        return { ok: true, json: async () => manifest };
      },
      loadPluginModule: async (url) => {
        const id = idOf(url);
        imports.push(id);
        const module = modules.get(id);
        return typeof module === "function" ? module() : module;
      }
    }
  );
  return {
    ctx,
    loader,
    manifest,
    modules,
    imports,
    requests,
    preloads,
    styles,
    heldStyles,
    failedStyles,
    applications,
    add,
    start: loader.bootstrapPanelFrontendPlugins
  };
}

test("startup discovers once and preloads all assets while foundation initialization waits", async (t) => {
  const f = fixture(t);
  const startup = deferred();
  f.modules.set("runtime", {
    async apply(scope) {
      f.applications.push("runtime");
      scope.set("startup", {});
      await startup.promise;
    }
  });
  f.add("feature", { metadata: { frontendInject: ["console"] } });
  const starting = f.start();
  await settle();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].options.cache, "no-store");
  assert.equal(new URL(f.requests[0].url).pathname, "/plugins/manifest.json");
  assert.deepEqual(f.imports, ["runtime"]);
  assert.deepEqual(f.applications, ["runtime"]);
  assert.equal(document.querySelectorAll("link[rel='modulepreload']").length, 4);
  assert.equal(document.querySelectorAll("link[rel='preload'][as='style']").length, 4);
  startup.resolve();
  await starting;
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.applications, ["runtime", "i18n", "console", "feature"]);
  assert.equal(
    f.preloads.every((link) => !link.isConnected),
    true
  );

  await f.loader.refreshPlugins();
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.imports, ["runtime", "i18n", "console", "feature"]);
});

test("batch imports and styles run concurrently while async activation retains dependency and priority order", async (t) => {
  const f = fixture(t);
  const provider = deferred();
  const consumer = deferred();
  const independent = deferred();
  const activation = deferred();
  f.heldStyles.add("provider");
  f.add("consumer", {
    metadata: { frontendInject: ["provider"], priority: -100 },
    module: () => consumer.promise
  });
  f.add("provider", { metadata: { frontendInject: ["console"] }, module: () => provider.promise });
  f.add("independent", { metadata: { priority: 10 }, module: () => independent.promise });
  const starting = f.start();
  await settle();
  assert.deepEqual(f.imports.slice(3), ["provider", "consumer", "independent"]);
  assert.equal(f.styles.get("provider").isConnected, true);
  assert.equal(f.styles.get("consumer").isConnected, true);
  assert.equal(f.styles.get("independent").isConnected, true);

  consumer.resolve({
    apply() {
      assert.equal(f.ctx.get("provided"), true);
      f.applications.push("consumer");
    }
  });
  independent.resolve({ apply: () => f.applications.push("independent") });
  provider.resolve({
    async apply(scope) {
      f.applications.push("provider:start");
      await activation.promise;
      scope.set("provided", true);
      f.applications.push("provider:complete");
    }
  });
  await settle();
  assert.deepEqual(f.applications, ["runtime", "i18n", "console"]);
  f.styles.get("provider").dispatchEvent(new dom.window.Event("load"));
  await settle();
  assert.deepEqual(f.applications, ["runtime", "i18n", "console", "provider:start"]);
  activation.resolve();
  await starting;
  assert.deepEqual(f.applications.slice(3), [
    "provider:start",
    "provider:complete",
    "consumer",
    "independent"
  ]);
});

test("download, stylesheet and activation failures are isolated and blocked plugins release styles", async (t) => {
  const f = fixture(t);
  const download = deferred();
  f.heldStyles.add("download");
  f.add("download", { module: () => download.promise });
  f.add("blocked", { metadata: { frontendInject: ["download"] } });
  f.add("bad-style");
  f.failedStyles.add("bad-style");
  f.add("bad-apply", {
    module: {
      apply(scope) {
        scope.set("partial", true);
        throw new Error("activation failed");
      }
    }
  });
  f.add("healthy");
  const starting = f.start();
  await settle();
  download.reject(new Error("download failed"));
  await settle();
  f.styles.get("download").dispatchEvent(new dom.window.Event("load"));
  await starting;
  const diagnostics = new Map(f.loader.getPluginDiagnostics().map((item) => [item.id, item]));
  for (const id of ["download", "blocked", "bad-style", "bad-apply"]) {
    assert.equal(diagnostics.get(id).state, "failed");
    assert.equal(f.styles.get(id).isConnected, false);
  }
  assert.match(diagnostics.get("download").error, /download failed/);
  assert.match(diagnostics.get("blocked").error, /dependencies are not active/);
  assert.match(diagnostics.get("bad-style").error, /stylesheet/);
  assert.match(diagnostics.get("bad-apply").error, /activation failed/);
  assert.equal(f.ctx.get("partial"), undefined);
  assert.equal(diagnostics.get("healthy").state, "active");
  assert.equal(f.styles.get("healthy").isConnected, true);
  assert.equal(f.applications.includes("blocked"), false);
  assert.doesNotThrow(f.loader.auditFrontendPlugins);
  await f.loader.unloadPlugin("healthy");
  assert.equal(f.styles.get("healthy").isConnected, false);
});

test("incompatible, disabled and invalid graph entries never preload or import", async (t) => {
  const f = fixture(t);
  f.add("future", { metadata: { elements: { api: 2 } } });
  f.add("disabled", { metadata: { enabled: false } });
  f.add("restart", { metadata: { restartRequired: true } });
  f.add("missing", { metadata: { frontendInject: ["absent"] } });
  f.add("cycle-a", { metadata: { frontendInject: ["cycle-b"] } });
  f.add("cycle-b", { metadata: { frontendInject: ["cycle-a"] } });
  await f.start();
  assert.deepEqual(f.imports, ["runtime", "i18n", "console"]);
  assert.equal(f.preloads.length, 6);
  assert.equal(
    f.loader.getPluginDiagnostics().find((item) => item.id === "future").state,
    "failed"
  );
});

test("refresh batches new and replaced entries while preserving unchanged plugin instances", async (t) => {
  const f = fixture(t);
  const original = f.add("changed");
  f.add("unchanged");
  await f.start();
  const unchanged = f.loader.getLoadedPlugins().find((item) => item.metadata.id === "unchanged");
  const changed = deferred();
  const added = deferred();
  original.revision = "two";
  original.entry = "./changed@two/frontend/index.js";
  original.styles = ["./changed@two/frontend/style.css"];
  const oldStyle = f.styles.get("changed");
  f.modules.set("changed", () => changed.promise);
  f.add("added", { module: () => added.promise });
  const refreshing = f.loader.refreshPlugins();
  await settle();
  assert.deepEqual(f.imports.slice(5), ["added", "changed"]);
  assert.equal(oldStyle.isConnected, false);
  added.resolve({ apply: () => f.applications.push("added") });
  changed.resolve({ apply: () => f.applications.push("changed:two") });
  await refreshing;
  assert.equal(
    f.loader.getLoadedPlugins().find((item) => item.metadata.id === "unchanged"),
    unchanged
  );
  assert.equal(
    f.loader.getLoadedPlugins().find((item) => item.metadata.id === "changed").revision,
    "two"
  );
  assert.deepEqual(f.applications.slice(5), ["added", "changed:two"]);
});

test("a required plugin download failure remains a startup audit failure", async (t) => {
  const f = fixture(t);
  f.add("required", {
    metadata: { frontendRequired: true },
    module: () => {
      throw new Error("required download failed");
    }
  });
  await f.start();
  assert.throws(f.loader.auditFrontendPlugins, /required \(failed: required download failed\)/);
  assert.equal(f.styles.get("required").isConnected, false);
});

test("foundation failure removes preload links without evaluating remaining modules", async (t) => {
  const f = fixture(t);
  f.modules.set("runtime", {
    apply() {
      throw new Error("startup failed");
    }
  });
  f.add("feature");
  await assert.rejects(f.start(), /startup failed/);
  assert.deepEqual(f.imports, ["runtime"]);
  assert.equal(document.querySelectorAll("link").length, 0);
});
