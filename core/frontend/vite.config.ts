import { fileURLToPath, URL } from "node:url";
import path from "node:path";

import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import { visualizer } from "rollup-plugin-visualizer";
// @ts-ignore Shared frontend module identities for the host and built-in plugins.
import { pluginSdkModules } from "./plugin-sdk.config.mjs";
// @ts-ignore Built-in plugin sources resolve browser dependencies from the frontend package.
import { frontendDependencyFallback } from "./plugin-dependencies.config.mjs";
import { defineConfig, normalizePath, type Plugin } from "vite";
// @ts-ignore Shared configuration for isolated plugin builds and source development.
import { frontendAliases, publicFrontendImports } from "./plugin-build.config.mjs";
// @ts-ignore Classic bootstrap installs a single import map before any ESM starts.
import { renderFrontendBootstrap } from "./plugin-bootstrap.mjs";
import {
  discoverPluginsFromRoots,
  createFrontendPluginMetadata
} from "../common/src/plugin_manifest";
import { applyPluginOverrides } from "../common/src/plugin_overrides";
// @ts-ignore Shared source layout is also consumed by the backend build tools.
import { sourcePlugins, developmentDirectory } from "../../scripts/workspace-layout.cjs";

const PANEL_PLUGINS_MODULE_ID = "virtual:panel-plugins";
const RESOLVED_PANEL_PLUGINS_MODULE_ID = `\0${PANEL_PLUGINS_MODULE_ID}`;
const PANEL_PLUGIN_ENTRY_PREFIX = "panel-plugin-entry:";
const PROJECT_DIRECTORY = fileURLToPath(new URL("../..", import.meta.url));
const PANEL_PLUGINS_DIRECTORY = fileURLToPath(new URL("../../plugins", import.meta.url));
const PANEL_PLUGIN_OVERRIDES_FILE = path.join(
  developmentDirectory("panel", PROJECT_DIRECTORY),
  "data/plugin-overrides.json"
);
interface DiscoveredPanelPlugin {
  metadata: Record<string, unknown>;
  directory: string;
  folder: string;
  entry: string;
}

function discoverPanelPlugins(applyOverrides = false): DiscoveredPanelPlugin[] {
  // Discovery is shared with the panel and daemon backends, so the four places
  // that read `plugin.json` cannot drift apart. Only the entry field and the
  // build-time extras are specific to this side. User-installed panel plugins
  // are npm dependencies; the data/plugins and market_plugins directories are
  // intentionally not part of frontend discovery.
  const roots = sourcePlugins("panel", PROJECT_DIRECTORY).map(
    (plugin: { directory: string; folder: string }) => ({
      directory: plugin.directory,
      folder: plugin.folder
    })
  );
  const discovered = discoverPluginsFromRoots(roots, {
    includeDisabled: true,
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
  });
  return (
    applyOverrides ? applyPluginOverrides(discovered, PANEL_PLUGIN_OVERRIDES_FILE) : discovered
  )
    .filter((plugin) => plugin.entry && (!applyOverrides || plugin.manifest.enabled !== false))
    .map((plugin) => ({
      metadata: createFrontendPluginMetadata(plugin.manifest) as unknown as Record<string, unknown>,
      directory: plugin.directory,
      folder: plugin.folder,
      entry: plugin.entry!
    }));
}

function panelPlugins(initialPlugins = discoverPanelPlugins()): Plugin {
  let plugins = initialPlugins;
  let isBuild = false;
  const sdkEntries = new Map<string, string>();
  const isPluginFile = (file: string) => {
    const target = path.resolve(file).toLowerCase();
    return [PANEL_PLUGINS_DIRECTORY, PANEL_PLUGIN_OVERRIDES_FILE].some((directory) => {
      const root = path.resolve(directory).toLowerCase();
      return target === root || target.startsWith(`${root}${path.sep}`);
    });
  };

  return {
    name: "elements-panel-plugins",
    enforce: "post" as const,
    configResolved(config: any) {
      isBuild = config.command === "build";
      if (!isBuild) plugins = discoverPanelPlugins(true);
    },
    buildStart() {
      if (!isBuild) return;
      for (const specifier of pluginSdkModules as string[]) {
        sdkEntries.set(
          specifier,
          this.emitFile({
            type: "chunk",
            id: `elements-sdk:${specifier}`,
            preserveSignature: "strict"
          })
        );
      }
    },
    resolveId(id: string) {
      if (id.startsWith("elements-sdk:")) return `\0${id}`;
      if (id === PANEL_PLUGINS_MODULE_ID) return RESOLVED_PANEL_PLUGINS_MODULE_ID;
      if (id.startsWith(PANEL_PLUGIN_ENTRY_PREFIX)) {
        const index = Number(id.slice(PANEL_PLUGIN_ENTRY_PREFIX.length));
        return plugins[index]?.entry;
      }
    },
    configureServer(server: any) {
      server.watcher.add([PANEL_PLUGINS_DIRECTORY, PANEL_PLUGIN_OVERRIDES_FILE]);
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
      if (id.startsWith("\0elements-sdk:")) {
        const specifier = id.slice("\0elements-sdk:".length);
        const target =
          specifier === "@elements-panel/sdk"
            ? normalizePath(fileURLToPath(new URL("./src/plugin/sdk.ts", import.meta.url)))
            : specifier;
        return `export * from ${JSON.stringify(target)};`;
      }
      if (id !== RESOLVED_PANEL_PLUGINS_MODULE_ID) return;
      if (isBuild) return "export const panelPluginModules = [];";
      plugins = discoverPanelPlugins(true);
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
      const imports = Object.fromEntries(
        [...sdkEntries].map(([id, ref]) => [id, `./${this.getFileName(ref)}`])
      );
      // Import-map entries are emitted outside the HTML entry graph. Vite does
      // not attach their extracted CSS to a bare browser import, so the host
      // must load shared framework styles (including Vuetify components) here.
      const styles = Object.values(bundle).filter(
        (asset) => asset.type === "asset" && asset.fileName.endsWith(".css")
      );
      for (const asset of Object.values(bundle)) {
        if (asset.type !== "asset" || !asset.fileName.endsWith(".html")) continue;
        const html = String(asset.source);
        const links = styles
          .filter((style) => !html.includes(`href="./${style.fileName}"`))
          .map((style) => `<link rel="stylesheet" href="./${style.fileName}">`)
          .join("\n");
        asset.source = renderFrontendBootstrap(html.replace("<head>", `<head>\n${links}`), imports);
      }
      this.emitFile({
        type: "asset",
        fileName: "frontend-runtime.json",
        source: JSON.stringify({ frontendApi: 1, frontendModules: pluginSdkModules })
      });
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
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  },
  server: {
    host: true,
    allowedHosts: true,
    fs: {
      allow: [fileURLToPath(new URL("../..", import.meta.url))]
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
    publicFrontendImports(),
    frontendDependencyFallback(fileURLToPath(new URL(".", import.meta.url))),
    vue(),
    vueJsx(),
    visualizer({ emitFile: true, filename: "stats.html" })
  ],
  resolve: {
    dedupe: pluginSdkModules,
    alias: frontendAliases()
  },
  base: "./"
});
