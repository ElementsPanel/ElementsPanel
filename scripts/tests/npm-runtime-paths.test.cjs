const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { createLoader } = require("./helpers.cjs");
const { installNpmPlugin } = require("./npm-fixtures.cjs");
const load = createLoader();

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "elements-npm-paths-"));
  const previous = { cwd: process.cwd(), packageRoot: process.env.EPANEL_PACKAGE_ROOT };
  const work = path.join(root, "work");
  const packageRoot = path.join(root, "package");
  fs.mkdirSync(work);
  fs.mkdirSync(packageRoot);
  process.chdir(work);
  process.env.EPANEL_PACKAGE_ROOT = packageRoot;
  t.after(() => {
    process.chdir(previous.cwd);
    if (previous.packageRoot === undefined) delete process.env.EPANEL_PACKAGE_ROOT;
    else process.env.EPANEL_PACKAGE_ROOT = previous.packageRoot;
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, work, packageRoot, paths: load("common/src/runtime_paths.ts") };
}

test("npm resources and binary paths are independent of the user's data directory", (t) => {
  const { packageRoot, work, paths } = fixture(t);
  const plugin = installNpmPlugin(packageRoot, "panel", "runtime");
  const { default: Storage } = load("common/src/system_storage.ts");
  assert.equal(Storage.DATA_PATH, path.join(work, "data"));
  assert.equal(paths.packagePath("public"), path.join(packageRoot, "public"));
  assert.ok(paths.bundledToolPath("pty").startsWith(path.join(work, "data", "lib") + path.sep));
  assert.equal(paths.isPackagePlugin(plugin.directory), true);
  assert.equal(paths.packagePluginRoots("panel")[0].directory, plugin.directory);
  assert.equal(paths.isPackagePlugin(path.join(packageRoot, "plugins/runtime")), false);
  assert.equal(paths.isPackagePlugin(path.join(packageRoot, "plugins-other/plugin")), false);
  assert.equal(paths.isPackagePlugin(path.join(work, "data/plugins/custom")), false);
  delete process.env.EPANEL_PACKAGE_ROOT;
  const legacyPlugins = path.join(work, "data", "plugins");
  for (const side of ["panel", "daemon"]) {
    assert.equal(
      paths
        .packagePluginRoots(side)
        .some(
          (root) =>
            root.directory === legacyPlugins || root.directory.startsWith(`${legacyPlugins}${path.sep}`)
        ),
      false,
      `${side} must not discover data/plugins`
    );
  }
  assert.equal(paths.packagePath("plugins"), path.join(work, "plugins"));
});

for (const side of ["panel", "daemon"]) {
  test(`${side}: version information comes from the runtime package and never the user project`, (t) => {
    const f = fixture(t);
    fs.writeFileSync(
      path.join(f.packageRoot, "package.json"),
      '{"version":"2.3.4","daemonVersion":"3.4.5"}'
    );
    fs.writeFileSync(path.join(f.work, "package.json"), '{"version":"9.9.9"}');
    const values = new Map();
    const GlobalVariable = {
      set: (key, value) => values.set(key, value),
      get: (key, fallback) => values.get(key) ?? fallback
    };
    const logger = {
      error: (error) => {
        throw new Error(error);
      },
      warn() {}
    };
    const version = load(
      side === "panel"
        ? "panel/plugins/runtime/src/backend/version.ts"
        : "daemon/plugins/runtime/src/backend/service/version.ts",
      {
        "mcsmanager-common": { GlobalVariable, ...f.paths },
        "./service/log": { logger },
        "./log": logger,
        "../i18n": { $t: (key) => key }
      }
    );
    version.initVersionManager();
    assert.equal(version.getVersion(), "2.3.4");
    if (side === "panel") assert.equal(version.specifiedDaemonVersion(), "3.4.5");
    assert.equal(fs.existsSync(path.join(f.packageRoot, "data")), false);
  });
}

