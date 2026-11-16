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
  // Externalize published host dependencies to share their instances.
  // Bundle the local mcsmanager-common dependency because production does not install it separately.
  externals: [
    // One cordis instance, shared with every plugin bundle. See the module.
    cordisExternals,
    nodeExternals({
      // Match the host's published dependencies instead of its node_modules layout.
      modulesFromFile: {
        fileName: path.join(__dirname, "package.json"),
        include: ["dependencies"]
      },
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
