const { from } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const root = path.resolve(__dirname, "../..");
const frontendRequire = from("frontend");
const ts = frontendRequire("typescript");

async function loadHostConfig() {
  const { pluginSdkModules } = await import(
    pathToFileURL(path.join(root, "core/frontend/plugin-sdk.config.mjs"))
  );
  const { frontendDependencyFallback } = await import(
    pathToFileURL(path.join(root, "core/frontend/plugin-dependencies.config.mjs"))
  );
  const filename = path.join(root, "core/frontend/vite.config.ts");
  const mod = new Module(filename, module);
  const discoveryRoots = [];
  const overrideFiles = [];
  const overrides = {
    "@vitejs/plugin-vue": () => ({}),
    "@vitejs/plugin-vue-jsx": () => ({}),
    "rollup-plugin-visualizer": { visualizer: () => ({}) },
    "unplugin-vue-components/vite": () => ({}),
    vite: { defineConfig: (value) => value, normalizePath: (value) => value.replaceAll("\\", "/") },
    "./plugin-sdk.config.mjs": { pluginSdkModules },
    "./plugin-build.config.mjs": { frontendAliases: () => ({}), publicFrontendImports: () => ({}) },
    "./plugin-dependencies.config.mjs": { frontendDependencyFallback },
    "../common/src/plugin_manifest": {
      discoverPluginsFromRoots: (roots) => {
        discoveryRoots.push(roots.map((root) => root.directory));
        return ["console", "runtime", "user", "file"].map((id) => ({
          manifest: { id },
          directory: `/virtual/plugins/${id}`,
          folder: id,
          entry: `/virtual/plugins/${id}/src/frontend.ts`
        }));
      },
      createFrontendPluginMetadata: (manifest) => ({ id: manifest.id })
    },
    "../common/src/plugin_overrides": {
      applyPluginOverrides: (value, filename) => {
        overrideFiles.push(filename);
        return value;
      }
    },
    "node:module": { createRequire: () => ({ resolve: (name) => `/virtual/${name}` }) }
  };
  mod.require = (id) => (Object.hasOwn(overrides, id) ? overrides[id] : Module.createRequire(filename)(id));
  mod._compile(
    ts.transpileModule(
      fs
        .readFileSync(filename, "utf8")
        .replaceAll("import.meta.url", JSON.stringify(pathToFileURL(filename).href)),
      {
        fileName: filename,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true
        }
      }
    ).outputText,
    filename
  );
  return { config: mod.exports.default, pluginSdkModules, discoveryRoots, overrideFiles };
}

test("frontend discovery does not load panel plugins from runtime data directories", async () => {
  const { config, discoveryRoots, overrideFiles } = await loadHostConfig();
  const plugin = config.plugins.find((item) => item.name === "elements-panel-plugins");
  plugin.configResolved({ command: "serve" });
  const directories = discoveryRoots.flat();
  assert.ok(directories.length > 0);
  assert.ok(directories.every((directory) => !directory.includes("panel/data/plugins")));
  assert.ok(directories.every((directory) => !directory.includes("panel/market_plugins")));
  assert.deepEqual(overrideFiles, [path.join(root, "data/panel/data/plugin-overrides.json")]);
});