test("project-level npm plugins are resolved alongside bundled plugins", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "elements-npm-project-"));
  const previous = {
    cwd: process.cwd(),
    packageRoot: process.env.EPANEL_PACKAGE_ROOT,
    projectRoot: process.env.EPANEL_PROJECT_ROOT
  };
  const work = path.join(root, "project");
  const packageRoot = path.join(work, "node_modules", "@elementspanel", "panel");
  fs.mkdirSync(packageRoot, { recursive: true });
  process.chdir(work);
  process.env.EPANEL_PACKAGE_ROOT = packageRoot;
  process.env.EPANEL_PROJECT_ROOT = work;
  t.after(() => {
    process.chdir(previous.cwd);
    for (const [key, value] of [
      ["EPANEL_PACKAGE_ROOT", previous.packageRoot],
      ["EPANEL_PROJECT_ROOT", previous.projectRoot]
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  const bundled = installNpmPlugin(packageRoot, "panel", "runtime");
  const project = installNpmPlugin(work, "panel", "custom");
  const { resolveNpmPlugins } = require("../runtime/npm-plugins.cjs");
  const records = resolveNpmPlugins(packageRoot, "panel");
  assert.deepEqual(
    records.map((record) => record.id).sort(),
    ["custom", "runtime"]
  );
  assert.equal(
    records.find((record) => record.id === "custom").packageRoot,
    project.packageRoot
  );

  const { listNpmPlugins } = load("common/src/plugin_npm.ts");
  const listed = listNpmPlugins("panel", { packageRoot, projectRoot: work });
  assert.deepEqual(
    listed.map((record) => [record.pluginId, record.source]).sort(),
    [
      ["custom", "project"],
      ["runtime", "bundled"]
    ]
  );
  assert.deepEqual(listed.find((record) => record.pluginId === "custom").sides, ["panel"]);
  assert.equal(
    bundled.directory,
    records.find((record) => record.id === "runtime").directory
  );
});

test("missing optional npm plugins do not abort runtime discovery", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "elements-npm-optional-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const host = path.join(root, "host");
  const runtime = installNpmPlugin(host, "panel", "runtime");
  const manifestFile = path.join(host, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.dependencies["epanel-plugin-optional"] = "1.0.0";
  manifest.elementspanel.plugins.optional = "epanel-plugin-optional";
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const { resolveNpmPlugins } = require("../runtime/npm-plugins.cjs");
  const records = resolveNpmPlugins(host, "panel", { skipInvalid: true });
  assert.deepEqual(records.map((record) => record.id), ["runtime"]);
  assert.equal(records[0].directory, runtime.directory);
});

test("archive executable permissions and the macOS amd64 alias work without modifying package assets", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.work, "data", "lib"), { recursive: true });
  const executable = path.join(f.work, "data", "lib", "file_zip_darwin_amd64");
  fs.writeFileSync(executable, "fixture", { mode: 0o555 });
  const paths = load("common/src/runtime_paths.ts", {
    "node:os": { platform: () => "darwin", arch: () => "x64" }
  });
  assert.equal(paths.bundledToolPath("file_zip"), executable);
  paths.ensureExecutable(executable);
  assert.equal(fs.statSync(executable).mode & 0o777, 0o555);
});

test("daemon tools download once into the installation data directory", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "elements-daemon-tools-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const downloads = [];
  const { ensureRuntimeTools } = require("../runtime/daemon-tools.cjs");
  await ensureRuntimeTools(root, {
    platform: "linux",
    arch: "x64",
    download: async (url, target) => {
      downloads.push({ url, target });
      fs.writeFileSync(target, "fixture binary");
    }
  });
  assert.deepEqual(
    downloads.map((item) => path.basename(item.target)).sort(),
    ["7z_linux_x64", "file_zip_linux_x64", "pty_linux_x64"]
  );
  assert.ok(downloads.every((item) => item.target.startsWith(path.join(root, "data", "lib"))));
  await ensureRuntimeTools(root, {
    platform: "linux",
    arch: "x64",
    download: async () => {
      throw new Error("existing daemon tools should not download again");
    }
  });
  assert.equal(downloads.length, 3);
});
