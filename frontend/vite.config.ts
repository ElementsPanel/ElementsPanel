import { fileURLToPath, URL } from "node:url";
import fs from "node:fs";
import path from "node:path";

import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { visualizer } from "rollup-plugin-visualizer";
import { AntDesignVueResolver } from "unplugin-vue-components/resolvers";
import Components from "unplugin-vue-components/vite";
import { defineConfig, normalizePath, type Plugin } from "vite";

const PANEL_PLUGINS_MODULE_ID = "virtual:panel-plugins";
const RESOLVED_PANEL_PLUGINS_MODULE_ID = `\0${PANEL_PLUGINS_MODULE_ID}`;
const PANEL_PLUGIN_ENTRY_PREFIX = "panel-plugin-entry:";
const PANEL_PLUGIN_BUILD_ENTRY_PREFIX = "panel-plugin-build-entry:";
const RESOLVED_PANEL_PLUGIN_BUILD_ENTRY_PREFIX = `\0${PANEL_PLUGIN_BUILD_ENTRY_PREFIX}`;
const PANEL_PLUGINS_DIRECTORY = fileURLToPath(new URL("../panel/plugins", import.meta.url));

interface DiscoveredPanelPlugin {
  metadata: Record<string, unknown>;
  directory: string;
  folder: string;
  entry: string;
  buildEntryId: string;
}

function discoverPanelPlugins(): DiscoveredPanelPlugin[] {
  const plugins: DiscoveredPanelPlugin[] = [];
  if (!fs.existsSync(PANEL_PLUGINS_DIRECTORY)) return plugins;

  const pluginIds = new Set<string>();
  for (const item of fs.readdirSync(PANEL_PLUGINS_DIRECTORY, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    const directory = path.join(PANEL_PLUGINS_DIRECTORY, item.name);
    const metadataPath = ["plugin.json", "manifest.json", "package.json"]
      .map((file) => path.join(directory, file))
      .find((file) => fs.existsSync(file));
    if (!metadataPath) continue;

    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) continue;
    } catch (error) {
      console.warn(`Failed to read panel plugin metadata: ${metadataPath}`, error);
      continue;
    }
    if (metadata.enabled === false) continue;
    const id =
      typeof metadata.id === "string"
        ? metadata.id.trim()
        : typeof metadata.name === "string"
        ? metadata.name.trim()
        : item.name;
    if (!id || pluginIds.has(id)) {
      console.warn(`Ignoring duplicate or invalid panel plugin id: ${id}`);
      continue;
    }
    pluginIds.add(id);

    const configuredEntry = [metadata.frontend, metadata.ui].find(
      (entry): entry is string => typeof entry === "string" && entry.length > 0
    );
    const candidates = configuredEntry
      ? [configuredEntry]
      : [
          "src/frontend.ts",
          "src/frontend.tsx",
          "src/frontend.js",
          "src/frontend.jsx",
          "src/index.ts",
          "src/index.tsx"
        ];
    const entry = candidates
      .map((candidate) => path.resolve(directory, candidate))
      .find(
        (candidate) =>
          candidate.startsWith(`${path.resolve(directory)}${path.sep}`) && fs.existsSync(candidate)
      );
    if (!entry) {
      if (configuredEntry) {
        console.warn(`Panel plugin "${id}" has no valid frontend entry module.`);
      }
      continue;
    }
    plugins.push({
      metadata: { ...metadata, id },
      directory,
      folder: item.name,
      entry,
      buildEntryId: `${RESOLVED_PANEL_PLUGIN_BUILD_ENTRY_PREFIX}${item.name}`
    });
  }

  plugins.sort(
    (a, b) =>
      (Number(a.metadata.priority) || 0) - (Number(b.metadata.priority) || 0) ||
      String(a.metadata.id).localeCompare(String(b.metadata.id))
  );
  return plugins;
}

