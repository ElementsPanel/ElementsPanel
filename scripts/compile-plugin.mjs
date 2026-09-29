#!/usr/bin/env node

// Compile an external/<name> workspace into a publishable plugin package.
// Backends use webpack and ts-loader with the host externals; frontends use
// Vite library mode with the host aliases. Output layout:
//   <out>/<side>/plugin.json
//   <out>/<side>/README.md          (optional user readme)
//   <out>/<side>/icon.png           (optional workspace icon)
//   <out>/<side>/backend/index.cjs
//   <out>/<side>/frontend/index.js  (panel only)
// Progress goes to stderr; the final JSON result goes to stdout.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire, isBuiltin } from "node:module";
import { pluginSdkModules } from "../frontend/plugin-sdk.config.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const PANEL_ROOT = path.join(PROJECT_ROOT, "panel");
const DAEMON_ROOT = path.join(PROJECT_ROOT, "daemon");
const FRONTEND_ROOT = path.join(PROJECT_ROOT, "frontend");
const OUTPUT_MARKER = ".elements-plugin-build.json";

const FRONTEND_ENTRIES = [
  "src/frontend.ts",
  "src/frontend.tsx",
  "src/frontend.js",
  "src/frontend.jsx"
];

/** The plugin's own face: a square PNG at the workspace root, packaged as-is. */
const ICON_FILE = "icon.png";
const MAX_ICON_BYTES = 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Shared instances are resolved by the host SDK import map.
const FRONTEND_EXTERNALS = pluginSdkModules;

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    result[item.slice(2)] = argv[index + 1];
    index++;
  }
  return result;
}

function log(message) {
  process.stderr.write(`${message}\n`);
}

