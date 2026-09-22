const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const compiler = path.join(root, "scripts/compile-plugin.mjs");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function workspace(t, manifest, files = {}, icon = null) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-plugin-compile-"));
  const output = fs.mkdtempSync(path.join(root, ".plugin-compile-review-"));
  fs.rmSync(output, { recursive: true, force: true });
  t.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(output, { recursive: true, force: true });
  });
  for (const [relative, content] of Object.entries(manifest)) {
    const filename = path.join(directory, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, JSON.stringify(content, null, 2));
  }
  for (const [relative, content] of Object.entries(files)) {
    const filename = path.join(directory, relative);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, content);
  }
  if (icon) fs.writeFileSync(path.join(directory, "icon.png"), icon);
  return { directory, output };
}

function compile(directory, output) {
  const result = spawnSync(
    process.execPath,
    [compiler, "--workspace", directory, "--out", output],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000
    }
  );
  if (result.error) throw result.error;
  return result;
}

test("compile declares only actual entries and places a valid icon on the preferred side", (t) => {
  const env = workspace(
    t,
    { "daemon/plugin.json": { id: "daemon-only", version: "1.0.0" } },
    {},
    PNG
  );
  const result = compile(env.directory, env.output);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(env.output, "daemon/plugin.json"), "utf8"));
  assert.equal(manifest.backend, undefined);
  assert.equal(manifest.frontend, undefined);
  assert.equal(
    fs.readFileSync(path.join(env.output, "daemon/icon.png"), "hex"),
    PNG.toString("hex")
  );
  assert.equal(fs.existsSync(path.join(env.output, "panel")), false);
  const summary = JSON.parse(result.stdout.trim());
  assert.deepEqual(summary.sides, [
    {
      side: "daemon",
      id: "daemon-only",
      version: "1.0.0",
      frontend: false,
      readme: false,
      icon: true
    }
  ]);
  assert.ok(!summary.files.includes(".elements-plugin-build.json"));
});

test("a panel-only frontend package does not retain a source backend alias", (t) => {
  const env = workspace(
    t,
    {
      "panel/plugin.json": {
        id: "frontend-only",
        backend: "src/backend/index.ts",
        ui: "src/frontend.ts",
        frontend: "src/frontend.ts"
      }
    },
    { "panel/src/frontend.ts": "export function apply() {}\n" }
  );
  const result = compile(env.directory, env.output);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(env.output, "panel/plugin.json"), "utf8"));
  assert.equal(manifest.backend, undefined);
  assert.equal(manifest.frontend, "frontend/index.js");
  assert.equal(manifest.ui, undefined);
  assert.equal(fs.existsSync(path.join(env.output, "panel/frontend/index.js")), true);
});

test("invalid or linked icons fail before an existing output is cleared", (t) => {
  const env = workspace(
    t,
    { "daemon/plugin.json": { id: "icon-check" } },
    {},
    Buffer.from("not png")
  );
  fs.mkdirSync(env.output, { recursive: true });
  fs.writeFileSync(path.join(env.output, "sentinel.txt"), "keep");
  const invalid = compile(env.directory, env.output);
  assert.notEqual(invalid.status, 0);
  assert.equal(fs.readFileSync(path.join(env.output, "sentinel.txt"), "utf8"), "keep");

  const valid = path.join(env.directory, "valid.png");
  fs.writeFileSync(valid, PNG);
  fs.rmSync(path.join(env.directory, "icon.png"));
  try {
    fs.symlinkSync(valid, path.join(env.directory, "icon.png"), "file");
  } catch {
    return;
  }
  const linked = compile(env.directory, env.output);
  assert.notEqual(linked.status, 0);
  assert.equal(fs.readFileSync(path.join(env.output, "sentinel.txt"), "utf8"), "keep");
});

test("oversized icons are rejected", (t) => {
  const icon = Buffer.alloc(1024 * 1024 + 1);
  PNG.copy(icon);
  const env = workspace(t, { "daemon/plugin.json": { id: "large-icon" } }, {}, icon);
  const result = compile(env.directory, env.output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no larger than/);
});
