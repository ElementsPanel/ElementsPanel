const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const root = path.resolve(__dirname, "../..");
const frontendRequire = Module.createRequire(path.join(root, "frontend/package.json"));
const ts = frontendRequire("typescript");

async function loadHostConfig() {
  const { pluginSdkModules } = await import(
    pathToFileURL(path.join(root, "frontend/plugin-sdk.config.mjs"))
  );
  const filename = path.join(root, "frontend/vite.config.ts");
  const mod = new Module(filename, module);
  const overrides = {
    "@vitejs/plugin-vue": () => ({}),
    "@vitejs/plugin-vue-jsx": () => ({}),
    "rollup-plugin-visualizer": { visualizer: () => ({}) },
    "unplugin-vue-components/vite": () => ({}),
    vite: { defineConfig: (value) => value, normalizePath: (value) => value.replaceAll("\\", "/") },
    "./plugin-sdk.config.mjs": { pluginSdkModules },
    "../common/src/plugin_manifest": {
      discoverPluginsFromRoots: () =>
        ["console", "runtime", "user", "file"].map((id) => ({
          manifest: { id },
          directory: `/virtual/plugins/${id}`,
          folder: id,
          entry: `/virtual/plugins/${id}/src/frontend.ts`
        })),
      discoverExternalPluginRoots: () => [],
      createFrontendPluginMetadata: (manifest) => ({ id: manifest.id })
    },
    "../common/src/plugin_overrides": { applyPluginOverrides: (value) => value },
    "node:module": { createRequire: () => ({ resolve: (name) => `/virtual/${name}` }) }
  };
  mod.require = (id) => (Object.hasOwn(overrides, id) ? overrides[id] : require(id));
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
  return { config: mod.exports.default, pluginSdkModules };
}

test("host SDK maps all compiler externals before module scripts, with prefix-relative URLs", async () => {
  const { config, pluginSdkModules } = await loadHostConfig();
  const plugin = config.plugins.find((item) => item.name === "elements-panel-plugins");
  const chunkFileNames = config.build.rollupOptions.output.chunkFileNames;
  assert.match(
    chunkFileNames({
      name: "panel-plugin-file",
      facadeModuleId: "\0panel-plugin-build-entry:file",
      moduleIds: [
        "/virtual/plugins/console/src/shared.ts",
        "/virtual/plugins/file/src/frontend.ts"
      ]
    }),
    /^plugins\/file\/frontend\//
  );
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
    "plugins/console/frontend/frontend-test.js": {
      type: "chunk",
      fileName: "plugins/console/frontend/frontend-test.js",
      name: "panel-plugin-console",
      facadeModuleId: "\0panel-plugin-build-entry:console",
      moduleIds: ["/virtual/plugins/console/src/frontend.ts"],
      viteMetadata: { importedCss: new Set() }
    },
    "assets/console-shared-test.js": {
      type: "chunk",
      fileName: "assets/console-shared-test.js",
      ...sharedChunk("initLib.ts"),
      viteMetadata: { importedCss: new Set(["assets/material-icons.css"]) }
    },
    "assets/material-icons.css": {
      type: "asset",
      fileName: "assets/material-icons.css",
      source:
        '@font-face{src:url(./materialdesignicons-webfont.woff2?v=7.4.47) format("woff2")}'
    },
    "assets/materialdesignicons-webfont.woff2": {
      type: "asset",
      fileName: "assets/materialdesignicons-webfont.woff2",
      source: new Uint8Array()
    }
  };
  plugin.generateBundle.call(context, {}, bundle);
  const html = bundle["index.html"].source;
  const imports = JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/)[1]).imports;
  assert.deepEqual(Object.keys(imports), pluginSdkModules);
  assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'));
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
  const relocatedCss = Object.values(bundle).find(
    (asset) =>
      asset.type === "asset" &&
      asset.fileName.startsWith("plugins/console/frontend/assets/style-")
  );
  assert.match(
    relocatedCss.source,
    /url\(\.\.\/\.\.\/\.\.\/\.\.\/assets\/materialdesignicons-webfont\.woff2\?v=7\.4\.47\)/
  );
  const manifest = JSON.parse(emitted.find((file) => file.fileName === "plugins/manifest.json").source);
  assert.deepEqual(manifest[0].styles, ["./console/frontend/assets/style-0-material-icons.css"]);
});

function entryChunk(folder) {
  return {
    name: `panel-plugin-${folder}`,
    facadeModuleId: `\0panel-plugin-build-entry:${folder}`,
    moduleIds: [`/virtual/plugins/${folder}/src/frontend.ts`]
  };
}

