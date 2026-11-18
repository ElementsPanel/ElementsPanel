const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, test } = require("node:test");
const { createLoader, createBrowser, compileSfc, mountSetup, from, settle } = require("./helpers.cjs");

const load = createLoader({
  resolve(id, { filename, localRequire, load, overrides }) {
    if (id.endsWith(".vue")) return {};
    const target = path.resolve(path.dirname(filename), id) + ".ts";
    return id.startsWith(".") && fs.existsSync(target) ? load(target, overrides) : localRequire(id);
  }
});

test("desktop wallpaper settings persist, clear images and reject invalid or failed writes", async () => {
  const router = new (from("panel")("@koa/router"))();
  let stored;
  let fail = false;
  let form;
  const storage = {
    load: async () => stored,
    async store(_category, _uuid, value) {
      if (fail) throw new Error("disk full");
      stored = structuredClone(value);
    }
  };
  const ctx = {
    i18n: { define() {}, $t: key => key },
    koa: { router: () => router },
    middleware: { permission: () => async (_request, next) => next() },
    roles: { USER: 1 },
    storage: { getStorage: () => storage },
    settingsForm: { declare: value => { form = value; } },
    inject: (_services, callback) => callback(ctx)
  };
  const { apply } = load("plugins/desktop/panel/src/backend/index.ts", {
    "../i18n": { localeMessages: {} }
  });
  await apply(ctx);
  assert.deepEqual(form.fields().map(field => field.key), ["wallpaperMode", "wallpaperImage"]);
  assert.deepEqual(form.fields()[0].options.map(item => item.value), ["website", "image"]);
  const route = router.stack.find(entry => entry.path === "/desktop_settings");
  assert.equal(route.stack.length, 1, "wallpaper must be readable on the desktop login screen");
  const request = {};
  const current = async () => {
    await router.stack.filter(entry => entry.path === "/desktop_settings").at(-1).stack[0](request);
    return request.body;
  };
  assert.deepEqual(await current(), {
    wallpaperMode: "website", wallpaperImage: ""
  });
  await form.write({ wallpaperMode: "image", wallpaperImage: "/wallpaper.png" });
  assert.equal((await current()).wallpaperImage, "/wallpaper.png");
  await apply(ctx);
  assert.equal(form.read().wallpaperImage, "/wallpaper.png");
  await form.write({ wallpaperImage: null });
  assert.equal((await current()).wallpaperImage, "");
  await form.write({ wallpaperMode: "website" });
  const saved = await current();
  for (const invalid of [
    { wallpaperMode: "unknown" }, { wallpaperMode: "color" }, { wallpaperImage: 1 }
  ]) await assert.rejects(form.write(invalid), /WALLPAPER_INVALID/);
  assert.deepEqual(await current(), saved);
  fail = true;
  await assert.rejects(form.write({ wallpaperImage: "/new.png" }), /disk full/);
  assert.deepEqual(await current(), saved);
});

const dom = createBrowser();
after(() => dom.window.close());
const vue = from("frontend")("vue");

