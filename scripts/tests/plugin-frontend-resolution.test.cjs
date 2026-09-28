const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const frontendRoot = path.join(root, "frontend");
const frontendRequire = createRequire(path.join(frontendRoot, "package.json"));

async function compilerConfig(t) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "elements-plugin-resolution-"));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const entry = path.join(workspace, "panel/src/frontend.ts");
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(entry, "export function apply() {}\n");
  const { createFrontendConfigSource } = await import(
    pathToFileURL(path.join(root, "scripts/compile-plugin.mjs"))
  );
  const { frontendDependencyFallback } = await import(
    pathToFileURL(path.join(frontendRoot, "plugin-dependencies.config.mjs"))
  );
  // Generate configuration only. No bundler, dev server or compiler is invoked.
  const { configSource } = createFrontendConfigSource(workspace, path.join(workspace, "output"));
  const config = new Function(
    "defineConfig",
    "vue",
    "frontendDependencyFallback",
    configSource
      .replace(/^import .+;\s*$/gm, "")
      .replace("export default defineConfig(", "return defineConfig(")
  )(
    (value) => value,
    () => ({ name: "test-vue-config-only" }),
    frontendDependencyFallback
  );
  const vite = await import(
    pathToFileURL(
      path.join(path.dirname(frontendRequire.resolve("vite/package.json")), "dist/node/index.js")
    )
  );
  const resolved = await vite.resolveConfig(
    { ...config, configFile: false, envFile: false },
    "build"
  );
  const localResolve = resolved.createResolver();
  const fallback = config.plugins.find(
    (plugin) => plugin.name === "elements-frontend-dependency-fallback"
  );
  assert.equal(fallback.enforce, "post");
  const resolve = async (source, importer) => {
    const local = await localResolve(source, importer);
    if (local) return local;
    return fallback.resolveId.call(
      { resolve: (id, from) => localResolve(id, from) },
      source,
      importer,
      {}
    );
  };
  return { config, resolve, importer: entry, workspace };
}

test("standalone plugin imports resolve frontend dependencies with browser ESM entries", async (t) => {
  const { config, resolve, importer, workspace } = await compilerConfig(t);
  const source = path.join(
    path.dirname(importer),
    "MarkdownMessage.vue?vue&type=script&setup=true&lang.ts"
  );
  for (const specifier of ["marked", "sanitize-html", "axios", "@codemirror/state"]) {
    const resolved = await resolve(specifier, source);
    assert.ok(resolved, `${specifier} must resolve outside the frontend workspace`);
    assert.ok(resolved.startsWith(path.join(frontendRoot, "node_modules") + path.sep), resolved);
    assert.equal(config.build.rollupOptions.external.includes(specifier), false);
    if (specifier === "marked") assert.match(resolved, /marked\.esm\.js$/);
    if (specifier === "sanitize-html") {
      assert.ok(await resolve("htmlparser2", resolved), "sanitizer dependencies must also resolve");
    }
  }
  assert.ok(config.build.rollupOptions.external.includes("vue"));
  assert.ok(config.build.rollupOptions.external.includes("@elements-panel/sdk"));
  assert.equal(fs.existsSync(path.join(workspace, "output")), false);
});

test("plugin-only dependencies continue to resolve from the plugin's own workspace", async (t) => {
  const { resolve, importer, workspace } = await compilerConfig(t);
  const dependency = path.join(workspace, "node_modules/plugin-specific-fixture");
  fs.mkdirSync(dependency, { recursive: true });
  fs.writeFileSync(
    path.join(dependency, "package.json"),
    JSON.stringify({
      name: "plugin-specific-fixture",
      version: "1.0.0",
      type: "module",
      exports: "./index.js"
    })
  );
  fs.writeFileSync(path.join(dependency, "index.js"), "export const fixture = true;\n");
  assert.equal(
    await resolve("plugin-specific-fixture", importer),
    path.join(dependency, "index.js")
  );
});

function installFixture(directory, name) {
  const target = path.join(directory, "node_modules", name);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(
    path.join(target, "package.json"),
    JSON.stringify({
      name,
      version: "99.0.0",
      type: "module",
      exports: { ".": "./index.js", "./feature": "./feature.js" }
    })
  );
  for (const file of ["index.js", "feature.js"])
    fs.writeFileSync(path.join(target, file), "export const pluginPrivate = true;\n");
  return target;
}

test("local versions and transitive dependencies take precedence over ordinary host packages", async (t) => {
  const { resolve, importer, workspace, config } = await compilerConfig(t);
  const marked = installFixture(workspace, "marked");
  const parent = installFixture(workspace, "@private/plugin-parent");
  const nested = installFixture(parent, "axios");
  assert.equal(await resolve("marked", importer), path.join(marked, "index.js"));
  assert.equal(
    await resolve("@private/plugin-parent/feature", importer),
    path.join(parent, "feature.js")
  );
  assert.equal(
    await resolve("axios", path.join(parent, "index.js")),
    path.join(nested, "index.js")
  );
  assert.equal(config.build.rollupOptions.external.includes("marked"), false);
  assert.equal(config.build.rollupOptions.external.includes("axios"), false);
});

test("side-specific dependencies override workspace dependencies while Vue stays shared", async (t) => {
  const { resolve, importer, workspace, config } = await compilerConfig(t);
  installFixture(workspace, "marked");
  const panelMarked = installFixture(path.join(workspace, "panel"), "marked");
  installFixture(workspace, "vue");
  assert.equal(await resolve("marked", importer), path.join(panelMarked, "index.js"));
  const vue = await resolve("vue", importer);
  assert.ok(vue.startsWith(path.join(frontendRoot, "node_modules/vue") + path.sep));
  assert.ok(config.build.rollupOptions.external.includes("vue"));
});
