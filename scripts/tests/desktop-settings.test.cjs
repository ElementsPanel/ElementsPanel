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
const { resolveBackgroundImage } = load("plugins/console/panel/src/services/apis/appearance.ts", {
  "@/stores/useDefineApi": { useDefineApi: () => () => ({}) }
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
  assert.deepEqual(form.fields().map(field => field.key),
    ["wallpaperMode", "wallpaperImagePerTheme", "wallpaperImage", "wallpaperImageLight",
      "wallpaperImageDark", "wallpaperBlurFollowConsole", "wallpaperBlur"]);
  assert.deepEqual(form.fields()[0].options.map(item => item.value), ["website", "image"]);
  const route = router.stack.find(entry => entry.path === "/desktop_settings");
  assert.equal(route.stack.length, 1, "wallpaper must be readable on the desktop login screen");
  const request = {};
  const current = async () => {
    await router.stack.filter(entry => entry.path === "/desktop_settings").at(-1).stack[0](request);
    return request.body;
  };
  assert.deepEqual(await current(), {
    wallpaperMode: "website", wallpaperImage: "", wallpaperImagePerTheme: false,
    wallpaperImageLight: "", wallpaperImageDark: "", wallpaperBlurFollowConsole: true, wallpaperBlur: 5
  });
  await form.write({
    wallpaperMode: "image", wallpaperImage: "/wallpaper.png",
    wallpaperBlurFollowConsole: false, wallpaperBlur: 0
  });
  assert.equal((await current()).wallpaperImage, "/wallpaper.png");
  assert.equal((await current()).wallpaperImageLight, "/wallpaper.png");
  assert.equal((await current()).wallpaperImageDark, "/wallpaper.png");
  await form.write({
    wallpaperImagePerTheme: true, wallpaperImageLight: "/light.png", wallpaperImageDark: "/dark.png"
  });
  await apply(ctx);
  assert.equal(form.read().wallpaperImage, "/wallpaper.png");
  assert.equal(form.read().wallpaperBlurFollowConsole, false);
  assert.equal(form.read().wallpaperBlur, 0);
  assert.equal(form.read().wallpaperImagePerTheme, true);
  assert.equal(form.read().wallpaperImageLight, "/light.png");
  assert.equal(form.read().wallpaperImageDark, "/dark.png");
  await form.write({ wallpaperImageLight: null });
  assert.equal((await current()).wallpaperImageLight, "");
  assert.equal((await current()).wallpaperImageDark, "/dark.png");
  await form.write({ wallpaperImage: null });
  assert.equal((await current()).wallpaperImage, "");
  await form.write({ wallpaperMode: "website" });
  const saved = await current();
  for (const invalid of [
    { wallpaperMode: "unknown" }, { wallpaperMode: "color" }, { wallpaperImage: 1 },
    { wallpaperBlurFollowConsole: "false" }, { wallpaperBlur: -1 }, { wallpaperBlur: 51 },
    { wallpaperBlur: Infinity }, { wallpaperBlur: "5" }, { wallpaperBlur: null },
    { wallpaperImagePerTheme: "true" }, { wallpaperImageLight: 1 }, { wallpaperImageDark: false },
    { wallpaperImageLight: "/".repeat(8193) }, { wallpaperImageDark: "/".repeat(8193) }
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
    "@elementspanel/epanel-plugin-console/services/apis/appearance": { resolveBackgroundImage, getAppearance: () => ({
      execute: async () => {
        if (failAppearance) throw new Error("appearance unavailable");
        return { value: structuredClone(appearance) };
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

test("desktop wallpaper follows website and custom theme images, updates after saves and respects overlays", async (t) => {
  const appearance = {
    backgroundImage: "/shared.png", backgroundImageBlur: 32, backgroundImagePerTheme: true,
    backgroundImageLight: "/website wallpaper.png", backgroundImageDark: "/website dark.png"
  };
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
  assert.match(f.state.wallpaperStyle.backgroundImage, /website dark\.png/);
  appearance.backgroundImageDark = "";
  await f.refresh();
  assert.match(f.state.wallpaperStyle.backgroundColor, /#232429/);
  f.dark.value = false;
  assert.match(f.state.wallpaperStyle.backgroundImage, /website wallpaper\.png/);
  appearance.backgroundImagePerTheme = false;
  await f.refresh();
  assert.match(f.state.wallpaperStyle.backgroundImage, /shared\.png/);
  f.dark.value = true;
  appearance.backgroundImageBlur = 32;
  await f.refresh({ wallpaperMode: "image", wallpaperImage: "/custom (wallpaper).png" });
  assert.match(f.state.wallpaperStyle.backgroundImage, /custom \(wallpaper\)\.png/);
  assert.match(f.state.wallpaperStyle.backgroundImage, /rgba\(0,0,0,0\.65\)/);
  assert.equal(f.state.wallpaperStyle.filter, "blur(32px)");
  const custom = {
    wallpaperMode: "image", wallpaperImage: "/custom (wallpaper).png", wallpaperImagePerTheme: true,
    wallpaperImageLight: "/custom light.png", wallpaperImageDark: "/custom dark.png"
  };
  await f.refresh(custom);
  assert.match(f.state.wallpaperStyle.backgroundImage, /custom dark\.png/);
  f.dark.value = false;
  assert.match(f.state.wallpaperStyle.backgroundImage, /custom light\.png/);
  await f.refresh({ ...custom, wallpaperImageLight: "" });
  assert.match(f.state.wallpaperStyle.backgroundColor, /#f5f5f5/);
  f.dark.value = true;
  assert.match(f.state.wallpaperStyle.backgroundImage, /custom dark\.png/);
  await f.refresh({ ...custom, wallpaperImagePerTheme: false });
  assert.match(f.state.wallpaperStyle.backgroundImage, /custom \(wallpaper\)\.png/);
  await f.refresh({ wallpaperMode: "image", wallpaperImage: "" });
  assert.match(f.state.wallpaperStyle.backgroundColor, /#232429/);
  f.dark.value = false;
  assert.match(f.state.wallpaperStyle.backgroundColor, /#f5f5f5/);
  const reads = f.reads();
  window.dispatchEvent(new CustomEvent("elementspanel:plugin-settings-changed", { detail: { id: "terminal" } }));
  await settle();
  assert.equal(f.reads(), reads);
});

test("desktop blur overrides console for both wallpaper sources and can resume following it", async (t) => {
  const appearance = { backgroundImage: "/website.png", backgroundImageBlur: 32 };
  const settings = { wallpaperMode: "website", wallpaperBlurFollowConsole: false, wallpaperBlur: 0 };
  const f = desktopFixture(t, settings, appearance);
  await settle();
  assert.equal(f.state.wallpaperStyle.filter, "blur(0px)");

  appearance.backgroundImageBlur = 40;
  window.dispatchEvent(new CustomEvent("elementspanel:plugin-settings-changed", { detail: { id: "console" } }));
  await settle();
  assert.equal(f.state.wallpaperStyle.filter, "blur(0px)");

  const custom = { ...settings, wallpaperMode: "image", wallpaperImage: "/custom.png", wallpaperBlur: 12 };
  await f.refresh(custom);
  assert.equal(f.state.wallpaperStyle.filter, "blur(12px)");
  assert.equal(f.state.wallpaperStyle.inset, "-36px");

  await f.refresh({ ...custom, wallpaperBlurFollowConsole: true });
  assert.equal(f.state.wallpaperStyle.filter, "blur(40px)");
  appearance.backgroundImageBlur = 8;
  window.dispatchEvent(new CustomEvent("elementspanel:plugin-settings-changed", { detail: { id: "console" } }));
  await settle();
  assert.equal(f.state.wallpaperStyle.filter, "blur(8px)");
});

test("custom wallpapers work without site appearance and legacy panels retain their website background", async (t) => {
  const f = desktopFixture(t);
  f.failSettings();
  await f.refresh();
  assert.match(f.state.wallpaperStyle.backgroundImage, /website wallpaper\.png/);
  assert.equal(f.state.wallpaperStyle.filter, "blur(5px)");
  const custom = desktopFixture(t, {
    wallpaperMode: "image", wallpaperImage: "/custom.png",
    wallpaperBlurFollowConsole: false, wallpaperBlur: 15
  });
  custom.failAppearance();
  await custom.refresh();
  assert.match(custom.state.wallpaperStyle.backgroundImage, /custom\.png/);
  assert.equal(custom.state.wallpaperStyle.filter, "blur(15px)");
});
