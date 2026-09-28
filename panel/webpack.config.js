const path = require("path");
const fs = require("fs");
const nodeExternals = require("webpack-node-externals");
const cordisExternals = require("../scripts/webpack-cordis-externals.cjs");

/**
 * Auto-detect ESM-only packages and bundle them
 * instead of externalizing with require()
 */
function isEsmPackage(moduleName) {
  try {
    const parts = moduleName.split("/");
    const pkgName = moduleName.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
    const pkgJsonPath = path.join(__dirname, "node_modules", pkgName, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    return pkg.type === "module";
  } catch {
    return false;
  }
}

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
    // Do not substitute `process.env.NODE_ENV` at build time. The plugin loader
    // reads it at runtime to decide whether to scan `external/` and register
    // ts-node; webpack's production default would bake "production" in and
    // dead-code-eliminate both branches, leaving every external plugin backend
    // invisible however the process was started.
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
      allowlist: ["mcsmanager-common", isEsmPackage]
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
