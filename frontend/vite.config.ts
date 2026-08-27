import { fileURLToPath, pathToFileURL, URL } from "node:url";
import fs from "node:fs";
import path from "node:path";

import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { visualizer } from "rollup-plugin-visualizer";
import { AntDesignVueResolver } from "unplugin-vue-components/resolvers";
import Components from "unplugin-vue-components/vite";
import { defineConfig } from "vite";

const PANEL_PLUGINS_MODULE_ID = "virtual:panel-plugins";
const RESOLVED_PANEL_PLUGINS_MODULE_ID = `\0${PANEL_PLUGINS_MODULE_ID}`;
const PANEL_PLUGINS_DIRECTORY = fileURLToPath(new URL("../panel/plugins", import.meta.url));

function panelPlugins() {
  const isPluginFile = (file: string) =>
    path
      .resolve(file)
      .toLowerCase()
      .startsWith(path.resolve(PANEL_PLUGINS_DIRECTORY).toLowerCase());

  return {
    name: "elements-panel-plugins",
    enforce: "pre" as const,
    resolveId(id: string) {
      if (id === PANEL_PLUGINS_MODULE_ID) return RESOLVED_PANEL_PLUGINS_MODULE_ID;
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
      if (id !== RESOLVED_PANEL_PLUGINS_MODULE_ID) return;
      if (!fs.existsSync(PANEL_PLUGINS_DIRECTORY)) {
        return "export const panelPluginModules = [];";
      }

      const plugins: Array<{
        metadata: Record<string, unknown>;
        directory: string;
        entry: string;
      }> = [];
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
              candidate.startsWith(`${path.resolve(directory)}${path.sep}`) &&
              fs.existsSync(candidate)
          );
        if (!entry) {
          if (configuredEntry) {
            console.warn(`Panel plugin "${id}" has no valid frontend entry module.`);
          }
          continue;
        }

        plugins.push({ metadata: { ...metadata, id }, directory, entry });
      }

      plugins.sort(
        (a, b) =>
          (Number(a.metadata.priority) || 0) - (Number(b.metadata.priority) || 0) ||
          String(a.metadata.id).localeCompare(String(b.metadata.id))
      );
      const imports = plugins.map(
        (plugin, index) =>
          `import * as plugin${index} from ${JSON.stringify(pathToFileURL(plugin.entry).href)};`
      );
      const entries = plugins.map(
        (plugin, index) =>
          `{ metadata: ${JSON.stringify(plugin.metadata)}, directory: ${JSON.stringify(
            String(plugin.metadata.id)
          )}, module: plugin${index} }`
      );
      return `${imports.join("\n")}\nexport const panelPluginModules = [${entries.join(",")}];`;
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
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
    panelPlugins(),
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
    dedupe: ["vue", "vue-router", "pinia"],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@languages": fileURLToPath(new URL("../languages", import.meta.url))
    }
  },
  base: "./"
});
