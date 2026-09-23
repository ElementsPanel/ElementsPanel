#!/usr/bin/env node

// 把一个 external/<name> 插件工作区编译成可发布的插件包。
//
// 编译用的就是项目自己的两个编译器：后端走 webpack + ts-loader（与
// panel/webpack.plugins.config.js 同一套 externals），前端走 vite 的 lib 模式
// （与 frontend/vite.config.ts 同一套别名）。产出目录的布局与
// scripts/package-panel-plugins.mjs 一致：
//
//   <out>/<side>/plugin.json
//   <out>/<side>/README.md               （工作区里带自述时）
//   <out>/<side>/icon.png                （工作区根目录带图标时）
//   <out>/<side>/backend/index.cjs
//   <out>/<side>/frontend/index.js       （仅 panel 侧有前端时）
//
// 进度日志写 stderr，最后一行结果 JSON 写 stdout，供调用方解析。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
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

/**
 * 后端：TypeScript → `<out>/<side>/backend/index.cjs`。
 * `modulesDir` 必须显式给出，否则 webpack-node-externals 找不到依赖，
 * 会把 koa 之类的宿主依赖一起打进产物。
 */
async function compileBackend(side, workspace, outSideDir) {
  const sideRoot = side === "panel" ? PANEL_ROOT : DAEMON_ROOT;
  const entry = path.join(workspace, side, "src", "backend", "index.ts");
  if (!fs.existsSync(entry)) return false;

  log(`[compile] ${side}: 编译后端 ${path.relative(PROJECT_ROOT, entry)}`);

  const sideRequire = createRequire(path.join(sideRoot, "package.json"));
  const webpack = sideRequire("webpack");
  const nodeExternals = sideRequire("webpack-node-externals");
  const cordisExternals = sideRequire(
    path.join(PROJECT_ROOT, "scripts", "webpack-cordis-externals.cjs")
  );
  const modulesDir = path.join(sideRoot, "node_modules");

  const stats = await new Promise((resolve, reject) => {
    webpack({
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
              // 不指定时 ts-loader 会从 external/ 往上找 tsconfig，找不到就用默认配置
              options: { configFile: path.join(sideRoot, "tsconfig.json") }
            }
          }
        ]
      },
      resolve: {
        extensions: [".ts", ".js"],
        modules: [modulesDir, "node_modules"],
        alias: {
          "mcsmanager-common": path.join(PROJECT_ROOT, "common", "src", "index.ts")
        }
      },
      resolveLoader: {
        modules: [modulesDir, "node_modules"]
      },
      externalsPresets: { node: true },
      externals: [
        cordisExternals,
        nodeExternals({
          modulesDir,
          additionalModuleDirs: [path.join(PROJECT_ROOT, "node_modules")],
          allowlist: ["mcsmanager-common", (name) => isEsmPackage(modulesDir, name)]
        })
      ],
      optimization: { minimize: false },
      output: {
        filename: "backend/index.cjs",
        path: outSideDir,
        library: { type: "commonjs2" }
      }
    }).run((error, result) => (error ? reject(error) : resolve(result)));
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

/**
 * 前端：`src/frontend.ts` → `<out>/panel/frontend/index.js`。
 *
 * 配置写成 frontend/ 下的临时文件再交给 vite 加载，这样 `@vitejs/plugin-vue`
 * 之类的插件由 vite 自己按 frontend 工作区的依赖解析，跟项目自己的
 * vite.config.ts 走同一条解析路径。
 */
