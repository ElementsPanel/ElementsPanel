const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const { createLoader, from } = require("./helpers.cjs");
const { write } = require("./npm-fixtures.cjs");
const { repository, sourcePlugins, coreDirectory } = require("../workspace-layout.cjs");
const { installPluginResolution } = require("../runtime/plugin-resolution.cjs");

const { readPluginManifest } = createLoader()("core/common/src/plugin_manifest.ts");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "elements unified layout "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("each built-in package owns one manifest and preserves its side-specific identity and metadata", () => {
  for (const side of ["panel", "daemon"]) {
    const plugins = sourcePlugins(side);
    assert.ok(plugins.length > 0);
    for (const plugin of plugins) {
      assert.equal(fs.existsSync(path.join(plugin.directory, "package.json")), false);
      const manifest = readPluginManifest(plugin.directory);
      const definition = plugin.metadata.elementspanel[side];
      assert.equal(manifest.id, plugin.id);
      assert.equal(manifest.version, plugin.metadata.version);
      assert.equal(manifest.dual, plugin.metadata.elementspanel.dual);
      assert.equal(manifest.priority, definition.priority);
      assert.equal(manifest.description, definition.description ?? plugin.metadata.description);
      assert.deepEqual(manifest.frontendInject, definition.frontendInject);
    }
    assert.equal(plugins.find((plugin) => plugin.id === "mod-manager").folder, "mod");
    assert.equal(
      plugins.some((plugin) => plugin.id === (side === "panel" ? "auth" : "market")),
      false
    );
  }
});

test("unified source discovery rejects side directories outside their package", (t) => {
  const root = fixture(t);
  write(path.join(root, "plugins/escape/package.json"), {
    elementspanel: { id: "escape", panel: { directory: "../../outside" } }
  });
  write(path.join(root, "outside/plugin.json"), {});
  assert.throws(() => sourcePlugins("panel", root), /inside its package/);
});

test("development discovers declared sides independently of its runtime data directory", (t) => {
  const root = fixture(t);
  const host = coreDirectory("panel", root);
  write(path.join(host, "package.json"), {});
  write(path.join(root, "plugins/sample/package.json"), {
    name: "epanel-plugin-sample",
    version: "1.2.3",
    elementspanel: { id: "sample", panel: { directory: "panel", folder: "stable-folder" } }
  });
  write(path.join(root, "plugins/sample/panel/plugin.json"), {});
  write(path.join(root, "panel/data/plugins/ignored/plugin.json"), { id: "ignored" });
  const previous = { ...process.env };
  delete process.env.EPANEL_PACKAGE_ROOT;
  delete process.env.EPANEL_PROJECT_ROOT;
  process.env.EPANEL_SOURCE_ROOT = host;
  t.after(() => {
    for (const key of ["EPANEL_PACKAGE_ROOT", "EPANEL_PROJECT_ROOT", "EPANEL_SOURCE_ROOT"]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  const paths = createLoader()("core/common/src/runtime_paths.ts");
  const roots = paths.packagePluginRoots("panel");
  assert.deepEqual(roots, [
    {
      directory: path.join(root, "plugins/sample/panel"),
      folder: "stable-folder",
      defaultEnabled: true
    }
  ]);
  assert.deepEqual(paths.packagePluginRoots("daemon"), []);
  assert.equal(roots[0].packageRoot, undefined, "source plugins remain protected from npm removal");
  const npm = createLoader()("core/common/src/plugin_npm.ts", {
    "./plugin_manifest": {},
    "./plugin_contract": {}
  });
  assert.equal(npm.currentPackageRoot(), host);
  assert.equal(npm.currentProjectRoot(), root);
});

for (const side of ["panel", "daemon"]) {
  test(`${side} source startup keeps existing runtime data separate from core code`, () => {
    const events = [];
    const process = {
      argv: ["node", "start-source.cjs", side],
      env: {},
      chdir: (cwd) => events.push(["cwd", cwd])
    };
    const host = coreDirectory(side);
    vm.runInNewContext(fs.readFileSync(path.join(repository, "scripts/start-source.cjs"), "utf8"), {
      process,
      require(id) {
        if (id === "node:fs")
          return { mkdirSync: (directory) => events.push(["mkdir", directory]) };
        if (id === "node:path") return path;
        if (id === "./workspace-layout.cjs") return { repository, coreDirectory };
        if (id === "./runtime/plugin-resolution.cjs")
          return {
            installPluginResolution: (...args) => events.push(["resolution", ...args])
          };
        events.push(["entry", id]);
      }
    });
    assert.equal(process.env.EPANEL_SOURCE_ROOT, host);
    assert.equal(process.env.EPANEL_PROJECT_ROOT, repository);
    assert.deepEqual(events, [
      ["mkdir", path.join(repository, side)],
      ["cwd", path.join(repository, side)],
      ["resolution", host, path.join(repository, side)],
      ["entry", path.join(host, "production/app.js")]
    ]);
  });

  test(`${side} backend configuration discovers unified plugin entries without building`, () => {
    const config = from(side)(path.join(coreDirectory(side), "webpack.plugins.config.js"));
    const plugins = sourcePlugins(side);
    assert.equal(config.output.path, path.join(repository, "plugins"));
    for (const plugin of plugins) {
      const entry = path.join(plugin.directory, "src/backend/index.ts");
      if (fs.existsSync(entry)) assert.equal(config.entry[plugin.id], entry);
      assert.equal(
        path.join(config.output.path, config.output.filename.replace("[name]", plugin.id)),
        path.join(plugin.directory, "backend/index.cjs")
      );
    }
    const resolve = from(side)("enhanced-resolve").create.sync(config.resolve);
    assert.ok(
      resolve({}, plugins[0].directory, "cordis").startsWith(
        path.join(coreDirectory(side), "node_modules")
      )
    );
  });
}

test("CJS and ESM sources outside core use host dependencies and retain plugin-private dependencies", async (t) => {
  const root = fixture(t);
  const host = coreDirectory("panel", root);
  const plugin = path.join(root, "plugins/example");
  write(path.join(host, "package.json"), {
    dependencies: { cordis: "1", "host-only": "1", "private-dep": "2" }
  });
  for (const [directory, name, value] of [
    [host, "cordis", "shared framework"],
    [host, "host-only", "host dependency"],
    [host, "private-dep", "wrong host dependency"],
    [plugin, "private-dep", "private dependency"],
    [plugin, "cordis", "wrong private framework"]
  ])
    write(
      path.join(directory, "node_modules", name, "index.js"),
      `module.exports = ${JSON.stringify(value)};`
    );
  write(
    path.join(plugin, "panel/index.cjs"),
    'module.exports = [require("cordis"), require("host-only"), require("private-dep")];'
  );
  write(
    path.join(plugin, "panel/index.mjs"),
    'import cordis from "cordis"; import host from "host-only"; import local from "private-dep"; export default [cordis, host, local];'
  );
  const hook = installPluginResolution(host, path.join(root, "panel"));
  t.after(() => hook.deregister());
  const expected = ["shared framework", "host dependency", "private dependency"];
  assert.deepEqual(require(path.join(plugin, "panel/index.cjs")), expected);
  assert.deepEqual(
    (await import(pathToFileURL(path.join(plugin, "panel/index.mjs")))).default,
    expected
  );
});
