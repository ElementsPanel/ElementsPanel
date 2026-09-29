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
