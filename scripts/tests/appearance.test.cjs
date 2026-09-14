const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const panelRequire = Module.createRequire(path.join(root, "panel/package.json"));
const frontendRequire = Module.createRequire(path.join(root, "frontend/package.json"));
const ts = panelRequire("typescript");
const vue = frontendRequire("vue");
const { JSDOM } = frontendRequire("jsdom");

// Load the real settings and store code in memory without building or serving the app.
function load(filename, overrides = {}) {
  filename = path.join(root, filename);
  const mod = new Module(filename, module);
  const localRequire = Module.createRequire(filename);
  mod.require = (id) => Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: filename
  }).outputText, filename);
  return mod.exports;
}

const { default: SystemConfig } = load("panel/src/app/entity/setting.ts");
const i18n = { t: (key) => key, getCurrentLang: () => "en_us", setLanguage() {} };
const constants = load("panel/plugins/console/src/types/const.ts", { "@/lang/i18n": i18n });
const { AppTheme } = constants;

function backendFixture(initial = {}, legacyLayout, save = () => {}) {
  const config = Object.assign(new SystemConfig(), initial);
  const routes = new Map();
  let schema;
  const router = { get: (route, handler) => routes.set(route, handler), post() {} };
  const plugin = load("panel/plugins/console/src/backend/index.ts", {
    "fs-extra": {
      existsSync: () => legacyLayout !== undefined,
      readFileSync: () => JSON.stringify(legacyLayout)
    }
  });
  plugin.apply({
    i18n: { $t: i18n.t },
    roles: { ADMIN: 10 },
    middleware: { permission: () => () => {} },
    settings: { config, save: () => save(config) },
    inject: (_services, callback) => callback({
      settingsForm: { declare: (declaration) => { schema = declaration; } }
    }),
    koa: { router: () => router }
  });
  return {
    config,
    schema,
    async readPublic() {
      const request = {};
      await routes.get("/appearance")(request);
      return request.body;
    }
  };
}

async function storeFixture(t, readAppearance) {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  const previousDocument = global.document;
  const previousStorage = global.localStorage;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  const scope = vue.effectScope();
  t.after(() => {
    scope.stop();
    dom.window.close();
    global.document = previousDocument;
    global.localStorage = previousStorage;
  });
  const preferredDark = vue.ref(false);
  const mounted = [];
  const { useAppConfigStore } = load("panel/plugins/console/src/stores/useAppConfigStore.ts", {
    "@/assets/logo.svg": "builtin-dark.svg",
    "@/assets/logo_b.svg": "builtin-light.svg",
    "@/lang/i18n": i18n,
    "@/types/const": constants,
    "@/services/apis/appearance": {
      getAppearance: () => ({ execute: async () => ({ value: await readAppearance() }) })
    },
    vue: { ...vue, onMounted: (callback) => mounted.push(callback) },
    "@vueuse/core": {
      createGlobalState: (setup) => setup,
      usePreferredDark: () => preferredDark,
      useLocalStorage: (_key, initial) => vue.ref(initial),
      useBreakpoints: () => ({ greaterOrEqual: () => vue.ref(true) })
    }
  });
  const store = scope.run(useAppConfigStore);
  await Promise.all(mounted.map((callback) => callback()));
  return { store, preferredDark };
}

test("console settings expose two uploadable logos and preserve independent values after restart", async (t) => {
  const { default: Storage } = load("common/src/system_storage.ts", {
    "fs-extra": panelRequire("fs-extra")
  });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-appearance-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  Storage.DATA_PATH = directory;
  const storage = new Storage();
  const backend = backendFixture({}, undefined, (config) => storage.store("SystemConfig", "config", config));
  const logoFields = backend.schema.fields().filter((field) => field.key.startsWith("logoImage"));
  assert.deepEqual(logoFields.map((field) => field.key), ["logoImageLight", "logoImageDark"]);
  assert.ok(logoFields.every((field) => field.fileUpload));

  backend.schema.write({ logoImageLight: "/light.png", logoImageDark: "/dark.png" });
  const restarted = backendFixture(storage.load("SystemConfig", SystemConfig, "config"));
  const appearance = await restarted.readPublic();
  assert.equal(appearance.logoImageLight, "/light.png");
  assert.equal(appearance.logoImageDark, "/dark.png");
  assert.deepEqual(appearance, restarted.schema.read());
});

