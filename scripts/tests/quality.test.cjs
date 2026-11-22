const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { test } = require("node:test");
const {
  qualityFiles,
  matchesBaseline,
  sourceDigest,
  digest,
  lintSignature,
  lintEngine,
  formatInput,
  checkLint,
  checkFormat
} = require("../check-quality.cjs");
const { root: repository } = require("../quality-tools.cjs");

test("quality discovery includes new plugins, scripts, templates and configs while excluding artifacts", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "epanel-quality-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  fs.writeFileSync(
    path.join(root, ".gitignore"),
    "node_modules/\ndist/\ndata/\nmarket_plugins/\nplugins/*/panel/backend/\n"
  );
  const sources = [
    "core/common/new.ts",
    "core/panel/new.cts",
    "core/daemon/new.mts",
    "core/frontend/new.tsx",
    "plugins/new/panel/new.vue",
    "plugins/new/daemon/new.ts",
    "plugins/new/shared/new.ts",
    "plugins/new/panel/src/i18n/en_US.json",
    "plugins/new/panel/new.scss",
    "scripts/new.mjs",
    "scripts/tests/new.test.cjs",
    "packages/new/templates/new.cjs",
    ".github/workflows/new.yml",
    "a space/中文\nfile.ts"
  ];
  const artifacts = [
    "node_modules/ignored.ts",
    "core/frontend/node_modules/ignored.js",
    "core/panel/dist/ignored.ts",
    "data/panel/ignored.json",
    "market_plugins/new/source.ts",
    "plugins/new/panel/backend/index.cjs"
  ];
  for (const file of [...sources, ...artifacts, "deleted.ts"]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), "");
  }
  execFileSync("git", ["add", "deleted.ts", "core/common/new.ts"], { cwd: root });
  fs.unlinkSync(path.join(root, "deleted.ts"));
  const files = qualityFiles(root);
  assert.deepEqual(files, [".gitignore", ...sources].sort());
});

test("quality baselines allow only unchanged source and identical diagnostics or format configuration", () => {
  const source = "const value = 1;\n";
  const signature = "existing diagnostic";
  const entry = { source: sourceDigest(source), signature: digest(signature) };
  assert.equal(matchesBaseline(entry, source, signature), true);
  assert.equal(matchesBaseline(entry, source.replace(/\n/g, "\r\n"), signature), true);
  assert.equal(matchesBaseline(entry, `${source}broken();\n`, signature), false);
  assert.equal(matchesBaseline(entry, source, "new diagnostic or configuration"), false);
  assert.equal(matchesBaseline(undefined, source, signature), false);
});

test("checks reject changed debt and parser errors without modifying sources", async (t) => {
  const directory = fs.mkdtempSync(path.join(repository, "scripts/.quality-probe-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
  const filename = path.join(directory, "probe.cjs");
  const file = path.relative(repository, filename).split(path.sep).join("/");
  const source = "const unused=42\n";
  fs.writeFileSync(filename, source);
  const [result] = await lintEngine().lintFiles([file]);
  const lint = {
    [file]: { source: sourceDigest(source), signature: digest(lintSignature(result.messages)) }
  };
  const input = await formatInput(file);
  const format = { [file]: { source: sourceDigest(source), signature: digest(input.signature) } };
  assert.equal(await checkLint([file], {}), false);
  assert.equal(await checkFormat([file], {}), false);
  assert.equal(await checkLint([file], lint), true);
  assert.equal(await checkFormat([file], format), true);
  assert.equal(fs.readFileSync(filename, "utf8"), source);
  fs.writeFileSync(filename, "const unused=43\n");
  assert.equal(await checkLint([file], lint), false);
  assert.equal(await checkFormat([file], format), false);
  fs.writeFileSync(filename, "const =;\n");
  const [invalid] = await lintEngine().lintFiles([file]);
  const invalidBaseline = {
    [file]: {
      source: sourceDigest("const =;\n"),
      signature: digest(lintSignature(invalid.messages))
    }
  };
  assert.equal(await checkLint([file], invalidBaseline), false);
  assert.equal(await checkFormat([file], format), false);
});

test("lint parses Vue and TypeScript and reports defects in every source family", async () => {
  const engine = lintEngine();
  for (const filePath of [
    "core/common/quality-probe.ts",
    "core/panel/quality-probe.cts",
    "core/daemon/quality-probe.mts",
    "core/frontend/quality-probe.tsx",
    "plugins/new/shared/quality-probe.ts",
    "plugins/new/panel/quality-probe.ts",
    "plugins/new/daemon/quality-probe.ts"
  ]) {
    const [result] = await engine.lintText("const unused: number = 1;\n", { filePath });
    assert.equal(result.fatalErrorCount, 0, filePath);
    assert.ok(result.warningCount > 0, filePath);
  }
  for (const filePath of ["scripts/quality-probe.cjs", "packages/new/quality-probe.mjs"]) {
    const [result] = await engine.lintText("missingFunction();\n", { filePath });
    assert.ok(
      result.messages.some((message) => message.ruleId === "no-undef"),
      filePath
    );
  }
  for (const filePath of [
    "core/frontend/src/quality-probe.js",
    "plugins/new/panel/quality-probe.js"
  ]) {
    const [result] = await engine.lintText("window.addEventListener('resize', () => {});\n", {
      filePath
    });
    assert.equal(result.errorCount, 0, filePath);
  }
  const [vue] = await engine.lintText(
    '<script setup lang="ts">const title: string = "Title";</script><template><h1>{{ title }}</h1></template>',
    { filePath: "plugins/new/panel/QualityProbe.vue" }
  );
  assert.equal(vue.fatalErrorCount, 0);
  assert.equal(vue.errorCount, 0);
});
