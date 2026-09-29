const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const root = path.resolve(__dirname, "../..");

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-private-deps-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function install(directory, name) {
  const target = path.join(directory, "node_modules", name);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(
    path.join(target, "package.json"),
    JSON.stringify({
      name,
      version: "99.0.0",
      main: "index.js",
      types: "index.d.ts",
      exports: { ".": "./index.js", "./feature": "./feature.js" }
    })
  );
  fs.writeFileSync(path.join(target, "index.js"), "exports.pluginPrivate = true;\n");
  fs.writeFileSync(path.join(target, "feature.js"), "exports.feature = true;\n");
  fs.writeFileSync(path.join(target, "index.d.ts"), "export const pluginPrivate: true;\n");
  return target;
}

async function fixture(t, side) {
  const workspace = temporary(t);
  const entry = path.join(workspace, side, "src/backend/index.ts");
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(entry, "export function apply() {}\n");
  const { createBackendConfig } = await import(
    pathToFileURL(path.join(root, "scripts/compile-plugin.mjs"))
  );
  const config = createBackendConfig(side, workspace, path.join(workspace, "output"));
  const sideRequire = createRequire(path.join(root, side, "package.json"));
  const { ResolverFactory } = sideRequire("enhanced-resolve");
  // Exercise webpack's resolver and external callbacks, without creating a
  // compiler, emitting files, running npm or contacting a package registry.
  const getResolve = (options = {}) => {
    const resolver = ResolverFactory.createResolver({
      ...config.resolve,
      fileSystem: fs,
      conditionNames: ["require", "node", "default"],
      ...options
    });
    return (context, request, callback) => resolver.resolve({}, context, request, {}, callback);
  };
  const resolve = (request, file = entry) =>
    new Promise((resolve, reject) =>
      getResolve()(path.dirname(file), request, (error, result) =>
        error ? reject(error) : resolve(result)
      )
    );
  const external = (request, file = entry) => {
    const shared = config.externals[0][request];
    if (shared) return Promise.resolve(shared);
    return new Promise((resolve, reject) =>
      config.externals[1](
        {
          request,
          context: path.dirname(file),
          getResolve
        },
        (error, value) => (error ? reject(error) : resolve(value))
      )
    );
  };
  return { workspace, entry, config, resolve, external, sideRequire };
}

for (const side of ["panel", "daemon"]) {
  test(`${side}: plugin-owned packages, subpaths and nested host-name dependencies are bundled`, async (t) => {
    const f = await fixture(t, side);
    const local = install(f.workspace, "@private/unique-package");
    const nested = install(local, "fs-extra");
    assert.equal(await f.resolve("@private/unique-package"), path.join(local, "index.js"));
    assert.equal(
      await f.resolve("@private/unique-package/feature"),
      path.join(local, "feature.js")
    );
    assert.equal(await f.external("@private/unique-package"), undefined);
    assert.equal(
      await f.resolve("fs-extra", path.join(local, "index.js")),
      path.join(nested, "index.js")
    );
    assert.equal(await f.external("fs-extra", path.join(local, "index.js")), undefined);
    assert.equal(await f.external("fs-extra"), "commonjs fs-extra");
    assert.equal(fs.existsSync(path.join(f.workspace, "output")), false);
  });

  test(`${side}: side-local versions win, shared Cordis and Node builtins remain external`, async (t) => {
    const f = await fixture(t, side);
    install(f.workspace, "fs-extra");
    const local = install(path.join(f.workspace, side), "fs-extra");
    install(f.workspace, "cordis");
    assert.equal(await f.resolve("fs-extra"), path.join(local, "index.js"));
    assert.equal(await f.external("fs-extra"), undefined);
    assert.equal(await f.external("fs-extra/feature"), undefined);
    assert.equal(await f.external("cordis"), "commonjs2 cordis");
    assert.equal(f.config.externalsPresets.node, true);
    install(f.workspace, "crypto");
    for (const request of ["crypto", "node:crypto", "fs/promises", "node:fs/promises", "node:test"])
      assert.equal(await f.external(request), `commonjs ${request}`);
    const axiosFile = f.sideRequire.resolve("axios");
    assert.equal(await f.external("crypto", axiosFile), "commonjs crypto");
  });

  test(`${side}: private TypeScript declarations match private runtime resolution`, async (t) => {
    const f = await fixture(t, side);
    const local = install(f.workspace, "fs-extra");
    const ts = f.sideRequire("typescript");
    const tsconfig = ts.readConfigFile(path.join(root, side, "tsconfig.json"), ts.sys.readFile);
    const options = ts.parseJsonConfigFileContent(
      tsconfig.config,
      ts.sys,
      path.join(root, side)
    ).options;
    const resolve = f.config.module.rules[0].use.options.resolveModuleName;
    const result = resolve("fs-extra", f.entry, options, ts.sys, ts.resolveModuleName);
    assert.equal(result.resolvedModule.resolvedFileName, path.join(local, "index.d.ts"));
    const sdk = resolve("cordis", f.entry, options, ts.sys, ts.resolveModuleName);
    assert.ok(
      sdk.resolvedModule.resolvedFileName.startsWith(
        path.join(root, side, "node_modules") + path.sep
      )
    );
  });
}

test("new plugin scaffolds keep npm manifests and installs inside the plugin workspace", (t) => {
  const directory = temporary(t);
  fs.mkdirSync(path.join(directory, "scripts"));
  const source = path.join(directory, "scripts/create-plugin.mjs");
  fs.copyFileSync(path.join(root, "scripts/create-plugin.mjs"), source);
  fs.writeFileSync(path.join(directory, "package.json"), '{"name":"unchanged-host"}\n');
  const result = spawnSync(process.execPath, [source, "private-example"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const workspace = path.join(directory, "external/private-example");
  const manifest = JSON.parse(fs.readFileSync(path.join(workspace, "package.json")));
  assert.equal(manifest.private, true);
  assert.deepEqual(manifest.dependencies, {});
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(workspace, "daemon/plugin.json"))),
    { backend: "src/backend/index.ts" }
  );
  const panelManifest = JSON.parse(fs.readFileSync(path.join(workspace, "panel/plugin.json")));
  assert.equal(panelManifest.id, "private-example");
  assert.equal(panelManifest.version, "0.1.0");
  assert.equal(panelManifest.description, "A custom ElementsPanel panel plugin.");
  assert.equal(Object.hasOwn(panelManifest, "summary"), false);
  assert.match(fs.readFileSync(path.join(workspace, ".gitignore"), "utf8"), /node_modules\//);
  assert.match(
    fs.readFileSync(path.join(workspace, "README.md"), "utf8"),
    /npm install --prefix external\/private-example/
  );
  assert.equal(
    fs.readFileSync(path.join(directory, "package.json"), "utf8"),
    '{"name":"unchanged-host"}\n'
  );
  assert.equal(fs.existsSync(path.join(directory, "node_modules")), false);
});
