const { from, createLoader } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const panelRequire = from("panel");
const frontendRequire = from("frontend");
const ts = panelRequire("typescript");
const vue = frontendRequire("vue");
const { JSDOM } = frontendRequire("jsdom");

// Load the real settings and store code in memory without building or serving the app.
const load = createLoader({ compiler: ts });

const { default: SystemConfig } = load("plugins/runtime/panel/src/backend/entity/setting.ts");
const i18n = { t: (key) => key, getCurrentLang: () => "en_us", setLanguage() {} };
const constants = load("plugins/console/panel/src/types/const.ts", { "@/lang/i18n": i18n });
const { AppTheme } = constants;
const { resolveBackgroundImage } = load("plugins/console/panel/src/services/apis/appearance.ts", {
  "@/stores/useDefineApi": { useDefineApi: () => () => ({}) }
});

function backendFixture(initial = {}, legacyLayout, save = () => {}) {
  const config = Object.assign(new SystemConfig(), initial);
  const routes = new Map();
  let schema;
  const router = { get: (route, handler) => routes.set(route, handler), post() {} };
  const plugin = load("plugins/console/panel/src/backend/index.ts", {
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
  const { useAppConfigStore } = load("plugins/console/panel/src/stores/useAppConfigStore.ts", {
    "@/assets/logo.svg": "builtin-dark.svg",
    "@/assets/logo_b.svg": "builtin-light.svg",
    "@/lang/i18n": i18n,
    "@/types/const": constants,
    "@/services/apis/appearance": {
      resolveBackgroundImage,
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

test("console appearance persists independent logos and background images after restart", async (t) => {
  const { default: Storage } = load("core/common/src/system_storage.ts", {
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
  assert.deepEqual(backend.schema.fields().map((field) => field.key),
    ["pageTitle", "logoImageLight", "logoImageDark", "backgroundImagePerTheme", "backgroundImage",
      "backgroundImageLight", "backgroundImageDark", "backgroundImageBlur"]);

  await backend.schema.write({
    logoImageLight: "/light.png", logoImageDark: "/dark.png",
    backgroundImage: "/background.png", backgroundImageBlur: 0,
    backgroundImagePerTheme: true, backgroundImageLight: "/background-light.png",
    backgroundImageDark: "/background-dark.png"
  });
  const restarted = backendFixture(storage.load("SystemConfig", SystemConfig, "config"));
  const appearance = await restarted.readPublic();
  assert.equal(appearance.logoImageLight, "/light.png");
  assert.equal(appearance.logoImageDark, "/dark.png");
  assert.equal(appearance.backgroundImage, "/background.png");
  assert.equal(appearance.backgroundImagePerTheme, true);
  assert.equal(appearance.backgroundImageLight, "/background-light.png");
  assert.equal(appearance.backgroundImageDark, "/background-dark.png");
  assert.equal(appearance.backgroundImageBlur, 0);
  assert.deepEqual(appearance, restarted.schema.read());
});

test("old single images remain available while cleared themes stop inheriting them", async () => {
  const backend = backendFixture({ logoImage: "/legacy.png", backgroundImage: "/background.png" });
  assert.equal(backend.schema.read().logoImageLight, "/legacy.png");
  assert.equal(backend.schema.read().logoImageDark, "/legacy.png");
  assert.equal(backend.schema.read().backgroundImagePerTheme, false);
  assert.equal(backend.schema.read().backgroundImageLight, "/background.png");
  assert.equal(backend.schema.read().backgroundImageDark, "/background.png");

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
  await backend.schema.write({ backgroundImagePerTheme: true, backgroundImageLight: null });
  appearance = await backendFixture(JSON.parse(JSON.stringify(backend.config))).readPublic();
  assert.equal(appearance.backgroundImageLight, "");
  assert.equal(appearance.backgroundImageDark, "/background.png");
  assert.equal(resolveBackgroundImage(appearance, false), "");
  assert.equal(resolveBackgroundImage(appearance, true), "/background.png");
});

test("legacy layout logos migrate without overwriting explicitly cleared theme settings", () => {
  const layout = [{ page: "__settings__", theme: { logoImage: "/layout-logo.png" } }];
  const migrated = backendFixture({}, layout);
  assert.equal(migrated.schema.read().logoImageLight, "/layout-logo.png");
  assert.equal(migrated.schema.read().logoImageDark, "/layout-logo.png");

  const cleared = backendFixture({ logoImageLight: "", logoImageDark: "" }, layout);
  assert.equal(cleared.schema.read().logoImageLight, "");
  assert.equal(cleared.schema.read().logoImageDark, "");
  const backgroundLayout = [{ page: "__settings__", theme: { backgroundImage: "/layout-bg.png" } }];
  assert.equal(backendFixture({}, backgroundLayout).schema.read().backgroundImageLight, "/layout-bg.png");
  const clearedBackground = backendFixture({ backgroundImageLight: "", backgroundImageDark: "" }, backgroundLayout);
  assert.equal(clearedBackground.schema.read().backgroundImageLight, "");
  assert.equal(clearedBackground.schema.read().backgroundImageDark, "");
});

test("logos and backgrounds follow explicit themes and system preference in automatic mode", async (t) => {
  const backend = backendFixture({
    logoImageLight: "/light.png", logoImageDark: "/dark.png", backgroundImage: "/shared-bg.png",
    backgroundImagePerTheme: true, backgroundImageLight: "/light-bg.png", backgroundImageDark: "/dark-bg.png"
  });
  const { store, preferredDark } = await storeFixture(t, backend.readPublic);
  const background = () => document.body.style.getPropertyValue("--app-background-image");
  assert.equal(store.logoImage.value, "/light.png");
  assert.match(background(), /light-bg\.png/);

  store.setTheme(AppTheme.DARK);
  assert.equal(store.logoImage.value, "/dark.png");
  await vue.nextTick();
  assert.match(background(), /dark-bg\.png/);
  store.setTheme(AppTheme.LIGHT);
  preferredDark.value = true;
  await vue.nextTick();
  assert.equal(store.logoImage.value, "/light.png");
  assert.match(background(), /light-bg\.png/);

  store.setTheme(AppTheme.AUTO);
  assert.equal(store.logoImage.value, "/dark.png");
  await vue.nextTick();
  assert.match(background(), /dark-bg\.png/);
  preferredDark.value = false;
  await vue.nextTick();
  assert.equal(store.logoImage.value, "/light.png");
  await store.initAppTheme();
  assert.match(background(), /light-bg\.png/);

  await backend.schema.write({ backgroundImageLight: null });
  await store.initAppTheme();
  assert.equal(store.hasBgImage.value, false);
  assert.equal(background(), "");
  await backend.schema.write({ backgroundImagePerTheme: false });
  await store.initAppTheme();
  assert.match(background(), /shared-bg\.png/);
  store.setTheme(AppTheme.DARK);
  await store.initAppTheme();
  assert.match(background(), /shared-bg\.png/);
  await backend.schema.write({ backgroundImagePerTheme: true });
  await store.initAppTheme();
  assert.match(background(), /dark-bg\.png/);
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
  const appearance = { logoImage: "/legacy.png", backgroundImage: "/legacy.png" };
  const { store } = await storeFixture(t, async () => appearance);
  assert.equal(store.logoImage.value, "/legacy.png");
  store.setTheme(AppTheme.DARK);
  await store.initAppTheme();
  assert.equal(store.logoImage.value, "/legacy.png");
  assert.equal(store.hasBgImage.value, true);
  assert.equal(document.body.classList.contains("app-background-image"), true);
  assert.equal(document.body.classList.contains("app-dark-theme"), true);
  assert.equal(document.body.style.getPropertyValue("--app-background-blur"), "5px");
  assert.match(document.body.style.getPropertyValue("--app-background-image"), /legacy\.png/);
  assert.equal(document.body.style.backgroundImage, "");
  assert.equal(document.body.style.filter, "");

  appearance.backgroundImageBlur = 0;
  await store.initAppTheme();
  assert.equal(document.body.style.getPropertyValue("--app-background-blur"), "0px");

  appearance.backgroundImage = "";
  await store.initAppTheme();
  assert.equal(store.hasBgImage.value, false);
  assert.equal(document.body.classList.contains("app-background-image"), false);
  assert.equal(document.body.classList.contains("app-dark-theme"), true);
  assert.equal(document.body.style.getPropertyValue("--app-background-blur"), "");
  assert.equal(document.body.style.getPropertyValue("--app-background-image"), "");
});
