const path = require("path");
const nodeExternals = require("webpack-node-externals");
const cordisExternals = require("../../scripts/webpack-cordis-externals.cjs");

/**
 * @type {import('webpack').Configuration}
 */
module.exports = {
  mode: "production",
  entry: "./src/app.ts",
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
    // Development and npm installations use the same compiled host. Keep
    // environment-dependent application behavior configurable at runtime.
    nodeEnv: false,
    chunkIds: "named",
    minimize: false,
    mangleExports: false,
    moduleIds: "named"
  },
  externalsPresets: { node: true },
  externals: [
    // One cordis instance, shared with every plugin bundle. See the module.
    cordisExternals,
    nodeExternals({
      allowlist: ["mcsmanager-common"]
    })
  ],
  output: {
    filename: "app.js",
    path: path.resolve(__dirname, "production")
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      "mcsmanager-common": path.resolve(__dirname, "../common/src/index.ts")
    }
  }
};