function panelPlugins(initialPlugins = discoverPanelPlugins()): Plugin {
  let plugins = initialPlugins;
  let isBuild = false;
  const isPluginFile = (file: string) =>
    path
      .resolve(file)
      .toLowerCase()
      .startsWith(path.resolve(PANEL_PLUGINS_DIRECTORY).toLowerCase());

  return {
    name: "elements-panel-plugins",
    enforce: "post" as const,
    configResolved(config: any) {
      isBuild = config.command === "build";
    },
    buildStart() {
      if (!isBuild) return;
      plugins = discoverPanelPlugins();
      panelPluginBuildEntries = plugins;
      // Production loads plugins from the manifest instead of the virtual
      // module. Emit each entry explicitly so tree-shaking cannot remove its
      // standalone chunk when the DEV branch is eliminated.
      for (const plugin of plugins) {
        this.emitFile({
          type: "chunk",
          id: `${PANEL_PLUGIN_BUILD_ENTRY_PREFIX}${plugin.folder}`,
          name: `panel-plugin-${sanitizePluginFolder(plugin.folder)}`,
          preserveSignature: "exports-only"
        });
      }
    },
    resolveId(id: string) {
      if (id === PANEL_PLUGINS_MODULE_ID) return RESOLVED_PANEL_PLUGINS_MODULE_ID;
      if (id.startsWith(PANEL_PLUGIN_ENTRY_PREFIX)) {
        const index = Number(id.slice(PANEL_PLUGIN_ENTRY_PREFIX.length));
        return plugins[index]?.entry;
      }
      if (id.startsWith(PANEL_PLUGIN_BUILD_ENTRY_PREFIX)) {
        return `${RESOLVED_PANEL_PLUGIN_BUILD_ENTRY_PREFIX}${id.slice(
          PANEL_PLUGIN_BUILD_ENTRY_PREFIX.length
        )}`;
      }
    },
    configureServer(server: any) {
      server.watcher.add(PANEL_PLUGINS_DIRECTORY);
      const reload = (file: string) => {
        if (!isPluginFile(file)) return;
        const module = server.moduleGraph.getModuleById(RESOLVED_PANEL_PLUGINS_MODULE_ID);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", reload);
      server.watcher.on("change", reload);
      server.watcher.on("unlink", reload);
    },
    load(id: string) {
      if (id.startsWith(RESOLVED_PANEL_PLUGIN_BUILD_ENTRY_PREFIX)) {
        const folder = id.slice(RESOLVED_PANEL_PLUGIN_BUILD_ENTRY_PREFIX.length);
        const plugin = plugins.find((candidate) => candidate.folder === folder);
        if (!plugin) return;
        const entry = JSON.stringify(normalizePath(plugin.entry));
        return `export * from ${entry}; import pluginDefault from ${entry}; export default pluginDefault;`;
      }
      if (id !== RESOLVED_PANEL_PLUGINS_MODULE_ID) return;
      if (isBuild) return "export const panelPluginModules = [];";
      plugins = discoverPanelPlugins();
      const entries = plugins.map(
        (plugin, index) =>
          `{ metadata: ${JSON.stringify(plugin.metadata)}, directory: ${JSON.stringify(
            String(plugin.metadata.id)
          )}, assetDirectory: ${JSON.stringify(plugin.folder)}, load: () => import(${JSON.stringify(
            `${PANEL_PLUGIN_ENTRY_PREFIX}${index}`
          )}) }`
      );
      return `export const panelPluginModules = [${entries.join(",")}];`;
    },
    generateBundle(_outputOptions: any, bundle: Record<string, any>) {
      const outputChunks = Object.values(bundle).filter(
        (item: any) => item.type === "chunk"
      ) as any[];
      const pluginChunks = plugins.map((plugin) => {
        const pluginRoot = `${normalizePath(plugin.directory)}/`;
        const entryChunk = outputChunks.find(
          (item) =>
            item.name === `panel-plugin-${sanitizePluginFolder(plugin.folder)}` ||
            normalizePath(item.facadeModuleId || "") === normalizePath(plugin.buildEntryId) ||
            normalizePath(item.facadeModuleId || "") === normalizePath(plugin.entry)
        );
        const chunks = outputChunks.filter(
          (item) =>
            item === entryChunk ||
            item.moduleIds?.some((moduleId: string) =>
              normalizePath(moduleId).startsWith(pluginRoot)
            )
        );
        return { plugin, entryChunk, chunks };
      });
      const pluginChunkSet = new Set(
        pluginChunks.flatMap(({ chunks }) => chunks)
      );
      const cssOwners = new Map<string, Set<any>>();
      for (const item of Object.values(bundle) as any[]) {
        if (item.type !== "chunk") continue;
        for (const cssFile of item.viteMetadata?.importedCss || []) {
          const owners = cssOwners.get(cssFile) || new Set<any>();
          owners.add(item);
          cssOwners.set(cssFile, owners);
        }
      }
      const removableCss = new Set<string>();
      const manifest = pluginChunks
        .map(({ plugin, entryChunk, chunks }) => {
          if (!entryChunk) return null;
          const cssFiles = [
            ...new Set<string>(
              chunks.flatMap((chunk) => [
                ...((chunk.viteMetadata?.importedCss || new Set<string>()) as Set<string>)
              ])
            )
          ];
          const styles = cssFiles.flatMap((cssFile, index) => {
            const asset = bundle[cssFile] as any;
            if (asset?.type !== "asset") return [];
            const target = `plugins/${sanitizePluginFolder(
              plugin.folder
            )}/frontend/assets/style-${index}-${path.posix.basename(cssFile)}`;
            bundle[target] = { ...asset, fileName: target };
            for (const chunk of chunks) {
              const importedCss = chunk.viteMetadata?.importedCss as Set<string> | undefined;
              if (!importedCss?.delete(cssFile)) continue;
              importedCss.add(target);
            }
            const owners = cssOwners.get(cssFile);
            if (owners && [...owners].every((owner) => pluginChunkSet.has(owner))) {
              removableCss.add(cssFile);
            }
            return [
              `./${path.posix.relative(
                path.posix.dirname("plugins/manifest.json"),
                normalizePath(target)
              )}`
            ];
          });
          return {
            metadata: plugin.metadata,
            directory: String(plugin.metadata.id),
            assetDirectory: plugin.folder,
            entry: `./${path.posix.relative(
              path.posix.dirname("plugins/manifest.json"),
              normalizePath(entryChunk.fileName)
            )}`,
            styles
          };
        })
        .filter(Boolean);
      for (const cssFile of removableCss) delete bundle[cssFile];

      this.emitFile({
        type: "asset",
        fileName: "plugins/manifest.json",
        source: JSON.stringify(manifest, null, 2)
      });
    }
  };
}

let panelPluginBuildEntries = discoverPanelPlugins();
const sanitizePluginFolder = (folder: string) => folder.replace(/[^a-zA-Z0-9_-]/g, "_");

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        entryFileNames: (chunkInfo) => {
          const plugin = panelPluginBuildEntries.find(
            (candidate) =>
              normalizePath(chunkInfo.facadeModuleId || "") === normalizePath(candidate.entry) ||
              chunkInfo.name === `panel-plugin-${sanitizePluginFolder(candidate.folder)}`
          );
          if (plugin) {
            return `plugins/${sanitizePluginFolder(plugin.folder)}/frontend/frontend-[hash].js`;
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: (chunkInfo) => {
          const plugin = panelPluginBuildEntries.find((candidate) => {
            const entry = normalizePath(candidate.entry);
            const pluginRoot = `${normalizePath(candidate.directory)}/`;
            return (
              normalizePath(chunkInfo.facadeModuleId || "") === entry ||
              chunkInfo.name === `panel-plugin-${sanitizePluginFolder(candidate.folder)}` ||
              chunkInfo.moduleIds.some(
                (moduleId) =>
                  normalizePath(moduleId) === entry || normalizePath(moduleId).startsWith(pluginRoot)
              )
            );
          });
          if (plugin) {
            return `plugins/${sanitizePluginFolder(plugin.folder)}/frontend/[name]-[hash].js`;
          }
          return "assets/[name]-[hash].js";
        },
        assetFileNames: (assetInfo) => {
          const originalFiles = Array.isArray((assetInfo as any).originalFileNames)
            ? (assetInfo as any).originalFileNames
            : [];
          const plugin = panelPluginBuildEntries.find((candidate) => {
            const pluginRoot = `${normalizePath(candidate.directory)}/`;
            return originalFiles.some((fileName: string) =>
              normalizePath(fileName).startsWith(pluginRoot)
            );
          });
          if (plugin) {
            return `plugins/${sanitizePluginFolder(
              plugin.folder
            )}/frontend/assets/[name]-[hash][extname]`;
          }
          return "assets/[name]-[hash][extname]";
        },
        manualChunks(path) {
          if (path.includes("node_modules/ant-design-vue/es")) {
            return "ant-es";
          }
          if (path.includes("node_modules/ant-design-vue")) {
            return "ant";
          }
          if (path.includes("node_modules/zrender")) {
            return "zrender";
          }
          if (path.includes("node_modules/echarts")) {
            return "echart";
          }
          if (path.includes("node_modules/lodash")) {
            return "lodash";
          }
          if (path.includes("node_modules/vue") || path.includes("node_modules/@vue")) {
            return "vue";
          }
          if (path.includes("node_modules/@xterm")) {
            return "xterm";
          }
          if (path.includes("node_modules/@codemirror")) {
            return "codemirror";
          }
          if (path.includes("node_modules/monaco")) {
            return "monaco";
          }
          if (path.includes("node_modules/htmlparser2")) {
            return "htmlparser2";
          }
        }
      }
    }
  },
  server: {
    host: true,
    allowedHosts: true,
    fs: {
      allow: [fileURLToPath(new URL("..", import.meta.url))]
    },
    proxy: {
      "/api": {
        target: "http://localhost:23333",
        changeOrigin: true,
        ws: true
      },
      "/upload_files": {
        target: "http://localhost:23333",
        changeOrigin: true
      },
      "/socket.io": {
        target: "ws://localhost:23333",
        ws: true
      }
    }
  },

  plugins: [
    panelPlugins(panelPluginBuildEntries),
    vue(),
    vueJsx(),
    Components({
      resolvers: [
        AntDesignVueResolver({
          importStyle: false // css in js
        })
      ]
    }),
    visualizer({ emitFile: true, filename: "stats.html" })
  ],
  resolve: {
    dedupe: [
      "@ant-design/icons-vue",
      "@vueuse/core",
      "ant-design-vue",
      "dayjs",
      "echarts",
      "lodash",
      "pinia",
      "vue",
      "vue-router"
    ],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@languages": fileURLToPath(new URL("../languages", import.meta.url))
    }
  },
  base: "./"
});
