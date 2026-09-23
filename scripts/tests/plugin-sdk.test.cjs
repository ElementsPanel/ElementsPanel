const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const root = path.resolve(__dirname, "../..");
const ts = Module.createRequire(path.join(root, "frontend/package.json"))("typescript");

test("host SDK maps all compiler externals before module scripts, with prefix-relative URLs", async () => {
  const { pluginSdkModules } = await import(
    pathToFileURL(path.join(root, "frontend/plugin-sdk.config.mjs"))
  );
  const filename = path.join(root, "frontend/vite.config.ts");
  const mod = new Module(filename, module);
  const overrides = {
    "@vitejs/plugin-vue": () => ({}),
    "@vitejs/plugin-vue-jsx": () => ({}),
    "rollup-plugin-visualizer": { visualizer: () => ({}) },
    "unplugin-vue-components/vite": () => ({}),
    vite: { defineConfig: (value) => value, normalizePath: (value) => value.replaceAll("\\", "/") },
    "./plugin-sdk.config.mjs": { pluginSdkModules },
    "../common/src/plugin_manifest": {
      discoverPluginsFromRoots: () => [],
      discoverExternalPluginRoots: () => []
    },
    "../common/src/plugin_overrides": { applyPluginOverrides: (value) => value },
    "node:module": { createRequire: () => ({ resolve: (name) => `/virtual/${name}` }) }
  };
  mod.require = (id) => (Object.hasOwn(overrides, id) ? overrides[id] : require(id));
  mod._compile(
    ts.transpileModule(
      fs
        .readFileSync(filename, "utf8")
        .replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href)),
      {
        fileName: filename,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true
        }
      }
    ).outputText,
    filename
  );
  const plugin = mod.exports.default.plugins.find((item) => item.name === "elements-panel-plugins");
  const emitted = [];
  const context = {
    emitFile(file) {
      emitted.push(file);
      return `ref-${emitted.length - 1}`;
    },
    getFileName(ref) {
      return `assets/${ref}.js`;
    }
  };
  plugin.configResolved({ command: "build" });
  // Exercise metadata hooks only: no bundler, compiler, server, or output files.
  plugin.buildStart.call(context);
  const bundle = {
    "index.html": {
      type: "asset",
      fileName: "index.html",
      source: '<html><head><script type="module" src="./main.js"></script></head></html>'
    }
  };
  plugin.generateBundle.call(context, {}, bundle);
  const html = bundle["index.html"].source;
  const imports = JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/)[1]).imports;
  assert.deepEqual(Object.keys(imports), pluginSdkModules);
  assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'));
  for (const id of pluginSdkModules) {
    const chunk = emitted.find((file) => file.id === `elements-sdk:${id}`);
    assert.equal(chunk.preserveSignature, "strict");
    assert.ok(
      new URL(imports[id], "https://panel.test/prefix/").href.startsWith(
        "https://panel.test/prefix/assets/"
      )
    );
    const bridge = plugin.load(plugin.resolveId(`elements-sdk:${id}`));
    assert.ok(bridge.startsWith("export * from "));
    if (id === "vue" || id === "cordis")
      assert.equal(bridge, `export * from ${JSON.stringify(id)};`);
  }
});
