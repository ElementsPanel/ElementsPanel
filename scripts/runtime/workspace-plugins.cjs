const fs = require("node:fs");
const path = require("node:path");

function within(root, filename) {
  const relative = path.relative(root, filename);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function sourceEntry(directory, configured, candidates) {
  const entries = configured === undefined ? candidates : [configured];
  for (const entry of entries) {
    if (typeof entry !== "string") continue;
    const filename = path.resolve(directory, entry);
    if (within(directory, filename) && fs.existsSync(filename) && fs.statSync(filename).isFile())
      return path.relative(directory, filename).split(path.sep).join("/");
  }
}

/** Source entries are an in-memory override; plugin.json keeps its production entries. */
function resolveWorkspacePlugins(project, side, reserved = {}) {
  const external = path.join(project, "external");
  if (!fs.existsSync(external)) return [];
  const projectFile = path.join(project, "package.json");
  if (!fs.existsSync(projectFile)) return [];
  const metadata = JSON.parse(fs.readFileSync(projectFile, "utf8"));
  const workspaces = Array.isArray(metadata.workspaces)
    ? metadata.workspaces
    : metadata.workspaces?.packages || [];
  const records = [];
  for (const item of fs.readdirSync(external, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    if (!workspaces.includes("external/*") && !workspaces.includes(`external/${item.name}`))
      continue;
    const packageRoot = path.join(external, item.name);
    const filename = path.join(packageRoot, "package.json");
    if (!fs.existsSync(filename)) continue;
    const metadata = JSON.parse(fs.readFileSync(filename, "utf8"));
    const id = metadata.elementspanel?.id;
    const definition = metadata.elementspanel?.[side];
    if (!definition || Object.hasOwn(reserved, id)) continue;
    if (
      !/^[a-z][a-z0-9_-]{1,63}$/.test(id) ||
      !/^(?:@[a-z0-9_.-]+\/)?epanel-plugin-[a-z0-9_.-]+$/.test(metadata.name) ||
      typeof metadata.version !== "string" ||
      !metadata.version.trim() ||
      typeof definition.directory !== "string" ||
      !/^[a-z][a-z0-9_-]{1,63}$/.test(definition.folder || id)
    )
      throw new Error(`Invalid plugin workspace metadata: ${filename}`);
    const directory = path.resolve(packageRoot, definition.directory);
    if (directory === packageRoot || !within(packageRoot, directory))
      throw new Error(`Plugin workspace directory escapes its package: ${filename}`);
    const backend = sourceEntry(directory, definition.development?.backend, [
      "src/backend/index.ts",
      "src/backend/index.js",
      "src/backend/index.mts",
      "src/backend/index.cts",
      "src/backend/index.mjs",
      "src/backend/index.cjs",
      "src/index.ts",
      "src/index.mts",
      "src/index.cts",
      "src/index.js"
    ]);
    const frontend =
      side === "panel"
        ? sourceEntry(directory, definition.development?.frontend, [
            "src/frontend.ts",
            "src/frontend.tsx",
            "src/frontend.jsx",
            "src/frontend.js",
            "src/index.ts",
            "src/index.tsx",
            "src/index.jsx",
            "src/index.js"
          ])
        : undefined;
    if (!backend && !frontend) continue;
    records.push({
      id,
      name: metadata.name,
      version: metadata.version,
      source: "project",
      defaultEnabled: true,
      packageRoot,
      directory,
      folder: definition.folder || id,
      dependencies: Object.keys(metadata.dependencies || {}),
      developmentEntries: {
        ...(backend ? { backend } : {}),
        ...(frontend ? { frontend } : {})
      }
    });
  }
  return records;
}

module.exports = { resolveWorkspacePlugins };
