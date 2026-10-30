const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const { createLoader, from } = require("./helpers.cjs");
const { sourcePlugins, coreDirectory } = require("../workspace-layout.cjs");
const { readPluginManifest } = createLoader()("core/common/src/plugin_manifest.ts");
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
  const frontendRoot = path.join(sourceRoot, "core/frontend/dist");
  const frontendManifest = [];
  for (const side of ["panel", "daemon"]) {
    const root = coreDirectory(side, sourceRoot);
    write(path.join(root, "production/app.js"), "// Precompiled fixture, no project build\n");
    write(path.join(root, "data/secret.json"), "private data");
    write(path.join(root, "logs/current.log"), "private log");
    write(path.join(root, "node_modules/do-not-bundle/index.js"), "private dependency tree");
    write(path.join(root, "plugins/market-only/plugin.json"), { id: "market-only" });
    for (const plugin of sourcePlugins(side)) {
      const item = { name: plugin.folder };
      const sourceManifest = path.join(plugin.directory, "plugin.json");
      const original = JSON.parse(fs.readFileSync(sourceManifest));
      const pluginRoot = path.join(sourceRoot, "plugins", plugin.id, side);
      write(path.join(path.dirname(pluginRoot), "package.json"), plugin.metadata);
      const manifest = { ...original };
      if (original.backend) {
        write(
          path.join(pluginRoot, manifest.backend),
          "exports.apply = () => {};\n//# sourceMappingURL=index.cjs.map\n"
        );
        write(path.join(pluginRoot, `${manifest.backend}.map`), "{}");
      }
      write(
        path.join(pluginRoot, "src/private.ts"),
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
      write(path.join(pluginRoot, "plugin.json"), manifest);
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

test("backend bundles only externalize dependencies declared by the published runtime", async () => {
  const { runtimeManifest } = await packaging;
  const shared = Object.keys(require("../webpack-cordis-externals.cjs"));
  for (const side of ["panel", "daemon"]) {
    const host = coreDirectory(side);
    const source = JSON.parse(fs.readFileSync(path.join(host, "package.json")));
    const manifest = runtimeManifest(side, source);
    const allowed = new Set([...Object.keys(manifest.dependencies), ...shared]);
    const lock = JSON.parse(fs.readFileSync(path.join(host, "package-lock.json")));
    const requests = [
      "mcsmanager-common",
      "axios/unsafe/helpers/buildURL.js",
      ...Object.keys(lock.packages)
        .filter((name) => /^node_modules\/(?:@[^/]+\/)?[^/]+$/.test(name))
        .map((name) => name.slice("node_modules/".length))
    ];
    for (const filename of ["webpack.config.js", "webpack.plugins.config.js"]) {
      const previous = process.cwd();
      let config;
      try {
        process.chdir(host);
        config = from(side)(path.join(host, filename));
      } finally {
        process.chdir(previous);
      }
      for (const request of requests) {
        let external;
        for (const rule of config.externals) {
          external =
            typeof rule === "function"
              ? await new Promise((resolve, reject) =>
                  rule({ context: host, request }, (error, result) =>
                    error ? reject(error) : resolve(result)
                  )
                )
              : rule[request];
          if (external) break;
        }
        if (!external) continue;
        const name = request.split("/").slice(0, request.startsWith("@") ? 2 : 1).join("/");
        assert.ok(allowed.has(name), `${side}/${filename} leaves undeclared import ${request}`);
      }
    }
  }
});

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
      JSON.parse(fs.readFileSync(path.join(coreDirectory(side), "package.json"))).version
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
    if (side === "daemon") {
      assert.ok(fs.existsSync(path.join(root, "licenses/7z-extra-license.txt")));
      assert.ok(fs.existsSync(path.join(root, "licenses/7z-unix-license.txt")));
    }
    for (const excluded of [
      "data",
      "logs",
      "node_modules",
      "plugins",
      "public/upload_files",
      "public/plugins",
      "lib"
    ]) {
      assert.equal(fs.existsSync(path.join(root, excluded)), false, excluded);
    }
    assert.equal(manifest.elementspanel.side, side);
    for (const [id, name] of Object.entries(manifest.elementspanel.plugins)) {
      const metadata = result.plugins.find((plugin) => plugin.name === name);
      assert.ok(metadata, `Missing npm package for ${id}`);
      assert.equal(manifest.dependencies[name], metadata.version);
      assert.equal(metadata.peerDependencies[manifest.name], manifest.version);
      assert.equal(metadata.peerDependenciesMeta[manifest.name].optional, true);
      const pluginRoot = path.join(f.outputRoot, name.split("/")[1], side);
      const pluginManifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, "plugin.json")));
      assert.equal(pluginManifest.id, undefined);
      assert.equal(pluginManifest.version, undefined);
      assert.equal(pluginManifest.dual, undefined);
      assert.ok(
        Object.keys(pluginManifest).every((field) =>
          ["backend", "frontend"].includes(field)
        )
      );
      assert.equal(fs.existsSync(path.join(pluginRoot, "package.json")), false);
      const folder = metadata.elementspanel[side].folder;
      const sourcePlugin = sourcePlugins(side).find((plugin) => plugin.id === id);
      const sourceMetadata = sourcePlugin.metadata;
      const definition = sourceMetadata.elementspanel[side];
      const discovered = readPluginManifest(pluginRoot);
      assert.equal(discovered.id, id);
      assert.equal(discovered.version, metadata.version);
      assert.equal(discovered.dual, sourceMetadata.elementspanel.dual);
      assert.equal(metadata.elementspanel[side].id, undefined);
      assert.equal(metadata.elementspanel[side].version, undefined);
      assert.equal(metadata.elementspanel[side].dual, undefined);
      assert.equal(discovered.description, definition.description ?? sourceMetadata.description);
      assert.equal(discovered.priority, definition.priority);
      for (const field of ["frontendInject", "frontendImmediate", "frontendRequired"])
        assert.deepEqual(discovered[field], definition[field]);
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
        const styles = metadata.elementspanel[side].styles;
        assert.deepEqual(styles, ["frontend/assets/style.css"]);
        assert.deepEqual(discovered.styles, styles);
        assert.ok(fs.existsSync(path.join(pluginRoot, pluginManifest.frontend)));
        assert.ok(fs.existsSync(path.join(pluginRoot, styles[0])));
      }
    }
    const help = execFileSync(
      process.execPath,
      [path.join(root, Object.values(manifest.bin)[0]), "--help"],
      { encoding: "utf8" }
    );
    assert.match(help, /Usage:/);
  }
  assert.equal(result.plugins.length, 17);
  assert.ok(result.plugins.every((plugin) => /^@elementspanel\/epanel-plugin-/.test(plugin.name)));
  const mod = result.plugins.find((plugin) => plugin.elementspanel.id === "mod-manager");
  assert.equal(mod.elementspanel.panel.folder, "mod");
  assert.equal(mod.elementspanel.daemon.folder, "mod");
  assert.ok(fs.existsSync(path.join(f.outputRoot, "panel/public/assets/shared.js")));
  assert.ok(fs.existsSync(path.join(f.sourceRoot, "core/panel/production/app.js")));
  assert.ok(fs.existsSync(path.join(f.sourceRoot, "plugins/console/panel/backend/index.cjs.map")));
  assert.ok(
    fs.existsSync(path.join(f.sourceRoot, "core/frontend/dist/plugins/console/frontend/index.js.map"))
  );
  const create = JSON.parse(
    fs.readFileSync(path.join(f.outputRoot, "init-elementspanel/package.json"))
  );
  assert.equal(create.name, "@elementspanel/init");
  assert.equal(create.bin.init, "bin.cjs");
  const chineseHelp = execFileSync(
    process.execPath,
    [path.join(f.outputRoot, "init-elementspanel/bin.cjs"), "--language", "zh", "--help"],
    { encoding: "utf8" }
  );
  assert.match(chineseHelp, /用法：npx @elementspanel\/init@latest/);
  assert.ok(fs.existsSync(path.join(f.outputRoot, "init-elementspanel/workspace.cjs")));
  const initializer = require(path.join(f.outputRoot, "init-elementspanel/index.cjs"));
  const workspace = require(path.join(f.outputRoot, "init-elementspanel/workspace.cjs"));
  const project = path.join(f.directory, "initialized-project");
  await initializer.initialize({ directory: project, mode: "full", install: false });
  await workspace.setupWorkspace(project, ["example", "--both", "--no-install"]);
  const generatedRoot = path.join(project, "external/example");
  const generated = JSON.parse(fs.readFileSync(path.join(generatedRoot, "package.json")));
  assert.equal(generated.description, "ElementsPanel example plugin");
  assert.equal(generated.elementspanel.id, "example");
  assert.equal(generated.elementspanel.dual, true);
  assert.equal(generated.version, "0.1.0");
  assert.ok(generated.scripts.build.startsWith('node -e "'));
  assert.doesNotMatch(generated.scripts.build, /epanel-workspace|scripts\/build/);
  assert.equal(generated.scripts.prepack, "npm run build");
  assert.deepEqual(generated.elementspanel.panel.frontendInject, ["console", "i18n"]);
  for (const side of ["panel", "daemon"]) {
    const sideManifest = JSON.parse(fs.readFileSync(path.join(generatedRoot, side, "plugin.json")));
    assert.deepEqual(
      Object.keys(sideManifest).sort(),
      (side === "panel"
        ? ["backend", "frontend"]
        : ["backend"]
      ).sort()
    );
    assert.equal(
      readPluginManifest(path.join(generatedRoot, side)).description,
      generated.description
    );
  }
  assert.deepEqual(create.runtimeVersions, {
    panel: result.panel.version,
    daemon: result.daemon.version
  });
  assert.equal(fs.existsSync(path.join(f.outputRoot, "daemon/lib")), false);
  fs.writeFileSync(path.join(f.outputRoot, "stale-output.txt"), "replace me");
  await packageNpm(f);
  assert.equal(fs.existsSync(path.join(f.outputRoot, "stale-output.txt")), false);
  assert.ok(fs.existsSync(path.join(f.outputRoot, "panel/package.json")));
});

