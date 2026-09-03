import { fileURLToPath, URL } from "node:url";
import path from "node:path";

import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { visualizer } from "rollup-plugin-visualizer";
import { AntDesignVueResolver } from "unplugin-vue-components/resolvers";
import Components from "unplugin-vue-components/vite";
import { defineConfig, normalizePath, type Plugin } from "vite";
import { discoverPlugins } from "../common/src/plugin_manifest";

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
  // Discovery is shared with the panel and daemon backends, so the four places
  // that read `plugin.json` cannot drift apart. Only the entry field and the
  // build-time extras are specific to this side.
  return discoverPlugins(PANEL_PLUGINS_DIRECTORY, {
    entryFields: ["frontend", "ui"],
    entryCandidates: [
      "src/frontend.ts",
      "src/frontend.tsx",
      "src/frontend.js",
      "src/frontend.jsx",
      "src/index.ts",
      "src/index.tsx"
    ],
    onWarning: (message, error) => console.warn(message, error)
  })
    .filter((plugin) => plugin.entry)
    .map((plugin) => ({
      metadata: plugin.manifest as Record<string, unknown>,
      directory: plugin.directory,
      folder: plugin.folder,
      entry: plugin.entry!,
      buildEntryId: `${RESOLVED_PANEL_PLUGIN_BUILD_ENTRY_PREFIX}${plugin.folder}`
    }));
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
        // A plugin exports `apply` and optionally `inject`, both named, so the
        // chunk only re-exports; requiring a default export would break it.
        return `export * from ${JSON.stringify(normalizePath(plugin.entry))};`;
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
      // One cordis instance: a plugin chunk and the main bundle must share the
      // container, or a plugin would register its services on a copy of it.
      "cordis",
      "dayjs",
      "echarts",
      "eventemitter3",
      "lodash",
      "pinia",
      "pretty-bytes",
      "vue",
      "vue-i18n",
      "vue-router",
      // Terminal code lives in `panel/plugins/terminal`, while its packages
      // are installed with the frontend workspace dependencies.
      "@xterm/addon-canvas",
      "@xterm/addon-fit",
      "@xterm/addon-webgl",
      "@xterm/xterm"
    ],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@instance": fileURLToPath(new URL("../panel/plugins/instance/src", import.meta.url))
    }
  },
  base: "./"
});
