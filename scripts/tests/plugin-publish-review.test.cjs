const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");

test("publishing silently removes stale output before invoking the compiler", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-publish-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const outDir = path.join(workspace, ".dist");
  await fs.mkdir(outDir);
  await fs.writeFile(path.join(outDir, "stale.js"), "old output without a build marker");
  await fs.writeFile(path.join(workspace, "source.ts"), "keep source");
  const source = await fs.readFile(path.join(root, "scripts/publish-plugin.mjs"), "utf8");
  const start = source.indexOf('  const outDir = path.join(workspace, ".dist");');
  const end = source.indexOf('  if (!compiled.files?.length)', start);
  assert.ok(start >= 0 && end > start);
  let calls = 0;
  const execute = vm.runInNewContext(`(async () => {${source.slice(start, end)}})`, {
    fs, path, workspace, folder: "example",
    console: { log: () => assert.fail("Cleanup must be silent") },
    compile: async (_folder, input, output) => {
      calls++;
      assert.equal(input, workspace);
      assert.equal(output, outDir);
      await assert.rejects(fs.access(output), { code: "ENOENT" });
      assert.equal(await fs.readFile(path.join(workspace, "source.ts"), "utf8"), "keep source");
      return { files: ["panel/plugin.json"] };
    }
  });
  await execute();
  await execute(); // Missing output must also be accepted.
  assert.equal(calls, 2);
});

test("version overrides land in every manifest the package carries", async (t) => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-overrides-"));
  t.after(() => fs.rm(outDir, { recursive: true, force: true }));
  await fs.mkdir(path.join(outDir, "panel"), { recursive: true });
  await fs.mkdir(path.join(outDir, "daemon"), { recursive: true });
  await fs.writeFile(
    path.join(outDir, "panel/plugin.json"),
    JSON.stringify({ id: "one", version: "0.0.1" })
  );
  await fs.writeFile(path.join(outDir, "daemon/plugin.json"), JSON.stringify({ id: "one" }));

  const source = await fs.readFile(path.join(root, "scripts/publish-plugin.mjs"), "utf8");
  const start = source.indexOf("async function applyOverrides");
  const end = source.indexOf("async function upload", start);
  assert.ok(start >= 0 && end > start);
  const applyOverrides = await vm.runInNewContext(
    `(async () => {${source.slice(start, end)}\nreturn applyOverrides;})()`,
    { fs, path, JSON, Error }
  );
  await applyOverrides(outDir, ["panel/plugin.json", "daemon/plugin.json"], {
    version: "2.0.0",
    changelog: "note"
  });

  const panel = JSON.parse(await fs.readFile(path.join(outDir, "panel/plugin.json"), "utf8"));
  const daemon = JSON.parse(await fs.readFile(path.join(outDir, "daemon/plugin.json"), "utf8"));
  assert.equal(panel.version, "2.0.0");
  assert.equal(panel.changelog, "note");
  assert.equal(daemon.version, "2.0.0");
  assert.equal(daemon.changelog, "note");
  await assert.rejects(
    applyOverrides(outDir, ["backend/index.cjs"], { version: "2.0.0", changelog: "" }),
    /no plugin\.json/
  );
});
