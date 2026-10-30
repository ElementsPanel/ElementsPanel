const fs = require("node:fs");
const path = require("node:path");
const { repository, coreDirectory } = require("./workspace-layout.cjs");
const { installPluginResolution } = require("./runtime/plugin-resolution.cjs");

const side = process.argv[2];
if (!["panel", "daemon"].includes(side)) throw new Error("Expected panel or daemon.");
const packageRoot = coreDirectory(side);
const workRoot = path.join(repository, side);
// Existing development data, logs and native tools stay in their original locations.
fs.mkdirSync(workRoot, { recursive: true });
process.env.EPANEL_SOURCE_ROOT = packageRoot;
process.env.EPANEL_PROJECT_ROOT = repository;
process.chdir(workRoot);
installPluginResolution(packageRoot, workRoot);
require(path.join(packageRoot, "production/app.js"));
