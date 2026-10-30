const fs = require("node:fs");
const path = require("node:path");
const { repository, coreDirectory, developmentDirectory } = require("./workspace-layout.cjs");
const { installPluginResolution } = require("./runtime/plugin-resolution.cjs");

const side = process.argv[2];
if (!["panel", "daemon"].includes(side)) throw new Error("Expected panel or daemon.");
const packageRoot = coreDirectory(side);
// Keep development data, logs and native tools together under the ignored data directory.
const workRoot = developmentDirectory(side);
fs.mkdirSync(workRoot, { recursive: true });
process.env.EPANEL_SOURCE_ROOT = packageRoot;
process.env.EPANEL_PROJECT_ROOT = repository;
process.chdir(workRoot);
installPluginResolution(packageRoot, workRoot);
require(path.join(packageRoot, "production/app.js"));
