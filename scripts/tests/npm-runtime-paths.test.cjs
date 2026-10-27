const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { createLoader } = require("./helpers.cjs");
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
  const { default: Storage } = load("common/src/system_storage.ts");
  assert.equal(Storage.DATA_PATH, path.join(work, "data"));
  assert.equal(paths.packagePath("public"), path.join(packageRoot, "public"));
  assert.ok(paths.bundledToolPath("pty").startsWith(path.join(packageRoot, "lib") + path.sep));
  assert.equal(paths.isPackagePlugin(path.join(packageRoot, "plugins/runtime")), true);
  assert.equal(paths.isPackagePlugin(path.join(packageRoot, "plugins-other/plugin")), false);
  assert.equal(paths.isPackagePlugin(path.join(work, "data/plugins/custom")), false);
  delete process.env.EPANEL_PACKAGE_ROOT;
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

test("archive executable permissions and the macOS amd64 alias work without modifying package assets", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.packageRoot, "lib"));
  const executable = path.join(f.packageRoot, "lib", "file_zip_darwin_amd64");
  fs.writeFileSync(executable, "fixture", { mode: 0o555 });
  const paths = load("common/src/runtime_paths.ts", {
    "node:os": { platform: () => "darwin", arch: () => "x64" }
  });
  assert.equal(paths.bundledToolPath("file_zip"), executable);
  paths.ensureExecutable(executable);
  assert.equal(fs.statSync(executable).mode & 0o777, 0o555);
});