function assertRegularFile(filename, label) {
  let stat;
  try {
    stat = fs.lstatSync(filename);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file: ${filename}`);
  }
  return true;
}

function validateIcon(filename) {
  if (!assertRegularFile(filename, "icon.png")) return false;
  const stat = fs.statSync(filename);
  if (stat.size > MAX_ICON_BYTES) {
    throw new Error(`icon.png must be no larger than ${MAX_ICON_BYTES} bytes.`);
  }
  const signature = Buffer.alloc(PNG_SIGNATURE.length);
  const file = fs.openSync(filename, "r");
  try {
    fs.readSync(file, signature, 0, signature.length, 0);
  } finally {
    fs.closeSync(file);
  }
  if (!signature.equals(PNG_SIGNATURE)) throw new Error("icon.png must be a PNG image.");
  return true;
}

function isEsmPackage(modulesDir, moduleName) {
  try {
    const parts = moduleName.split("/");
    const pkgName = moduleName.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
    const pkgJsonPath = path.join(modulesDir, pkgName, "package.json");
    return JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")).type === "module";
  } catch {
    return false;
  }
}

/** Compile TypeScript to backend/index.cjs. Explicit modulesDir settings keep
 * host dependencies such as koa external to the package.
 */
export function createBackendConfig(side, workspace, outSideDir) {
  const sideRoot = side === "panel" ? PANEL_ROOT : DAEMON_ROOT;
  const entry = path.join(workspace, side, "src", "backend", "index.ts");
  if (!fs.existsSync(entry)) return false;

  const sideRequire = createRequire(path.join(sideRoot, "package.json"));
  const nodeExternals = sideRequire("webpack-node-externals");
  const cordisExternals = sideRequire(
    path.join(PROJECT_ROOT, "scripts", "webpack-cordis-externals.cjs")
  );
  const modulesDir = path.join(sideRoot, "node_modules");
  const hostModuleDirs = [modulesDir, path.join(PROJECT_ROOT, "node_modules")];
  const hostExternals = nodeExternals({
    modulesDir,
    additionalModuleDirs: hostModuleDirs.slice(1),
    allowlist: ["mcsmanager-common", (name) => isEsmPackage(modulesDir, name)]
  });

  // A dependency may share a name with a host package but resolve to a private
  // version in the plugin (including a nested transitive dependency). Only
  // externalize it when resolution actually selects the host's own package.
  const externalizeHostPackage = (data, callback) => {
    // Core modules have no package file to resolve (even if an npm package with
    // the same name is installed). Leave them to Node before resolving packages.
    if (isBuiltin(data.request)) return callback(null, `commonjs ${data.request}`);
    hostExternals(data, (error, external) => {
      if (error || !external) return callback(error, external);
      const name = data.request.startsWith("@")
        ? data.request.split("/").slice(0, 2).join("/")
        : data.request.split("/")[0];
      data.getResolve({ symlinks: false })(data.context, data.request, (error, resolved) => {
        if (error) return callback(error);
        const hostPackage =
          typeof resolved === "string" &&
          hostModuleDirs.some((directory) => {
            const relative = path.relative(path.join(directory, name), resolved);
            return (
              relative === "" ||
              (!relative.startsWith(`..${path.sep}`) &&
                relative !== ".." &&
                !path.isAbsolute(relative))
            );
          });
        callback(null, hostPackage ? external : undefined);
      });
    });
  };

  return {
    mode: "production",
    context: sideRoot,
    entry,
    target: "node",
    devtool: false,
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: {
            loader: "ts-loader",
            // Set the host tsconfig explicitly instead of searching upward from external/.
            options: {
              configFile: path.join(sideRoot, "tsconfig.json"),
              resolveModuleName(name, file, options, host, resolve) {
                if (Object.hasOwn(cordisExternals, name) || name === "mcsmanager-common")
                  return resolve(name, path.join(sideRoot, "package.json"), options, host);
                // Host tsconfig paths (including exact @types overrides) must
                // not override private npm types. Host aliases remain a fallback.
                const local = resolve(
                  name,
                  file,
                  { ...options, paths: undefined, baseUrl: undefined },
                  host
                );
                return local.resolvedModule ? local : resolve(name, file, options, host);
              }
            }
          }
        }
      ]
    },
    resolve: {
      extensions: [".ts", ".js"],
      modules: ["node_modules", ...hostModuleDirs],
      alias: {
        "mcsmanager-common": path.join(PROJECT_ROOT, "common", "src", "index.ts")
      }
    },
    resolveLoader: {
      modules: [modulesDir, "node_modules"]
    },
    externalsPresets: { node: true },
    externals: [cordisExternals, externalizeHostPackage],
    optimization: { minimize: false },
    output: {
      filename: "backend/index.cjs",
      path: outSideDir,
      library: { type: "commonjs2" }
    }
  };
}

async function compileBackend(side, workspace, outSideDir) {
  const config = createBackendConfig(side, workspace, outSideDir);
  if (!config) return false;
  log(`[compile] ${side}: Compiling backend ${path.relative(PROJECT_ROOT, config.entry)}`);
  const sideRoot = side === "panel" ? PANEL_ROOT : DAEMON_ROOT;
  const webpack = createRequire(path.join(sideRoot, "package.json"))("webpack");
  const stats = await new Promise((resolve, reject) => {
    webpack(config).run((error, result) => (error ? reject(error) : resolve(result)));
  });

  if (stats.hasErrors()) {
    throw new Error(stats.toString({ all: false, errors: true }));
  }
  return true;
}

function resolveFromFrontend(specifier) {
  const frontendRequire = createRequire(path.join(FRONTEND_ROOT, "package.json"));
  return frontendRequire.resolve(specifier);
}

/** Generate frontend configuration under the host frontend workspace so Vite
 * resolves plugins and dependencies through the same paths as the host build.
 */
export function createFrontendConfigSource(workspace, outSideDir) {
  const sourceDir = path.join(workspace, "panel");
  const entry = FRONTEND_ENTRIES.map((relative) => path.join(sourceDir, relative)).find(
    (candidate) => fs.existsSync(candidate)
  );
  if (!entry) return null;

  const outFrontendDir = path.join(outSideDir, "frontend");
  const viteDir = path.dirname(resolveFromFrontend("vite/package.json"));
  const viteEntry = path.join(viteDir, "dist", "node", "index.js");
  const configPath = path.join(FRONTEND_ROOT, ".workspace-plugin-build.config.mjs");

  // SDK instances belong to the host. Ordinary npm dependencies belong to the
  // importing plugin, with frontend/node_modules used only as a fallback.
  const frontendDedupe = FRONTEND_EXTERNALS.filter((item) => typeof item === "string");

  // Preserve the regex literal in generated source; JSON.stringify would quote it.
  const externalSource = `[${FRONTEND_EXTERNALS.map((item) =>
    item instanceof RegExp ? item.toString() : JSON.stringify(item)
  ).join(", ")}]`;

  const configSource = `import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { frontendDependencyFallback } from "./plugin-dependencies.config.mjs";

export default defineConfig({
  root: ${JSON.stringify(FRONTEND_ROOT)},
  // Without this Vite copies the panel's own frontend/public (favicon, logo)
  // into every plugin package, where it does not belong.
  publicDir: false,
  logLevel: "warn",
  plugins: [vue(), frontendDependencyFallback(${JSON.stringify(FRONTEND_ROOT)}), {
    name: "elements-plugin-sdk-boundary",
    enforce: "pre",
    resolveId(source) {
      if (["@/plugin", "@/plugin/context", "@elements-panel/sdk"].includes(source) ||
          source.replaceAll("\\\\", "/").includes("/frontend/src/plugin/")) {
        return { id: "@elements-panel/sdk", external: true };
      }
    }
  }],
  resolve: {
    dedupe: ${JSON.stringify(frontendDedupe)},
    alias: {
      "vuetify/styles": ${JSON.stringify(resolveFromFrontend("vuetify/styles"))},
      "vuetify/components": ${JSON.stringify(resolveFromFrontend("vuetify/components"))},
      "vuetify/iconsets/mdi": ${JSON.stringify(resolveFromFrontend("vuetify/iconsets/mdi"))},
      vuetify: ${JSON.stringify(resolveFromFrontend("vuetify"))},
      "@mdi/font/css/materialdesignicons.css": ${JSON.stringify(
        resolveFromFrontend("@mdi/font/css/materialdesignicons.css")
      )},
      "@/plugin": ${JSON.stringify(path.join(FRONTEND_ROOT, "src", "plugin"))},
      "@/lang": ${JSON.stringify(
        path.join(PROJECT_ROOT, "panel", "plugins", "i18n", "src", "lang")
      )},
      "@": ${JSON.stringify(path.join(PROJECT_ROOT, "panel", "plugins", "console", "src"))},
      "@console": ${JSON.stringify(path.join(PROJECT_ROOT, "panel", "plugins", "console", "src"))},
      "@instance": ${JSON.stringify(path.join(PROJECT_ROOT, "panel", "plugins", "instance", "src"))}
    }
  },
  build: {
    outDir: ${JSON.stringify(outFrontendDir)},
    emptyOutDir: false,
    cssCodeSplit: false,
    minify: false,
    sourcemap: false,
    lib: {
      entry: ${JSON.stringify(entry)},
      formats: ["es"],
      fileName: () => "index.js"
    },
    rollupOptions: {
      external: ${externalSource}
    }
  }
});
`;

  return { configSource, configPath, viteEntry, entry, outFrontendDir };
}

async function compileFrontend(workspace, outSideDir) {
  const config = createFrontendConfigSource(workspace, outSideDir);
  if (!config) return null;
  const { configSource, configPath, viteEntry, entry, outFrontendDir } = config;
  log(`[compile] panel: Compiling frontend ${path.relative(PROJECT_ROOT, entry)}`);
  fs.writeFileSync(configPath, configSource, "utf8");
  try {
    const { build } = await import(pathToFileURL(viteEntry).href);
    await build({ configFile: configPath, root: FRONTEND_ROOT, logLevel: "warn" });
  } finally {
    fs.rmSync(configPath, { force: true });
  }

  return {
    entry: "frontend/index.js",
    styles: fs.existsSync(path.join(outFrontendDir, "style.css")) ? ["frontend/style.css"] : []
  };
}

/** Package the optional user-facing readme from <side>/README.md.
 * The workspace root readme is for developers and is not published.
 */
function copyReadme(workspace, side, outSideDir) {
  const source = path.join(workspace, side, "README.md");
  if (!assertRegularFile(source, `${side}/README.md`)) return null;

  fs.copyFileSync(source, path.join(outSideDir, "README.md"));
  log(`[compile] ${side}: Including readme ${path.relative(PROJECT_ROOT, source)}`);
  return source;
}

/** Package the optional workspace icon on the metadata-owning side:
 * panel when present, otherwise daemon. The market supplies a fallback icon.
 */
function copyIcon(workspace, side, outSideDir) {
  const source = path.join(workspace, ICON_FILE);
  if (!validateIcon(source)) return false;

  const preferred = fs.existsSync(path.join(workspace, "panel", "plugin.json"))
    ? "panel"
    : "daemon";
  if (side !== preferred) return false;

  fs.copyFileSync(source, path.join(outSideDir, ICON_FILE));
  log(`[compile] ${side}: Including icon ${path.relative(PROJECT_ROOT, source)}`);
  return true;
}

/** Point the output manifest at compiled files, matching the packaging scripts. */
function writeManifest(side, workspace, outSideDir, backend, frontend) {
  const manifestPath = path.join(workspace, side, "plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  manifest.elements = { api: 1, ...(frontend ? { sdk: 1 } : {}) };
  if (backend) manifest.backend = "backend/index.cjs";
  else delete manifest.backend;
  if (frontend) {
    manifest.frontend = frontend.entry;
    manifest.styles = frontend.styles;
  } else {
    delete manifest.frontend;
    delete manifest.styles;
  }
  delete manifest.ui;
  delete manifest.daemon;
  delete manifest.panel;
  delete manifest.main;
  delete manifest.entry;

  fs.writeFileSync(
    path.join(outSideDir, "plugin.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  return manifest;
}

/**
 * Drops source maps from the package. `scripts/package-panel-plugins.mjs` does the
 * same to every built-in plugin: maps are build artifacts, they are not part of
 * what gets published, and the market only accepts the extensions a real package
 * needs.
 */
function stripSourceMaps(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, item.name);
    if (item.isDirectory()) {
      stripSourceMaps(target);
      continue;
    }
    if (item.name.endsWith(".map")) {
      fs.rmSync(target, { force: true });
      continue;
    }
    if (/\.[cm]?js$/.test(item.name)) {
      const source = fs.readFileSync(target, "utf8");
      fs.writeFileSync(target, source.replace(/\n?\/\/[#@] sourceMappingURL=.*$/gm, ""), "utf8");
    }
  }
}

function listFiles(root) {
  const files = [];
  const walk = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, item.name);
      if (directory === root && item.name === OUTPUT_MARKER) continue;
      if (item.isDirectory()) {
        walk(target);
        continue;
      }
      files.push({
        path: path.relative(root, target).split(path.sep).join("/"),
        size: fs.statSync(target).size
      });
    }
  };
  walk(root);
  return files;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.workspace || !args.out) {
    throw new Error("Usage: node scripts/compile-plugin.mjs --workspace <dir> --out <dir>");
  }

  const workspace = path.resolve(args.workspace);
  const outDir = path.resolve(args.out);
  if (!outDir.startsWith(PROJECT_ROOT + path.sep)) {
    throw new Error(`Output directory must be inside the project: ${outDir}`);
  }
  if (!fs.existsSync(workspace)) {
    throw new Error(`Workspace does not exist: ${workspace}`);
  }

  // Validate source assets before clearing an existing build. A malformed or
  // linked asset must never destroy the last usable package.
  validateIcon(path.join(workspace, ICON_FILE));
  for (const side of ["panel", "daemon"]) {
    const sourceDir = path.join(workspace, side);
    if (!fs.existsSync(path.join(sourceDir, "plugin.json"))) continue;
    assertRegularFile(path.join(sourceDir, "plugin.json"), `${side}/plugin.json`);
    assertRegularFile(path.join(sourceDir, "README.md"), `${side}/README.md`);
  }

  const realWorkspace = fs.realpathSync(workspace);
  const realOutput = resolveRealPath(outDir);
  const outputRelative = path.relative(fs.realpathSync(PROJECT_ROOT), realOutput);
  if (
    !outputRelative ||
    outputRelative === ".." ||
    outputRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(outputRelative)
  ) {
    throw new Error("Output directory must not escape the project through symlinks.");
  }
  const sourceRelative = path.relative(realOutput, realWorkspace);
  if (
    !sourceRelative ||
    (!sourceRelative.startsWith(`..${path.sep}`) &&
      sourceRelative !== ".." &&
      !path.isAbsolute(sourceRelative))
  ) {
    throw new Error("Output directory must not contain the plugin source workspace.");
  }
  const markerPath = path.join(outDir, OUTPUT_MARKER);
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) {
    let owner;
    try {
      owner = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    } catch {
      throw new Error(`Refusing to clear a directory without a plugin build marker: ${outDir}`);
    }
    if (owner.workspace !== realWorkspace) {
      throw new Error(`Output directory belongs to another plugin workspace: ${outDir}`);
    }
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify({ workspace: realWorkspace }), "utf8");

  const sides = [];
  for (const side of ["panel", "daemon"]) {
    const sourceDir = path.join(workspace, side);
    if (!fs.existsSync(path.join(sourceDir, "plugin.json"))) continue;

    const outSideDir = path.join(outDir, side);
    fs.mkdirSync(outSideDir, { recursive: true });

    const backend = await compileBackend(side, workspace, outSideDir);
    const frontend = side === "panel" ? await compileFrontend(workspace, outSideDir) : null;
    const manifest = writeManifest(side, workspace, outSideDir, backend, frontend);
    const readme = copyReadme(workspace, side, outSideDir);
    const icon = copyIcon(workspace, side, outSideDir);

    sides.push({
      side,
      id: manifest.id,
      version: manifest.version,
      frontend: Boolean(frontend),
      readme: Boolean(readme),
      icon: Boolean(icon)
    });
  }

  if (!sides.length) throw new Error("Workspace contains no compilable plugin (missing plugin.json).");

  stripSourceMaps(outDir);
  const files = listFiles(outDir);
  log(`[compile] Done: ${files.length} files`);

  // Emit only this result on stdout so callers can parse it as JSON.
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      workspace,
      outDir,
      sides,
      files: files.map((file) => file.path),
      sizeBytes: files.reduce((total, file) => total + file.size, 0)
    })}\n`
  );
}

function resolveRealPath(target) {
  if (fs.existsSync(target)) return fs.realpathSync(target);
  const parent = path.dirname(target);
  return parent === target ? target : path.join(resolveRealPath(parent), path.basename(target));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    log(`[compile] Failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
