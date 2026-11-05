import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { pluginSdkModules } from "./plugin-sdk.config.mjs";
import { frontendDependencyFallback } from "./plugin-dependencies.config.mjs";
import layout from "../../scripts/workspace-layout.cjs";
import { readPluginMetadata } from "../../scripts/plugin-metadata.mjs";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(frontendRoot, "../..");
const require = createRequire(import.meta.url);
const normalize = (filename) => filename.split(path.sep).join("/");

export function frontendAliases() {
  return {
    "@elements-panel/sdk": path.join(frontendRoot, "src/plugin/sdk.ts"),
    "@/plugin": path.join(frontendRoot, "src/plugin"),
    "@/lang": path.join(repository, "plugins/i18n/panel/src/lang"),
    "@console": path.join(repository, "plugins/console/panel/src"),
    "@instance": path.join(repository, "plugins/instance/panel/src"),
    "@": path.join(repository, "plugins/console/panel/src"),
    "@mdi/font/css/materialdesignicons.css": require.resolve("@mdi/font/css/materialdesignicons.css"),
    "wavesurfer.js": require.resolve("wavesurfer.js")
  };
}

/** Explicit public entry points are the only permitted imports across plugin boundaries. */
export function publicFrontendModules() {
  const modules = new Map();
  for (const plugin of layout.sourcePlugins("panel", repository)) {
    const { packageMetadata } = readPluginMetadata(plugin.directory);
    for (const [name, entry] of Object.entries(packageMetadata.elementspanel.frontendExports || {})) {
      if (name !== "." && !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(name))
        throw new Error(`Invalid public frontend module: ${packageMetadata.name}/${name}`);
      const filename = path.resolve(plugin.directory, entry);
      if (!filename.startsWith(`${plugin.directory}${path.sep}`) || !fs.statSync(filename).isFile())
        throw new Error(`Invalid public frontend entry: ${filename}`);
      const specifier = packageMetadata.name + (name === "." ? "" : `/${name}`);
      modules.set(specifier, { owner: plugin.id, name, filename });
    }
  }
  return modules;
}

export function publicFrontendImports(owner, modules = publicFrontendModules()) {
  return {
    name: "elements-public-frontend-imports",
    enforce: "pre",
    configResolved(config) {
      if (!owner && config.command === "build") owner = "@host";
    },
    resolveId(source) {
      const entry = modules.get(source);
      if (entry && owner === "@host")
        throw new Error(`The frontend host cannot import plugin module ${source} before discovery.`);
      if (entry) return !owner || owner === entry.owner
        ? entry.filename
        : { id: source, external: true };
      if (source.startsWith("@elementspanel/epanel-plugin-"))
        throw new Error(`Unknown public frontend module: ${source}`);
    },
    load(id) {
      if (!owner) return;
      const filename = normalize(id.split("?")[0]);
      if (owner !== "@host" && filename.startsWith(`${normalize(path.join(frontendRoot, "src"))}/`))
        throw new Error(`Plugin ${owner} imports private host source ${filename}. Use @elements-panel/sdk.`);
      const prefix = `${normalize(path.join(repository, "plugins"))}/`;
      if (filename.startsWith(prefix) && filename.slice(prefix.length).split("/")[0] !== owner)
        throw new Error(`Plugin ${owner} imports private source ${filename}. Use its public frontend API.`);
    }
  };
}

/** Each invocation owns a separate Rollup graph; no chunks can be shared with another package. */
export function builtinPluginConfig(plugin, outputRoot) {
  const { manifest } = readPluginMetadata(plugin.directory);
  const frontend = manifest.frontend || manifest.ui;
  if (!frontend) return null;
  const modules = publicFrontendModules();
  const owned = [...modules].filter(([, entry]) => entry.owner === plugin.id);
  const input = { index: path.resolve(plugin.directory, frontend) };
  const exports = {};
  for (const [specifier, entry] of owned) {
    const name = `exports/${entry.name === "." ? "index" : entry.name}`;
    input[name] = entry.filename;
    exports[specifier] = `frontend/${name}.js`;
  }
  return {
    configFile: false,
    root: frontendRoot,
    base: "./",
    publicDir: false,
    plugins: [
      publicFrontendImports(plugin.id, modules),
      frontendDependencyFallback(frontendRoot),
      vue(),
      vueJsx(),
      {
        name: "elements-plugin-build-manifest",
        generateBundle(_options, bundle) {
          const imports = new Set();
          for (const output of Object.values(bundle)) {
            if (output.type !== "chunk") continue;
            for (const id of [...output.imports, ...output.dynamicImports]) {
              if (!Object.hasOwn(bundle, id)) imports.add(id);
            }
          }
          this.emitFile({
            type: "asset",
            fileName: "manifest.json",
            source: JSON.stringify({
              entry: "frontend/index.js",
              styles: Object.keys(bundle).filter((name) => name.endsWith(".css")).sort(),
              exports,
              imports: [...imports].sort(),
              frontendApi: 1
            }, null, 2)
          });
        }
      }
    ],
    resolve: { alias: frontendAliases(), dedupe: pluginSdkModules },
    build: {
      outDir: path.join(outputRoot, plugin.folder),
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        input,
        preserveEntrySignatures: "strict",
        // Exact ids only: an unmapped framework subpath must never escape into a browser import.
        external: (id) => {
          if (pluginSdkModules.includes(id)) return true;
          if (id !== "vuetify/styles" && pluginSdkModules.some((name) => id.startsWith(`${name}/`)))
            throw new Error(`Unmapped shared frontend module: ${id}`);
          return false;
        },
        output: {
          format: "es",
          entryFileNames: "frontend/[name].js",
          chunkFileNames: "frontend/chunks/[name]-[hash].js",
          assetFileNames: "frontend/assets/[name]-[hash][extname]"
        }
      }
    }
  };
}
