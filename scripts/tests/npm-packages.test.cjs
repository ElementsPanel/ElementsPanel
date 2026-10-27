const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const repository = path.resolve(__dirname, "../..");
const packaging = import(pathToFileURL(path.join(repository, "scripts/package-npm.mjs")).href);

function write(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, typeof value === "string" ? value : JSON.stringify(value));
}

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-npm-packages-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sourceRoot = path.join(directory, "workspace");
  const frontendRoot = path.join(sourceRoot, "frontend/dist");
  const frontendManifest = [];
  for (const side of ["panel", "daemon"]) {
    const root = path.join(sourceRoot, side);
    write(path.join(root, "production/app.js"), "// Precompiled fixture, no project build\n");
    write(path.join(root, "data/secret.json"), "private data");
    write(path.join(root, "logs/current.log"), "private log");
    write(path.join(root, "node_modules/do-not-bundle/index.js"), "private dependency tree");
    write(path.join(root, "plugins/market-only/plugin.json"), { id: "market-only" });
    for (const item of fs.readdirSync(path.join(repository, side, "plugins"), {
      withFileTypes: true
    })) {
      const sourceManifest = path.join(repository, side, "plugins", item.name, "plugin.json");
      if (!item.isDirectory() || !fs.existsSync(sourceManifest)) continue;
      const original = JSON.parse(fs.readFileSync(sourceManifest));
      const manifest = { ...original };
      if (original.backend) {
        write(
          path.join(root, "plugins", item.name, manifest.backend),
          "exports.apply = () => {};\n//# sourceMappingURL=index.cjs.map\n"
        );
        write(path.join(root, "plugins", item.name, `${manifest.backend}.map`), "{}");
      }
      write(
        path.join(root, "plugins", item.name, "src/private.ts"),
        "// Source stays in the workspace"
      );
      if (original.frontend) {
        const entry = `${item.name}/frontend/index.js`;
        const style = `${item.name}/frontend/assets/style.css`;
        write(
          path.join(frontendRoot, "plugins", entry),
          "export default {};\n//# sourceMappingURL=index.js.map\n"
        );
        write(path.join(frontendRoot, "plugins", `${entry}.map`), "{}");
        write(path.join(frontendRoot, "plugins", style), ".fixture { color: red; }\n");
        frontendManifest.push({
          assetDirectory: item.name,
          entry: `./${entry}`,
          styles: [`./${style}`]
        });
      }
      write(path.join(root, "plugins", item.name, "plugin.json"), manifest);
    }
  }
  write(path.join(frontendRoot, "plugins/manifest.json"), frontendManifest);
  write(path.join(frontendRoot, "index.html"), "<html>Panel fixture</html>");
  write(path.join(frontendRoot, "assets/shared.js"), "// Shared frontend chunk\n");
  write(path.join(frontendRoot, "upload_files/private.png"), "private upload");
  for (const url of fs
    .readFileSync(path.join(repository, "lib-urls.txt"), "utf8")
    .trim()
    .split(/\r?\n/)) {
    write(
      path.join(sourceRoot, "daemon/lib", path.basename(new URL(url).pathname)),
      "fixture native asset"
    );
  }
  write(path.join(sourceRoot, "daemon/lib/tmp_steamcmd.zip"), "private download");
  return { directory, sourceRoot, outputRoot: path.join(directory, "packages") };
}

test("workspace packaging includes runnable entry points and excludes user data and local dependencies", async (t) => {
  const f = fixture(t);
  const { packageNpm } = await packaging;
  const result = await packageNpm(f);
  for (const side of ["panel", "daemon"]) {
    const root = path.join(f.outputRoot, side);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json")));
    assert.equal(manifest.name, `@elementspanel/${side}`);
    assert.equal(
      manifest.version,
      JSON.parse(fs.readFileSync(path.join(repository, side, "package.json"))).version
    );
    assert.equal(manifest.optionalDependencies, undefined);
    assert.equal(manifest.devDependencies, undefined);
    assert.equal(manifest.scripts, undefined);
    for (const name of Object.keys(require("../webpack-cordis-externals.cjs")))
      assert.ok(manifest.dependencies[name], `Missing shared runtime dependency: ${name}`);
    assert.ok(!JSON.stringify(manifest).includes("file:../common"));
    assert.ok(fs.existsSync(path.join(root, "runtime/worker.cjs")));
    assert.ok(fs.existsSync(path.join(root, Object.values(manifest.bin)[0])));
    assert.ok(fs.existsSync(path.join(root, "LICENSE")));
    for (const excluded of [
      "data",
      "logs",
      "node_modules",
      "plugins/market-only",
      "public/upload_files",
      "public/plugins",
      "lib/tmp_steamcmd.zip"
    ]) {
      assert.equal(fs.existsSync(path.join(root, excluded)), false, excluded);
    }
    for (const plugin of fs.readdirSync(path.join(root, "plugins"))) {
      const pluginRoot = path.join(root, "plugins", plugin);
      const pluginManifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, "plugin.json")));
      if (pluginManifest.backend) {
        assert.ok(fs.existsSync(path.join(pluginRoot, pluginManifest.backend)));
        assert.doesNotMatch(
          fs.readFileSync(path.join(pluginRoot, pluginManifest.backend), "utf8"),
          /sourceMappingURL/
        );
        assert.equal(fs.existsSync(path.join(pluginRoot, `${pluginManifest.backend}.map`)), false);
      }
      assert.equal(fs.existsSync(path.join(pluginRoot, "src")), false);
      if (pluginManifest.frontend) {
        assert.equal(pluginManifest.frontend, "frontend/index.js");
        assert.deepEqual(pluginManifest.styles, ["frontend/assets/style.css"]);
        assert.ok(fs.existsSync(path.join(pluginRoot, pluginManifest.frontend)));
        assert.ok(fs.existsSync(path.join(pluginRoot, pluginManifest.styles[0])));
      }
    }
    const help = execFileSync(
      process.execPath,
      [path.join(root, Object.values(manifest.bin)[0]), "--help"],
      { encoding: "utf8" }
    );
    assert.match(help, /Usage:/);
  }
  assert.ok(fs.existsSync(path.join(f.outputRoot, "panel/public/assets/shared.js")));
  assert.ok(fs.existsSync(path.join(f.sourceRoot, "panel/production/app.js")));
  assert.ok(fs.existsSync(path.join(f.sourceRoot, "panel/plugins/console/backend/index.cjs.map")));
  assert.ok(
    fs.existsSync(path.join(f.sourceRoot, "frontend/dist/plugins/console/frontend/index.js.map"))
  );
  const create = JSON.parse(
    fs.readFileSync(path.join(f.outputRoot, "create-elementspanel/package.json"))
  );
  assert.deepEqual(create.runtimeVersions, {
    panel: result.panel.version,
    daemon: result.daemon.version
  });
  for (const filename of fs.readdirSync(path.join(f.outputRoot, "daemon/lib"))) {
    if (!filename.endsWith(".txt"))
      assert.ok(fs.statSync(path.join(f.outputRoot, "daemon/lib", filename)).mode & 0o111);
  }
  await assert.rejects(packageNpm(f), /Output already exists/);
});