test("host SDK maps all compiler externals before module scripts, with prefix-relative URLs", async () => {
  const { config, pluginSdkModules } = await loadHostConfig();
  const plugin = config.plugins.find((item) => item.name === "elements-panel-plugins");
  const emitted = [];
  const context = {
    emitFile(file) {
      emitted.push(file);
      return `ref-${emitted.length - 1}`;
    },
    getFileName(ref) {
      return `assets/${ref}.js`;
    }
  };
  plugin.configResolved({ command: "build" });
  // Exercise metadata hooks only: no bundler, compiler, server, or output files.
  plugin.buildStart.call(context);
  const bundle = {
    "index.html": {
      type: "asset",
      fileName: "index.html",
      source: '<html><head><script type="module" src="./main.js"></script></head></html>'
    },
    "assets/framework.css": { type: "asset", fileName: "assets/framework.css", source: ".v-card {}" }
  };
  plugin.generateBundle.call(context, {}, bundle);
  const html = bundle["index.html"].source;
  const imports = JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/)[1]).imports;
  assert.deepEqual(Object.keys(imports), pluginSdkModules);
  assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'));
  assert.ok(html.includes('<link rel="stylesheet" href="./assets/framework.css">'),
    "CSS of import-map entries must be loaded even when outside the HTML entry graph");
  for (const id of pluginSdkModules) {
    const chunk = emitted.find((file) => file.id === `elements-sdk:${id}`);
    assert.equal(chunk.preserveSignature, "strict");
    assert.ok(
      new URL(imports[id], "https://panel.test/prefix/").href.startsWith(
        "https://panel.test/prefix/assets/"
      )
    );
    const bridge = plugin.load(plugin.resolveId(`elements-sdk:${id}`));
    assert.ok(bridge.startsWith("export * from "));
    if (id === "vue" || id === "cordis")
      assert.equal(bridge, `export * from ${JSON.stringify(id)};`);
  }
  assert.equal(emitted.filter(file => file.type === "chunk").length, pluginSdkModules.length,
    "the host must not emit plugin entries");
  assert.deepEqual(JSON.parse(emitted.find(file => file.fileName === "frontend-runtime.json").source),
    { frontendApi: 1, frontendModules: pluginSdkModules });
  assert.equal(plugin.load("\0virtual:panel-plugins"), "export const panelPluginModules = [];");
});

test("independent plugin configs externalize only public interfaces and own all emitted files", async () => {
  const { builtinPluginConfig, publicFrontendImports, publicFrontendModules } = await import(
    pathToFileURL(path.join(root, "core/frontend/plugin-build.config.mjs"))
  );
  const { sourcePlugins } = require("../workspace-layout.cjs");
  const plugins = sourcePlugins("panel");
  const user = builtinPluginConfig(plugins.find(plugin => plugin.id === "user"), "/fixture/plugins");
  const consoleConfig = builtinPluginConfig(plugins.find(plugin => plugin.id === "console"), "/fixture/plugins");
  const modules = publicFrontendModules();
  const request = "@elementspanel/epanel-plugin-console/stores/useAppStateStore";
  const foreign = publicFrontendImports("user", modules);
  assert.deepEqual(foreign.resolveId(request), { id: request, external: true });
  assert.equal(publicFrontendImports("console", modules).resolveId(request), modules.get(request).filename);
  assert.throws(() => foreign.load(path.join(root, "plugins/console/panel/src/stores/useAppStateStore.ts")), /private source/);
  assert.throws(() => foreign.resolveId("@elementspanel/epanel-plugin-console/private"), /Unknown public/);
  assert.throws(() => foreign.load(path.join(root, "core/frontend/src/plugin/context.ts")), /private host source/);
  const hostImports = publicFrontendImports(undefined, modules);
  hostImports.configResolved({ command: "build" });
  assert.throws(() => hostImports.resolveId(request), /before discovery/);
  for (const specifier of ["vue", "pinia", "vuetify/components", "@elements-panel/sdk"]) {
    assert.equal(user.build.rollupOptions.external(specifier), true);
  }
  assert.throws(() => user.build.rollupOptions.external("vue/unmapped-subpath"), /Unmapped shared/);
  assert.equal(user.build.rollupOptions.external("vuetify/styles"), false);
  assert.deepEqual(Object.keys(user.build.rollupOptions.input), ["index"]);
  assert.equal(consoleConfig.build.rollupOptions.input["exports/stores/useAppStateStore"], modules.get(request).filename);
  assert.equal(user.build.outDir, "/fixture/plugins/user");
  assert.equal(user.build.rollupOptions.output.chunkFileNames, "frontend/chunks/[name]-[hash].js");
  assert.equal(user.build.rollupOptions.output.assetFileNames, "frontend/assets/[name]-[hash][extname]");
  const emitted = [];
  user.plugins.find(plugin => plugin.name === "elements-plugin-build-manifest").generateBundle.call(
    { emitFile: file => emitted.push(file) }, {}, {
      "frontend/index.js": { type: "chunk", imports: ["vue", request, "frontend/chunks/local.js"], dynamicImports: [] },
      "frontend/chunks/local.js": { type: "chunk", imports: [], dynamicImports: [] },
      "frontend/assets/style.css": { type: "asset" }
    }
  );
  const manifest = JSON.parse(emitted[0].source);
  assert.deepEqual(manifest.imports, [request, "vue"]);
  assert.deepEqual(manifest.styles, ["frontend/assets/style.css"]);
  assert.equal(manifest.frontendApi, 1);
});

