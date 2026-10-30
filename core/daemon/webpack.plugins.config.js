const path = require("path");
const fs = require("fs");
const nodeExternals = require("webpack-node-externals");
const cordisExternals = require("../../scripts/webpack-cordis-externals.cjs");

const { sourcePlugins } = require("../../scripts/workspace-layout.cjs");
const repository = path.resolve(__dirname, "../..");

/**
 * Daemon plugins may ship a TypeScript backend at `src/backend/index.ts`. It is
 * compiled here into `<plugin>/backend/index.cjs`, which is what plugin.json
 * points at. Plugins whose entry is already hand-written JavaScript are left
 * alone.
 */
function discoverPluginEntries() {
  const entries = {};
  for (const plugin of sourcePlugins("daemon", repository)) {
    const entry = path.join(plugin.directory, "src", "backend", "index.ts");
    if (fs.existsSync(entry)) entries[plugin.id] = entry;
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
        use: {
          loader: "ts-loader",
          options: { configFile: path.join(__dirname, "tsconfig.json"), context: __dirname }
        },
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
    filename: "[name]/daemon/backend/index.cjs",
    path: path.join(repository, "plugins"),
    library: { type: "commonjs2" }
  },
  resolve: {
    modules: ["node_modules", path.join(__dirname, "node_modules")],
    extensions: [".ts", ".js"],
    alias: {
      "mcsmanager-common": path.resolve(__dirname, "../common/src/index.ts")
    }
  }
};