test("incomplete builds and symlink assets cannot produce a publishable directory", async (t) => {
  const f = fixture(t);
  const { packageNpm } = await packaging;
  const entry = path.join(f.sourceRoot, "panel/plugins/console/backend/index.cjs");
  fs.unlinkSync(entry);
  await assert.rejects(packageNpm(f), /ENOENT|entry/);
  assert.equal(fs.existsSync(f.outputRoot), false);
  write(entry, "exports.apply=()=>{};");
  const secret = path.join(f.directory, "secret.json");
  write(secret, "must not be published");
  fs.symlinkSync(secret, path.join(f.sourceRoot, "frontend/dist/leak.json"));
  await assert.rejects(packageNpm(f), /symlinks/);
  assert.equal(fs.existsSync(f.outputRoot), false);
  assert.equal(fs.readFileSync(secret, "utf8"), "must not be published");
});

test("missing frontend assets or daemon plugin builds fail before producing packages", async (t) => {
  const f = fixture(t);
  const { packageNpm } = await packaging;
  const frontendEntry = path.join(f.sourceRoot, "frontend/dist/plugins/console/frontend/index.js");
  fs.unlinkSync(frontendEntry);
  await assert.rejects(packageNpm(f), /Missing compiled frontend/);
  assert.equal(fs.existsSync(f.outputRoot), false);
  write(frontendEntry, "export default {};\n");

  const style = path.join(f.sourceRoot, "frontend/dist/plugins/console/frontend/assets/style.css");
  fs.unlinkSync(style);
  await assert.rejects(packageNpm(f), /Missing compiled style/);
  assert.equal(fs.existsSync(f.outputRoot), false);
  write(style, ".fixture {}\n");

  fs.unlinkSync(path.join(f.sourceRoot, "daemon/plugins/runtime/backend/index.cjs"));
  await assert.rejects(packageNpm(f), /Missing compiled entry for daemon plugin runtime/);
  assert.equal(fs.existsSync(f.outputRoot), false);
});

test("staging a plugin rejects symlinks before stripping source maps", async (t) => {
  const f = fixture(t);
  const { packageNpm } = await packaging;
  const original = "private data\n//# sourceMappingURL=private.map\n";
  const secret = path.join(f.directory, "private.js");
  write(secret, original);
  fs.symlinkSync(secret, path.join(f.sourceRoot, "panel/plugins/console/backend/linked.js"));
  await assert.rejects(packageNpm(f), /symlinks/);
  assert.equal(fs.existsSync(f.outputRoot), false);
  assert.equal(fs.readFileSync(secret, "utf8"), original);
});

test("npm pack uses only the generated runtime files and does not run lifecycle scripts", async (t) => {
  const npmCLI = process.env.npm_execpath;
  if (!npmCLI) return t.skip("Run through npm test to exercise the npm CLI.");
  const f = fixture(t);
  const { packageNpm } = await packaging;
  await packageNpm(f);
  for (const name of ["panel", "daemon", "create-elementspanel"]) {
    const output = execFileSync(
      process.execPath,
      [
        npmCLI,
        "pack",
        path.join(f.outputRoot, name),
        "--ignore-scripts",
        "--offline",
        "--json",
        "--cache",
        path.join(f.directory, "cache"),
        "--pack-destination",
        f.directory
      ],
      { encoding: "utf8", timeout: 15_000 }
    );
    const [archive] = JSON.parse(output);
    assert.ok(archive.files.some((file) => file.path === "LICENSE"));
    assert.ok(
      archive.files.some(
        (file) => file.path === (name === "create-elementspanel" ? "bin.cjs" : `bin/${name}.cjs`)
      )
    );
    assert.ok(
      archive.files.every(
        (file) => !/(?:^|\/)(?:node_modules|data|logs|upload_files)(?:\/|$)/.test(file.path)
      )
    );
  }
});
