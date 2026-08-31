const path = require("path");
const fs = require("fs");
const nodeExternals = require("webpack-node-externals");
const cordisExternals = require("../scripts/webpack-cordis-externals.cjs");

const pluginsRoot = path.resolve(__dirname, "plugins");

/**
 * Daemon plugins may ship a TypeScript backend at `src/backend/index.ts`. It is
 * compiled here into `<plugin>/backend/index.cjs`, which is what plugin.json
 * points at. Plugins whose entry is already hand-written JavaScript are left
 * alone.
 */
function discoverPluginEntries() {
  const entries = {};
  if (!fs.existsSync(pluginsRoot)) return entries;
  for (const item of fs.readdirSync(pluginsRoot, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const entry = path.join(pluginsRoot, item.name, "src", "backend", "index.ts");
    if (fs.existsSync(entry)) entries[item.name] = entry;
  }
  return entries;
}

/**
 * @type {import('webpack').Configuration}
 */
module.exports = {
  mode: "production",
  entry: discoverPluginEntries(),
  module: {
    rules: [
      {
        test: /\.ts/,
        use: "ts-loader",
        exclude: /node_modules/
      }
    ]
  },
  target: "node",
  devtool: "source-map",
  optimization: {
    chunkIds: "named",
    minimize: false,
    mangleExports: false,
    moduleIds: "named"
  },
  externalsPresets: { node: true },
  // Everything the daemon already depends on at runtime stays a require(), so
  // the plugin shares the daemon's module instances instead of bundling copies.
  // `mcsmanager-common` is the exception: it is a local `file:../common`
  // dependency that is not installed into the production bundle, so it has to
  // be compiled in — the same allowlist the main config uses.
  externals: [
    // One cordis instance, shared with every plugin bundle. See the module.
    cordisExternals,
    nodeExternals({
      allowlist: ["mcsmanager-common"]
    })
  ],
  output: {
    filename: "[name]/backend/index.cjs",
    path: pluginsRoot,
    library: { type: "commonjs2" }
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      "@languages": path.resolve(__dirname, "../languages"),
      "mcsmanager-common": path.resolve(__dirname, "../common/src/index.ts")
    }
  }
};
