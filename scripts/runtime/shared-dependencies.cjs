const path = require("node:path");
const { createRequire } = require("node:module");

// Kept in step with webpack-cordis-externals.cjs. These must resolve to the
// runtime's actual Cordis dependency graph, including nested installations.
const sharedModules = [
  "cordis",
  "@cordisjs/core",
  "@cordisjs/logger",
  "@cordisjs/timer",
  "@cordisjs/schema",
  "cosmokit",
  "schemastery",
  "reggol"
];

function createSharedResolver(packageRoot) {
  const host = createRequire(path.join(packageRoot, "package.json"));
  let cordis;
  let schema;
  return (specifier) => {
    const name = specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2).join("/")
      : specifier.split("/")[0];
    if (name === "cordis") return host.resolve(specifier);
    cordis ||= createRequire(host.resolve("cordis"));
    if (name === "schemastery") {
      schema ||= createRequire(cordis.resolve("@cordisjs/schema"));
      return schema.resolve(specifier);
    }
    return cordis.resolve(specifier);
  };
}

module.exports = { sharedModules, createSharedResolver };