async function compileFrontend(workspace, outSideDir) {
  const sourceDir = path.join(workspace, "panel");
  const entry = FRONTEND_ENTRIES.map((relative) => path.join(sourceDir, relative)).find(
    (candidate) => fs.existsSync(candidate)
  );
  if (!entry) return null;

  log(`[compile] panel: 编译前端 ${path.relative(PROJECT_ROOT, entry)}`);

  const outFrontendDir = path.join(outSideDir, "frontend");
  const viteDir = path.dirname(resolveFromFrontend("vite/package.json"));
  const viteEntry = path.join(viteDir, "dist", "node", "index.js");
  const configPath = path.join(FRONTEND_ROOT, ".workspace-plugin-build.config.mjs");

  // 正则要原样写进配置源码，JSON.stringify 会把它变成字符串字面量
  const externalSource = `[${FRONTEND_EXTERNALS.map((item) =>
    item instanceof RegExp ? item.toString() : JSON.stringify(item)
  ).join(", ")}]`;

  const configSource = `import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  root: ${JSON.stringify(FRONTEND_ROOT)},
  // Without this Vite copies the panel's own frontend/public (favicon, logo)
  // into every plugin package, where it does not belong.
  publicDir: false,
  logLevel: "warn",
  plugins: [vue(), {
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
    dedupe: ["vue", "vue-router", "pinia", "vue-i18n", "cordis", "@vueuse/core"],
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

/**
 * 自述：工作区里 `<side>/README.md`。它是插件对使用者说的话，会随包一起发布；工作区根
 * 目录那份 README.md 是写给开发者的，不在这里取用。
 *
 * 自述是可选的，没有就不带——详情页的「自述」页签据此显示，缺了只是空着。
 */
function copyReadme(workspace, side, outSideDir) {
  const source = path.join(workspace, side, "README.md");
  if (!assertRegularFile(source, `${side}/README.md`)) return null;

  fs.copyFileSync(source, path.join(outSideDir, "README.md"));
  log(`[compile] ${side}: 带上自述 ${path.relative(PROJECT_ROOT, source)}`);
  return source;
}

/**
 * 图标：工作区根目录的 `icon.png`。它会随包发布，做插件在插件市场里的门面——卡片和详情页
 * 都显示它。
 *
 * 图标是插件级的（一个插件一个图标），所以只放进描述整包的那一端：有 panel 就 panel，
 * 否则 daemon，与 plugin.json / README.md 的取用顺序一致。两端各存一份同样的图没有必要。
 *
 * 图标是可选的，没有就不带——页面据「包里有没有这个文件」回退到默认图标。
 */
function copyIcon(workspace, side, outSideDir) {
  const source = path.join(workspace, ICON_FILE);
  if (!validateIcon(source)) return false;

  const preferred = fs.existsSync(path.join(workspace, "panel", "plugin.json"))
    ? "panel"
    : "daemon";
  if (side !== preferred) return false;

  fs.copyFileSync(source, path.join(outSideDir, ICON_FILE));
  log(`[compile] ${side}: 带上图标 ${path.relative(PROJECT_ROOT, source)}`);
  return true;
}

/** 产出的 plugin.json 指向编译后的文件，和打包脚本的产出保持一致。 */
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
    throw new Error(`输出目录必须位于项目之内：${outDir}`);
  }
  if (!fs.existsSync(workspace)) {
    throw new Error(`工作区不存在：${workspace}`);
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
    throw new Error("输出目录不能通过符号链接离开项目。");
  }
  const sourceRelative = path.relative(realOutput, realWorkspace);
  if (
    !sourceRelative ||
    (!sourceRelative.startsWith(`..${path.sep}`) &&
      sourceRelative !== ".." &&
      !path.isAbsolute(sourceRelative))
  ) {
    throw new Error("输出目录不能包含插件源代码工作区。");
  }
  const markerPath = path.join(outDir, OUTPUT_MARKER);
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) {
    let owner;
    try {
      owner = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    } catch {
      throw new Error(`拒绝清理非插件构建目录：${outDir}`);
    }
    if (owner.workspace !== realWorkspace) {
      throw new Error(`输出目录属于其他插件工作区：${outDir}`);
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

  if (!sides.length) throw new Error("工作区里没有可编译的插件（缺少 plugin.json）");

  stripSourceMaps(outDir);
  const files = listFiles(outDir);
  log(`[compile] 完成，共 ${files.length} 个文件`);

  // stdout 只写这一行结果，调用方直接 JSON.parse
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

main().catch((error) => {
  log(`[compile] 失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