test("old single logos remain available while cleared themes stop inheriting them", async () => {
  const backend = backendFixture({ logoImage: "/legacy.png", backgroundImage: "/background.png" });
  assert.equal(backend.schema.read().logoImageLight, "/legacy.png");
  assert.equal(backend.schema.read().logoImageDark, "/legacy.png");

  backend.schema.write({ logoImageDark: "/dark.png" });
  backend.schema.write({ logoImageLight: null });
  let appearance = await backend.readPublic();
  assert.equal(appearance.logoImageLight, "");
  assert.equal(appearance.logoImageDark, "/dark.png");
  assert.equal(appearance.backgroundImage, "/background.png");

  backend.schema.write({ logoImageDark: "" });
  appearance = await backendFixture(JSON.parse(JSON.stringify(backend.config))).readPublic();
  assert.equal(appearance.logoImageLight, "");
  assert.equal(appearance.logoImageDark, "");
});

test("legacy layout logos migrate without overwriting explicitly cleared theme settings", () => {
  const layout = [{ page: "__settings__", theme: { logoImage: "/layout-logo.png" } }];
  const migrated = backendFixture({}, layout);
  assert.equal(migrated.schema.read().logoImageLight, "/layout-logo.png");
  assert.equal(migrated.schema.read().logoImageDark, "/layout-logo.png");

  const cleared = backendFixture({ logoImageLight: "", logoImageDark: "" }, layout);
  assert.equal(cleared.schema.read().logoImageLight, "");
  assert.equal(cleared.schema.read().logoImageDark, "");
});

test("logos follow explicit themes and system preference in automatic mode", async (t) => {
  const backend = backendFixture({ logoImageLight: "/light.png", logoImageDark: "/dark.png" });
  const { store, preferredDark } = await storeFixture(t, backend.readPublic);
  assert.equal(store.logoImage.value, "/light.png");

  store.setTheme(AppTheme.DARK);
  assert.equal(store.logoImage.value, "/dark.png");
  store.setTheme(AppTheme.LIGHT);
  preferredDark.value = true;
  await vue.nextTick();
  assert.equal(store.logoImage.value, "/light.png");

  store.setTheme(AppTheme.AUTO);
  assert.equal(store.logoImage.value, "/dark.png");
  preferredDark.value = false;
  await vue.nextTick();
  assert.equal(store.logoImage.value, "/light.png");
  await store.initAppTheme();
});

test("clearing a logo restores the matching built-in image even with a legacy logo present", async (t) => {
  const backend = backendFixture({ logoImage: "/legacy.png" });
  const { store } = await storeFixture(t, backend.readPublic);
  assert.equal(store.logoImage.value, "/legacy.png");
  backend.schema.write({ logoImageLight: null, logoImageDark: "/dark.png" });
  await store.initAppTheme();
  assert.equal(store.logoImage.value, "builtin-light.svg");

  store.setTheme(AppTheme.DARK);
  assert.equal(store.logoImage.value, "/dark.png");
  backend.schema.write({ logoImageDark: null });
  await store.initAppTheme();
  assert.equal(store.logoImage.value, "builtin-dark.svg");
});

test("older appearance responses without theme fields still work in both modes", async (t) => {
  const { store } = await storeFixture(t, async () => ({ logoImage: "/legacy.png" }));
  assert.equal(store.logoImage.value, "/legacy.png");
  store.setTheme(AppTheme.DARK);
  await store.initAppTheme();
  assert.equal(store.logoImage.value, "/legacy.png");
});
