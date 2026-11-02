const fs = require("node:fs");
const path = require("node:path");
const { registerHooks } = require("node:module");
const { fileURLToPath, pathToFileURL } = require("node:url");

const HOST_MODULE = "epanel-host:";
const SHARED_FRONTEND_MODULES = new Set([
  "vue",
  "vue-router",
  "pinia",
  "vue-i18n",
  "cordis",
  "cosmokit",
  "@vueuse/core",
  "@vueuse/shared",
  "@elements-panel/sdk"
]);
const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

function within(root, filename) {
  const relative = path.relative(root, filename);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Transpile workspace modules in memory, preserving normal npm dependency resolution. */
function installBackendSources(workspaces, esbuild = require("esbuild")) {
  const owner = (filename) =>
    (typeof workspaces === "function" ? workspaces() : workspaces).find(
      (workspace) =>
        within(workspace.packageRoot, filename) &&
        !path.relative(workspace.packageRoot, filename).split(path.sep).includes("node_modules")
    );
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (
          !["MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND", "ERR_UNSUPPORTED_DIR_IMPORT"].includes(
            error.code
          ) ||
          !specifier.startsWith(".") ||
          !context.parentURL?.startsWith("file:") ||
          !owner(fileURLToPath(context.parentURL))
        )
          throw error;
        const target = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
        const stem = target.replace(/\.[cm]?jsx?$/, "");
        const candidates = [
          ...EXTENSIONS.map((extension) => stem + extension),
          ...EXTENSIONS.map((extension) => path.join(target, "index" + extension))
        ];
        const found = candidates.find(
          (filename) => owner(filename) && fs.existsSync(filename) && fs.statSync(filename).isFile()
        );
        if (!found) throw error;
        return nextResolve(
          Array.from(context.conditions).includes("require") ? found : pathToFileURL(found).href,
          context
        );
      }
    },
    load(url, context, nextLoad) {
      if (!url.startsWith("file:")) return nextLoad(url, context);
      const filename = fileURLToPath(url);
      const workspace = owner(filename);
      const extension = path.extname(filename);
      if (!workspace || !EXTENSIONS.includes(extension)) return nextLoad(url, context);
      const metadata = JSON.parse(
        fs.readFileSync(path.join(workspace.packageRoot, "package.json"), "utf8")
      );
      const format =
        extension === ".mts" ||
        extension === ".mjs" ||
        (!extension.startsWith(".c") && metadata.type === "module")
          ? "module"
          : "commonjs";
      const loader =
        extension === ".tsx" || extension === ".jsx"
          ? extension.slice(1)
          : /\.[cm]?ts$/.test(extension)
          ? "ts"
          : "js";
      const result = esbuild.transformSync(fs.readFileSync(filename, "utf8"), {
        loader,
        format: format === "module" ? "esm" : "cjs",
        target: "node22",
        sourcefile: filename,
        sourcemap: "inline"
      });
      return { format, source: result.code, shortCircuit: true };
    }
  });
}

/** Browsers resolve these bare imports through the compiled host's existing import map. */
function sharedFrontendModules() {
  return {
    name: "elementspanel-workspace-host-modules",
    enforce: "pre",
    resolveId(specifier) {
      if (SHARED_FRONTEND_MODULES.has(specifier))
        return { id: HOST_MODULE + encodeURIComponent(specifier), external: true };
      if (specifier.startsWith(HOST_MODULE)) return specifier;
    },
    load(id) {
      // Vite may pre-transform the graph; the HTTP middleware supplies the real
      // bridge without sending its bare import back through Vite's resolver.
      if (id.startsWith(HOST_MODULE)) return "";
    },
    configResolved(config) {
      // The installed host supplies production Vue. Its component HMR runtime
      // is absent, so compile compatible components and reload the page instead.
      config.isProduction = true;
    },
    handleHotUpdate({ server }) {
      server.ws.send({ type: "full-reload" });
      return [];
    }
  };
}

async function installDevelopmentRuntime({ packageRoot }) {
  const project = path.resolve(process.env.EPANEL_PROJECT_ROOT);
  const external = path.join(project, "external");
  const { resolveNpmPlugins } = require(path.join(packageRoot, "runtime/npm-plugins.cjs"));
  let snapshot = [],
    snapshotTime = 0;
  const workspaces = () => {
    if (Date.now() - snapshotTime >= 1000) {
      snapshotTime = Date.now();
      snapshot = resolveNpmPlugins(packageRoot, undefined, { skipInvalid: true }).filter(
        (plugin) => plugin.developmentEntries
      );
    }
    return snapshot;
  };
  workspaces();
  installBackendSources(workspaces);
  let vite;
  let base;
  const runtime = {
    frontendEntry(entry, revision) {
      if (!within(external, entry))
        throw new Error(`Workspace frontend escapes external/: ${entry}`);
      const relative = path
        .relative(external, entry)
        .split(path.sep)
        .map(encodeURIComponent)
        .join("/");
      return `./__dev/${relative}?v=${revision}`;
    },
    async attach(server, prefix) {
      const { createServer } = require("vite");
      const vue = require("@vitejs/plugin-vue");
      const vueJsx = require("@vitejs/plugin-vue-jsx");
      base = `${prefix.replace(/\/$/, "")}/plugins/__dev/`;
      fs.mkdirSync(external, { recursive: true });
      vite = await createServer({
        configFile: false,
        root: external,
        base,
        publicDir: false,
        appType: "custom",
        cacheDir: path.join(process.env.EPANEL_RUNTIME_ROOT, ".vite"),
        plugins: [
          sharedFrontendModules(),
          {
            name: "elementspanel-workspace-client",
            transform(code, id) {
              if (
                workspaces().some(
                  (plugin) =>
                    plugin.developmentEntries.frontend &&
                    path.resolve(plugin.directory, plugin.developmentEntries.frontend) ===
                      id.split("?")[0]
                )
              )
                return `import ${JSON.stringify(base + "@vite/client")};\n${code}`;
            }
          },
          vue({ compiler: require("vue/compiler-sfc") }),
          vueJsx()
        ],
        optimizeDeps: {
          entries: workspaces()
            .filter((plugin) => plugin.developmentEntries.frontend)
            .map((plugin) => path.resolve(plugin.directory, plugin.developmentEntries.frontend)),
          exclude: [...SHARED_FRONTEND_MODULES]
        },
        server: {
          middlewareMode: true,
          hmr: { server, path: "hmr" },
          fs: { allow: [external, path.join(project, "node_modules")] }
        }
      });
      return () => vite.close();
    },
    middleware(req, res, next) {
      if (!vite) return next(new Error("Workspace frontend development middleware is not ready."));
      // The panel strips its configured prefix before dispatching Koa routes.
      if (req.url.startsWith("/plugins/__dev/"))
        req.url = base + req.url.slice("/plugins/__dev/".length);
      const pathname = new URL(req.url, "http://localhost").pathname;
      const bridge = `${base}@id/${HOST_MODULE}`;
      if (pathname.startsWith(bridge)) {
        const specifier = decodeURIComponent(pathname.slice(bridge.length));
        if (!SHARED_FRONTEND_MODULES.has(specifier)) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.setHeader("Content-Type", "text/javascript");
        res.setHeader("Cache-Control", "no-store");
        res.end(`export * from ${JSON.stringify(specifier)};\n`);
        return;
      }
      vite.middlewares(req, res, next);
    }
  };
  globalThis[Symbol.for("elementspanel.development")] = runtime;
  return runtime;
}

module.exports = { installDevelopmentRuntime, installBackendSources, sharedFrontendModules };
