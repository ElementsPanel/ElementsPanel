const { from, createLoader } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const commonRequire = from("common");
const ts = commonRequire("typescript");
const fse = commonRequire("fs-extra");
const load = createLoader({
  compiler: ts,
  resolve(id, { filename, localRequire, load }) {
    if (id === "./plugin_manifest") return load("common/src/plugin_manifest.ts");
    const target = path.resolve(path.dirname(filename), id) + ".ts";
    return id.startsWith(".") && fs.existsSync(target) ? load(target) : localRequire(id);
  }
});
const source = "common/src/plugin_package.ts";
const info = { pluginId: "sample-id", name: "sample", version: "1", installedAt: 1 };
const files = (version) => [
  { relative: "plugin.json", content: Buffer.from(JSON.stringify({ id: "sample", version })) }
];
function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "elements-plugin-package-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("plugin upgrades replace obsolete files and do not expose staging packages to discovery", async (t) => {
  const dir = directory(t);
  const service = load(source, {
    "fs-extra": {
      ...fse,
      rename: async (from, to) => {
        if (path.basename(from) === "package") {
          assert.equal(fs.existsSync(path.join(path.dirname(from), "plugin.json")), false);
        }
        return fse.rename(from, to);
      }
    }
  });
  const installed = await service.writePluginPackage(dir, info, [
    ...files(1),
    { relative: "obsolete.js", content: Buffer.from("old") }
  ]);
  await service.writePluginPackage(dir, { ...info, version: "2" }, files(2));
  assert.equal(fs.existsSync(path.join(installed, "obsolete.js")), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(installed, "plugin.json"))).version, 2);
  assert.deepEqual(fs.readdirSync(dir), ["sample"]);
});

test("market installs cannot shadow npm plugins by id or public asset folder", async (t) => {
  const dir = directory(t);
  const service = load(source);
  const npmPlugin = path.join(dir, "node_modules/@elementspanel/epanel-plugin-sample/panel");
  await fse.outputJson(path.join(npmPlugin, "plugin.json"), { id: "builtin", version: "1.0.0" });
  const roots = [{ directory: npmPlugin, folder: "sample" }];
  for (const [name, id] of [
    ["sample", "different"],
    ["different", "builtin"]
  ]) {
    await assert.rejects(
      service.writePluginPackage(
        path.join(dir, "data/plugins"),
        { ...info, name },
        [
          {
            relative: "plugin.json",
            content: Buffer.from(JSON.stringify({ id, version: "1.0.0" }))
          }
        ],
        roots
      ),
      /DIR_TAKEN/
    );
    assert.equal(fs.existsSync(path.join(dir, "data/plugins", name)), false);
  }
  assert.equal((await fse.readJson(path.join(npmPlugin, "plugin.json"))).id, "builtin");
});

test("failed writes and failed replacement restore the previous release and marker", async (t) => {
  const dir = directory(t);
  const original = load(source);
  const installed = await original.writePluginPackage(dir, info, files(1));
  for (const failure of ["write", "rename"]) {
    const service = load(source, {
      "fs-extra": {
        ...fse,
        outputFile: async (...args) => {
          if (failure === "write") throw new Error("disk full");
          return fse.outputFile(...args);
        },
        rename: async (from, to) => {
          if (failure === "rename" && path.basename(from) === "package")
            throw new Error("file locked");
          return fse.rename(from, to);
        }
      }
    });
    await assert.rejects(
      service.writePluginPackage(dir, { ...info, version: "2" }, files(2)),
      /disk full|file locked/
    );
    assert.equal(JSON.parse(fs.readFileSync(path.join(installed, "plugin.json"))).version, 1);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(installed, ".market-install.json"))).version,
      "1"
    );
    assert.deepEqual(fs.readdirSync(dir), ["sample"]);
  }
});