test("production URL identities share login state, registered routes and API authorization", async () => {
  const vue = frontendRequire("vue");
  const vueRouter = frontendRequire("vue-router");
  const vueUse = frontendRequire("@vueuse/core");
  const sources = {
    router: "plugins/console/panel/src/config/router.ts",
    store: "plugins/console/panel/src/stores/useAppStateStore.ts",
    api: "plugins/console/panel/src/services/apiService.ts",
    console: "plugins/console/panel/src/frontend.ts",
    user: "plugins/user/panel/src/widgets/LoginCard.vue"
  };
  const files = {
    router: "frontend/chunks/router.js", store: "frontend/chunks/store.js", api: "frontend/chunks/api.js",
    console: "frontend/index.js", user: "frontend/index.js"
  };
  const moduleUrl = id => `https://panel.test/prefix/plugins/${id === "user" ? "user" : "console"}@revision-${id === "user" ? "user" : "console"}/${files[id]}`;
  const aliases = {
    "@/config/router": "router",
    "@/stores/useAppStateStore": "store",
    "@/services/apiService": "api"
  };
  const profile = { userName: "admin", permission: 10, token: "session-token" };
  const requests = [];
  const errors = [];
  const axios = frontendRequire("axios").create({
    adapter: async (config) => {
      requests.push(config);
      return { data: { data: true, status: 200 }, status: 200, headers: {}, config };
    }
  });
  let consoleRouter;
  const component = { render: () => null };
  const ctx = {
    set() {},
    routes: { add: (route) => consoleRouter.addRoute(route) },
    slots: { register() {} },
    desktop: { view() {} },
    menus: { loginActions: [] }
  };
  const overrides = {
    vue: { ...vue, onMounted() {} },
    "vue-router": { ...vueRouter, createWebHashHistory: vueRouter.createMemoryHistory },
    "@vueuse/core": { ...vueUse, useLocalStorage: (_key, value) => vue.ref(value) },
    axios,
    "@elementspanel/epanel-plugin-i18n": { t: (key) => key, LANGUAGE_KEY: "language", toStandardLang: () => "en_us" },
    "@elements-panel/sdk": { ctx: { menus: { loginActions: [] } } },
    "@/services/TopProgressBar": { topProgressBar: { start() {}, done() {} } },
    "@/services/apis/user": {
      isUserPluginLoaded: () => true,
      userInfoApi: () => ({ execute: async () => vue.ref({ ...profile }) })
    },
    "@/services/apis": {
      loginPageInfo: () => ({ state: vue.ref(), execute: async () => {} }),
      loginUser: () => ({ execute: async () => vue.ref(profile.token) }),
      ssoConfig: () => ({ execute: async () => vue.ref(null) })
    },
    "@/tools/validator": { reportErrorMsg: (error) => errors.push(error) },
    "@/tools/vuetifyToast": { message: { error: (error) => errors.push(error) } },
    "@/tools/vuetifyModal": { Modal: { error: (error) => errors.push(error) } },
    "@/tools/safe": { markdownToHTML: (value) => value },
    "@/tools/dom": { setLoadingTitle() {} },
    "@/services/appearance": { initAppearance: async () => {} },
    "@/stores/useBackgroundTasks": {
      useBackgroundTasks: () => ({
        open: vue.ref(false),
        activeCount: vue.computed(() => 0),
        refresh: async () => {}
      })
    },
    "@/hooks/useThemeSwitch": {
      useThemeSwitch: () => ({
        themeIcon: vue.computed(() => "mdi-theme-light-dark"),
        themeTitle: vue.computed(() => "Theme"),
        cycleTheme() {}
      })
    },
    "@/initLib": {},
    "vuetify/components": {},
    "./bootstrap": { prepareApplication: async () => ({ app: {}, ctx }) },
    "./vuetify": { installVuetify() {} },
    "./widgets/Page404.vue": component,
    "./ConsoleApp.vue": component,
    "./components/BackgroundTasksSidebar.vue": component,
    "./components/DesktopBackgroundTasks.vue": component
  };
  // Public facade imports and the owner's relative imports reach the same
  // revision-scoped private chunk. Cache by browser URL, not filesystem path.
  const modules = new Map();
  function loadAt(id, url) {
    if (modules.has(url)) return modules.get(url).exports;
    const filename = path.join(root, sources[id]);
    let source = fs.readFileSync(filename, "utf8");
    if (filename.endsWith(".vue")) {
      const { parse, compileScript } = frontendRequire("@vue/compiler-sfc");
      source = compileScript(parse(source, { filename }).descriptor, { id: "login-test" }).content;
    }
    const mod = new Module(filename, module);
    modules.set(url, mod);
    mod.require = (specifier) => {
      const local = specifier.replace("@elementspanel/epanel-plugin-console/", "@/");
      const target = aliases[local];
      if (target) return loadAt(target, moduleUrl(target));
      if (Object.hasOwn(overrides, local)) return overrides[local];
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
      if (specifier.endsWith(".scss")) return {};
      return frontendRequire(specifier);
    };
    mod._compile(
      'const window = { navigator: { language: "en-US" } };\n' +
        ts.transpileModule(source, {
          fileName: `${filename}.ts`,
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            esModuleInterop: true
          }
        }).outputText,
      filename
    );
    return mod.exports;
  }
  function fromPlugin(_folder, target) {
    return loadAt(target, moduleUrl(target));
  }

  const runtimeStore = fromPlugin("runtime", "store").useAppStateStore();
  consoleRouter = fromPlugin("console", "router").router;
  await fromPlugin("console", "console").apply(ctx);
  for (const [route, permission] of [["/login", 0], ["/instances", 10], ["/customer", 1]]) {
    consoleRouter.addRoute({ path: route, name: route, component, meta: { permission } });
  }
  const login = fromPlugin("user", "user").default.setup({}, { expose() {} });
  const loginStore = fromPlugin("user", "store").useAppStateStore();
  const consoleStore = fromPlugin("console", "store").useAppStateStore();
  assert.equal(runtimeStore, consoleStore);
  assert.equal(loginStore, consoleStore);
  assert.equal(fromPlugin("user", "router").router, consoleRouter);
  assert.equal(fromPlugin("user", "api").apiService, fromPlugin("console", "api").apiService);

  await consoleRouter.push("/instances");
  assert.equal(consoleRouter.currentRoute.value.path, "/login");
  login.formData.username = "admin";
  login.formData.password = "password";
  await login.handleLogin();
  assert.equal(consoleRouter.currentRoute.value.path, "/instances");
  assert.equal(consoleStore.state.userInfo.token, profile.token);
  assert.equal(login.loading.value, false);
  await consoleRouter.push("/customer");
  assert.equal(consoleRouter.currentRoute.value.path, "/customer");
  await consoleRouter.push("/");
  assert.equal(consoleRouter.currentRoute.value.path, "/instances");
  await fromPlugin("console", "api").apiService.subscribe({ url: "/protected" });
  assert.equal(requests.at(-1).headers.get("Authorization"), `Bearer ${profile.token}`);

  // The root redirect must also preserve regular-user permissions after login.
  await loginStore.updateUserInfo({ ...profile, permission: 1 });
  await fromPlugin("user", "router").router.replace("/");
  assert.equal(consoleRouter.currentRoute.value.path, "/customer");
  await consoleRouter.push("/instances");
  assert.equal(consoleRouter.currentRoute.value.path, "/customer");
  assert.deepEqual(errors, []);
});