function sharedChunk(source) {
  return {
    name: path.posix.basename(source, ".ts"),
    facadeModuleId: `/virtual/plugins/console/src/${source}`,
    moduleIds: [`/virtual/plugins/console/src/${source}`]
  };
}

function emittedFile(namer, chunk) {
  return namer(chunk).replace("[name]", chunk.name).replace("[hash]", "test-hash");
}

function importUrl(importerFile, importedFile, importerUrl) {
  return new URL(
    `./${path.posix.relative(path.posix.dirname(importerFile), importedFile)}`,
    importerUrl
  ).href;
}

test("versioned plugin entries resolve shared host chunks to one URL at any deployment prefix", async () => {
  const { config } = await loadHostConfig();
  const output = config.build.rollupOptions.output;
  for (const source of [
    "config/router.ts",
    "stores/useAppStateStore.ts",
    "services/apiService.ts",
    "stores/useDefineApi.ts",
    "plugin/services.ts"
  ]) {
    const shared = emittedFile(output.chunkFileNames, sharedChunk(source));
    assert.match(shared, /^assets\//, `${source} must not inherit a plugin revision`);
    for (const prefix of ["/", "/panel/prefix/"]) {
      const urls = new Set();
      for (const folder of ["console", "runtime", "user", "file"]) {
        const chunk = entryChunk(folder);
        for (const namer of [output.entryFileNames, output.chunkFileNames]) {
          const entry = emittedFile(namer, chunk);
          assert.ok(entry.startsWith(`plugins/${folder}/frontend/`));
          // Only actual entries stay plugin-local, including virtual facades
          // whose generated name differs from the declared entry name.
          assert.ok(namer({ ...chunk, name: "generated-entry" }).startsWith(`plugins/${folder}/`));
          for (const revision of ["revision-a", "revision-b"]) {
            const url = new URL(
              entry.replace(`plugins/${folder}/`, `plugins/${folder}@${revision}/`),
              `https://panel.test${prefix}`
            );
            urls.add(importUrl(entry, shared, url));
          }
        }
      }
      assert.deepEqual([...urls], [`https://panel.test${prefix}${shared}`]);
    }
  }
});

test("production URL identities share login state, registered routes and API authorization", async () => {
  const { config } = await loadHostConfig();
  const output = config.build.rollupOptions.output;
  const vue = frontendRequire("vue");
  const vueRouter = frontendRequire("vue-router");
  const vueUse = frontendRequire("@vueuse/core");
  const sources = {
    router: "panel/plugins/console/src/config/router.ts",
    store: "panel/plugins/console/src/stores/useAppStateStore.ts",
    api: "panel/plugins/console/src/services/apiService.ts",
    console: "panel/plugins/console/src/frontend.ts",
    user: "panel/plugins/user/src/widgets/LoginCard.vue"
  };
  const files = Object.fromEntries(
    Object.entries(sources).map(([id, source]) => [
      id,
      ["console", "user"].includes(id)
        ? emittedFile(output.entryFileNames, entryChunk(id))
        : emittedFile(output.chunkFileNames, sharedChunk(source.split("/src/")[1]))
    ])
  );
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
  const ctx = { set() {}, routes: { add: (route) => consoleRouter.addRoute(route) } };
  const overrides = {
    vue: { ...vue, onMounted() {} },
    "vue-router": { ...vueRouter, createWebHashHistory: vueRouter.createMemoryHistory },
    "@vueuse/core": { ...vueUse, useLocalStorage: (_key, value) => vue.ref(value) },
    axios,
    "@/lang/i18n": { t: (key) => key, LANGUAGE_KEY: "language", toStandardLang: () => "en_us" },
    "@/plugin/context": { ctx: { menus: { loginActions: [] } } },
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
    "@/initLib": {},
    "vuetify/components": {},
    "./bootstrap": { prepareApplication: async () => ({ app: {}, ctx }) },
    "./vuetify": { installVuetify() {} },
    "./views/AboutPage.vue": component,
    "./widgets/Page404.vue": component,
    "./ConsoleApp.vue": component
  };
  // Evaluate real sources in memory, caching by browser URL, not disk path.
  // Relative imports are derived from the actual output naming callbacks;
  // the old layout therefore creates separate router/store/API instances.
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
      const target = aliases[specifier];
      if (target) return loadAt(target, importUrl(files[id], files[target], url));
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
  function fromPlugin(folder, target) {
    const entry = emittedFile(output.entryFileNames, entryChunk(folder));
    const url = new URL(
      entry.replace(`plugins/${folder}/`, `plugins/${folder}@revision-${folder}/`),
      "https://panel.test/prefix/"
    );
    return loadAt(target, importUrl(entry, files[target], url));
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