test("invalid package manifests and missing entries leave the installed release intact", async (t) => {
  const dir = directory(t);
  const service = load(source);
  const installed = await service.writePluginPackage(dir, info, files(1));
  const previousManifest = fs.readFileSync(path.join(installed, "plugin.json"), "utf8");
  const previousMarker = fs.readFileSync(path.join(installed, ".market-install.json"), "utf8");
  const manifest = (content) => [{ relative: "plugin.json", content: Buffer.from(content) }];
  for (const invalid of [
    [{ relative: "readme.md", content: Buffer.from("No manifest") }],
    manifest("{"),
    manifest("null"),
    manifest("[]"),
    manifest('{"id":" "}'),
    manifest('{"id":"sample","backend":"backend/missing.cjs"}'),
    manifest('{"id":"sample","backend":"../outside.cjs"}'),
    manifest('{"id":"sample","frontend":"frontend/missing.js"}'),
    [
      ...manifest('{"id":"sample","backend":"backend"}'),
      { relative: "backend/index.cjs", content: Buffer.from("exports.apply = () => {};") }
    ]
  ]) {
    await assert.rejects(
      service.writePluginPackage(dir, { ...info, version: "2" }, invalid),
      /EMPTY_PACKAGE/
    );
    assert.equal(fs.readFileSync(path.join(installed, "plugin.json"), "utf8"), previousManifest);
    assert.equal(
      fs.readFileSync(path.join(installed, ".market-install.json"), "utf8"),
      previousMarker
    );
    assert.deepEqual(fs.readdirSync(dir), ["sample"]);
  }
  await service.writePluginPackage(dir, { ...info, version: "2" }, [
    ...manifest('{"id":"different-runtime-id","version":"2","frontend":"frontend/index.js"}'),
    { relative: "frontend/index.js", content: Buffer.from("export function apply() {}") }
  ]);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(installed, "plugin.json"))).id,
    "different-runtime-id"
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(installed, ".market-install.json"))).pluginId,
    info.pluginId
  );
});

test("plugin packages reject escaping paths, duplicate files and another plugin's ownership", async (t) => {
  const dir = directory(t);
  const service = load(source);
  await service.writePluginPackage(dir, info, files(1));
  for (const relative of [
    "../escape.js",
    "nested/../../escape.js",
    "NUL.json",
    "data:stream.js",
    ".market-install.json",
    "tail./file.js"
  ]) {
    await assert.rejects(
      service.writePluginPackage(dir, info, [{ relative, content: Buffer.from("bad") }]),
      /BAD_PATH/
    );
  }
  await assert.rejects(
    service.writePluginPackage(dir, info, [...files(2), ...files(3)]),
    /BAD_PATH/
  );
  await assert.rejects(
    service.writePluginPackage(dir, { ...info, pluginId: "different" }, files(2)),
    /DIR_TAKEN/
  );
  await assert.rejects(service.removePluginPackage(dir, "sample", "different"), /DIR_TAKEN/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "sample", "plugin.json"))).version, 1);
  await service.removePluginPackage(dir, "sample", info.pluginId);
  await service.removePluginPackage(dir, "sample", info.pluginId);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("directory junctions cannot redirect a plugin write or removal", async (t) => {
  const dir = directory(t);
  const outside = directory(t);
  fs.writeFileSync(path.join(outside, "keep.json"), "keep");
  fs.symlinkSync(outside, path.join(dir, "sample"), "junction");
  const service = load(source);
  await assert.rejects(service.writePluginPackage(dir, info, files(1)), /BAD_PATH/);
  await assert.rejects(service.removePluginPackage(dir, "sample", info.pluginId), /BAD_PATH/);
  assert.equal(fs.readFileSync(path.join(outside, "keep.json"), "utf8"), "keep");
});

test("persistent installs reject collisions with bundled identities and allow upgrading the same legacy owner", async (t) => {
  const dir = directory(t);
  const source = load("common/src/plugin_package.ts");
  const builtin = path.join(dir, "plugins");
  const persistent = path.join(dir, "data/plugins");
  await fse.outputFile(path.join(builtin, "core/plugin.json"), '{"id":"sample"}');
  await assert.rejects(
    source.writePluginPackage(persistent, info, files(1), [builtin]),
    /DIR_TAKEN/
  );
  await fse.outputFile(path.join(builtin, "core/.market-install.json"), JSON.stringify(info));
  await source.writePluginPackage(persistent, info, files(2), [builtin]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(persistent, "sample/plugin.json"))).version, 2);
});