test("separate npm plugin packages resolve from hoisted and nested installations", async (t) => {
  const f = fixture(t);
  const { packageNpm } = await packaging;
  const result = await packageNpm(f);
  const project = path.join(f.directory, "installation");
  for (const side of ["panel", "daemon"]) {
    const host = path.join(project, "node_modules/@elementspanel", side);
    fs.cpSync(path.join(f.outputRoot, side), host, { recursive: true });
    const selected = result.plugins.filter((plugin) => plugin.elementspanel[side]);
    for (const [index, plugin] of selected.entries()) {
      const target = path.join(index % 2 ? host : project, "node_modules", plugin.name);
      fs.cpSync(path.join(f.outputRoot, plugin.name.split("/")[1]), target, { recursive: true });
    }
    const { resolveNpmPlugins } = require(path.join(host, "runtime/npm-plugins.cjs"));
    const roots = resolveNpmPlugins(host, side);
    assert.deepEqual(
      roots.map((plugin) => plugin.id).sort(),
      selected.map((plugin) => plugin.elementspanel.id).sort()
    );
    assert.ok(
      roots.every((plugin) => fs.existsSync(path.join(plugin.directory, "backend/index.cjs")))
    );
    assert.equal(roots.find((plugin) => plugin.id === "mod-manager").folder, "mod");
    assert.equal(fs.existsSync(path.join(host, "plugins")), false);
    const { planWorkers } = require(path.join(host, "runtime/cli.cjs"));
    assert.equal(planWorkers(side, host, { cwd: project }).workers.length, 1);
  }
});

