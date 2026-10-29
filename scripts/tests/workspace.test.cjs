const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { initialize } = require("../../packages/init-elementspanel/index.cjs");
const { setupWorkspace } = require("../../packages/init-elementspanel/workspace.cjs");
const { createLoader } = require("./helpers.cjs");
const { readPluginManifest } = createLoader()("common/src/plugin_manifest.ts");

test("initialized projects create npm plugin workspaces outside the runtime source tree", async (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "elementspanel-workspace-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));

  await initialize({ directory: project, mode: "full", install: false });
  await setupWorkspace(project, ["example", "--both", "--no-install"]);

  const root = JSON.parse(fs.readFileSync(path.join(project, "package.json"), "utf8"));
  const plugin = JSON.parse(
    fs.readFileSync(path.join(project, "external/example/package.json"), "utf8")
  );
  assert.deepEqual(root.workspaces, ["external/*"]);
  assert.equal(root.dependencies["epanel-plugin-example"], "file:external/example");
  assert.equal(root.elementspanel.plugins.example, "epanel-plugin-example");
  assert.equal(
    plugin.peerDependencies["@elementspanel/panel"],
    root.dependencies["@elementspanel/panel"]
  );
  assert.equal(
    plugin.peerDependencies["@elementspanel/daemon"],
    root.dependencies["@elementspanel/daemon"]
  );
  assert.equal(plugin.elementspanel.panel.directory, "panel");
  assert.equal(plugin.elementspanel.daemon.directory, "daemon");
  assert.equal(plugin.description, "ElementsPanel example plugin");
  assert.deepEqual(plugin.elementspanel.panel.frontendInject, ["console", "i18n"]);
  for (const side of ["panel", "daemon"]) {
    const directory = path.join(project, "external/example", side);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, "plugin.json"))), {
      id: "example",
      version: "0.1.0",
      dual: true,
      backend: "backend/index.cjs",
      ...(side === "panel" ? { frontend: "frontend/index.js" } : {})
    });
    const metadata = readPluginManifest(directory);
    assert.equal(metadata.description, plugin.description);
    assert.deepEqual(metadata.frontendInject, side === "panel" ? ["console", "i18n"] : undefined);
  }
  assert.ok(fs.existsSync(path.join(project, "external/example/panel/src/frontend.ts")));
  assert.ok(fs.existsSync(path.join(project, "external/example/daemon/src/backend/index.ts")));
  assert.equal(
    fs.existsSync(path.join(project, "external/example/panel/backend/index.cjs")),
    false
  );
});
