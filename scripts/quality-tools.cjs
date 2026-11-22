const path = require("node:path");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const frontend = path.join(root, "core/frontend");
const frontendRequire = createRequire(path.join(frontend, "package.json"));

module.exports = { root, frontend, frontendRequire };