test("incomplete builds and symlink assets cannot produce a publishable directory", async (t) => {
  const f = fixture(t);
  const { packageNpm } = await packaging;
  const entry = path.join(f.sourceRoot, "plugins/console/panel/backend/index.cjs");
  fs.unlinkSync(entry);
  await assert.rejects(packageNpm(f), /ENOENT|entry/);
  assert.equal(fs.existsSync(f.outputRoot), false);
  write(entry, "exports.apply=()=>{};");
  const secret = path.join(f.directory, "secret.json");
  write(secret, "must not be published");
  fs.symlinkSync(secret, path.join(f.sourceRoot, "core/frontend/dist/leak.json"));
  await assert.rejects(packageNpm(f), /symlinks/);
  assert.equal(fs.existsSync(f.outputRoot), false);
  assert.equal(fs.readFileSync(secret, "utf8"), "must not be published");
});

test("missing frontend assets or daemon plugin builds fail before producing packages", async (t) => {
  const f = fixture(t);
  const { packageNpm } = await packaging;
  const frontendEntry = path.join(f.sourceRoot, "core/frontend/dist/plugins/console/frontend/index.js");
  fs.unlinkSync(frontendEntry);
  await assert.rejects(packageNpm(f), /Missing compiled frontend/);
  assert.equal(fs.existsSync(f.outputRoot), false);
  write(frontendEntry, "export default {};\n");

  const style = path.join(f.sourceRoot, "core/frontend/dist/plugins/console/frontend/assets/style.css");
  fs.unlinkSync(style);
  await assert.rejects(packageNpm(f), /Missing compiled style/);
  assert.equal(fs.existsSync(f.outputRoot), false);
  write(style, ".fixture {}\n");

  fs.unlinkSync(path.join(f.sourceRoot, "plugins/runtime/daemon/backend/index.cjs"));
  await assert.rejects(packageNpm(f), /Missing compiled entry for daemon plugin runtime/);
  assert.equal(fs.existsSync(f.outputRoot), false);
});