function desktopFixture(t, settings, appearance = { backgroundImage: "/website wallpaper.png" }) {
  const dark = vue.ref(false);
  let currentSettings = settings;
  let failSettings = false;
  let failAppearance = false;
  let reads = 0;
  const component = load("plugins/desktop/panel/src/Desktop.vue", {
    "@elementspanel/epanel-plugin-i18n": { t: key => key },
    "@elementspanel/epanel-plugin-console/stores/useAppConfigStore": { useAppConfigStore: () => ({ isDarkTheme: dark }) },
    "@elementspanel/epanel-plugin-console/stores/useAppStateStore": { useAppStateStore: () => ({
      state: {}, isAdmin: vue.ref(false), isLogged: vue.ref(false), authEnabled: vue.ref(true)
    }) },
    "@elements-panel/sdk": {
      usePluginService: () => undefined,
      ctx: { desktop: { apps: [], views: [], provideOpener: () => () => {} }, actions: { instances: [] } }
    },
    "@elementspanel/epanel-plugin-console/services/apis": {},
    "@elementspanel/epanel-plugin-console/tools/vuetifyModal": {},
    "@elementspanel/epanel-plugin-console/services/apis/appearance": { getAppearance: () => ({
      execute: async () => {
        if (failAppearance) throw new Error("appearance unavailable");
        return { value: appearance };
      }
    }) },
    "./api": {
      getDesktopSettings: () => ({ execute: async () => {
        reads++;
        if (failSettings) throw new Error("settings unavailable");
        return { value: currentSettings };
      } }),
      getDesktopLayoutConfig: () => ({}), setDesktopLayoutConfig: () => ({})
    },
    "vuetify/components": {},
    "vue-router": { useRouter: () => ({}) }
  }, compileSfc("plugins/desktop/panel/src/Desktop.vue")).default;
  const { state } = mountSetup(t, component);
  const refresh = async (next = currentSettings) => {
    currentSettings = next;
    window.dispatchEvent(new CustomEvent("elementspanel:plugin-settings-changed", { detail: { id: "desktop" } }));
    await settle();
  };
  return {
    state, dark, refresh, reads: () => reads,
    failSettings: () => { failSettings = true; }, failAppearance: () => { failAppearance = true; }
  };
}

test("desktop wallpaper follows the website, updates after saves and respects theme overlays", async (t) => {
  const appearance = { backgroundImage: "/website wallpaper.png", backgroundImageBlur: 32 };
  const f = desktopFixture(t, undefined, appearance);
  await settle();
  assert.match(f.state.wallpaperStyle.backgroundImage, /website wallpaper\.png/);
  assert.match(f.state.wallpaperStyle.backgroundImage, /255,255,255,0\.2/);
  assert.equal(f.state.wallpaperStyle.filter, "blur(32px)");
  assert.equal(f.state.wallpaperStyle.inset, "-96px");
  appearance.backgroundImageBlur = 0;
  await f.refresh();
  assert.equal(f.state.wallpaperStyle.filter, "blur(0px)");
  assert.equal(f.state.wallpaperStyle.inset, "0px");
  f.dark.value = true;
  assert.match(f.state.wallpaperStyle.backgroundImage, /0,0,0,0\.65/);
  appearance.backgroundImageBlur = 32;
  await f.refresh({ wallpaperMode: "image", wallpaperImage: "/custom (wallpaper).png" });
  assert.match(f.state.wallpaperStyle.backgroundImage, /custom \(wallpaper\)\.png/);
  assert.match(f.state.wallpaperStyle.backgroundImage, /rgba\(0,0,0,0\.65\)/);
  assert.equal(f.state.wallpaperStyle.filter, "blur(0px)");
  await f.refresh({ wallpaperMode: "image", wallpaperImage: "" });
  assert.match(f.state.wallpaperStyle.backgroundColor, /#232429/);
  f.dark.value = false;
  assert.match(f.state.wallpaperStyle.backgroundColor, /#f5f5f5/);
  const reads = f.reads();
  window.dispatchEvent(new CustomEvent("elementspanel:plugin-settings-changed", { detail: { id: "terminal" } }));
  await settle();
  assert.equal(f.reads(), reads);
});

test("custom wallpapers work without site appearance and legacy panels retain their website background", async (t) => {
  const f = desktopFixture(t);
  f.failSettings();
  await f.refresh();
  assert.match(f.state.wallpaperStyle.backgroundImage, /website wallpaper\.png/);
  assert.equal(f.state.wallpaperStyle.filter, "blur(5px)");
  const custom = desktopFixture(t, { wallpaperMode: "image", wallpaperImage: "/custom.png" });
  custom.failAppearance();
  await custom.refresh();
  assert.match(custom.state.wallpaperStyle.backgroundImage, /custom\.png/);
});