test("staging a plugin rejects symlinks before stripping source maps", async (t) => {
  const f = fixture(t);
  const { packageNpm } = await packaging;
  const original = "private data\n//# sourceMappingURL=private.map\n";
  const secret = path.join(f.directory, "private.js");
  write(secret, original);
  fs.symlinkSync(secret, path.join(f.sourceRoot, "plugins/console/panel/backend/linked.js"));
  await assert.rejects(packageNpm(f), /symlinks/);
  assert.equal(fs.existsSync(f.outputRoot), false);
  assert.equal(fs.readFileSync(secret, "utf8"), original);
});

test("npm pack includes runtime and built-in plugin artifacts without sources or user data", async (t) => {
  const npmCLI = process.env.npm_execpath;
  if (!npmCLI) return t.skip("Run through npm test to exercise the npm CLI.");
  const f = fixture(t);
  const { packageNpm } = await packaging;
  await packageNpm(f);
  for (const name of fs.readdirSync(f.outputRoot)) {
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
    if (name.startsWith("epanel-plugin-")) {
      assert.ok(archive.files.some((file) => /^(panel|daemon)\/plugin.json$/.test(file.path)));
      assert.ok(archive.files.every((file) => !/(?:^|\/)src\//.test(file.path)));
    } else {
      assert.ok(
        archive.files.some(
          (file) => file.path === (name === "init-elementspanel" ? "bin.cjs" : `bin/${name}.cjs`)
        )
      );
      if (name === "init-elementspanel")
        assert.ok(archive.files.some((file) => file.path === "workspace.cjs"));
    }
    assert.ok(
      archive.files.every(
        (file) => !/(?:^|\/)(?:node_modules|data|logs|upload_files)(?:\/|$)/.test(file.path)
      )
    );
  }
});
