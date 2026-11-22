const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, test } = require("node:test");
const {
  createLoader,
  createBrowser,
  compileSfc,
  mountSetup,
  from,
  settle
} = require("./helpers.cjs");

const load = createLoader({
  resolve(id, { filename, localRequire, load, overrides }) {
    if (id.endsWith(".vue")) return {};
    const target = path.resolve(path.dirname(filename), id) + ".ts";
    return id.startsWith(".") && fs.existsSync(target) ? load(target, overrides) : localRequire(id);
  }
});
const instanceContract = load("core/common/src/instance_contract.ts");
const { resolveBackgroundImage } = load("plugins/console/panel/src/services/apis/appearance.ts", {
  "@/stores/useDefineApi": { useDefineApi: () => () => ({}) }
});

test("desktop appearance settings persist, clear images and reject invalid or failed writes", async () => {
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
    i18n: { define() {}, $t: (key) => key },
    koa: { router: () => router },
    middleware: { permission: () => async (_request, next) => next() },
    roles: { USER: 1 },
    storage: { getStorage: () => storage },
    settingsForm: {
      declare: (value) => {
        form = value;
      }
    },
    inject: (_services, callback) => callback(ctx)
  };
  const { apply } = load("plugins/desktop/panel/src/backend/index.ts", {
    "../i18n": { localeMessages: {} }
  });
  await apply(ctx);
  assert.deepEqual(
    form.fields().map((field) => field.key),
    [
      "startButtonIconPerTheme",
      "startButtonIcon",
      "startButtonIconLight",
      "startButtonIconDark",
      "wallpaperMode",
      "wallpaperImagePerTheme",
      "wallpaperImage",
      "wallpaperImageLight",
      "wallpaperImageDark",
      "wallpaperBlurFollowConsole",
      "wallpaperBlur"
    ]
  );
  assert.deepEqual(
    form
      .fields()
      .find((field) => field.key === "wallpaperMode")
      .options.map((item) => item.value),
    ["website", "image"]
  );
  const iconFields = form
    .fields()
    .filter((field) => field.key.startsWith("startButtonIcon") && field.type === "string");
  assert.ok(iconFields.every((field) => field.fileUpload));
  assert.deepEqual(
    iconFields.map((field) => field.visibleWhen),
    ["startButtonIconPerTheme=false", "startButtonIconPerTheme", "startButtonIconPerTheme"]
  );
  const route = router.stack.find((entry) => entry.path === "/desktop_settings");
  assert.equal(route.stack.length, 1, "wallpaper must be readable on the desktop login screen");
  const request = {};
  const current = async () => {
    await router.stack
      .filter((entry) => entry.path === "/desktop_settings")
      .at(-1)
      .stack[0](request);
    return request.body;
  };
  assert.deepEqual(await current(), {
    wallpaperMode: "website",
    wallpaperImage: "",
    wallpaperImagePerTheme: false,
    wallpaperImageLight: "",
    wallpaperImageDark: "",
    wallpaperBlurFollowConsole: true,
    wallpaperBlur: 5,
    startButtonIcon: "",
    startButtonIconPerTheme: false,
    startButtonIconLight: "",
    startButtonIconDark: ""
  });
  await form.write({
    wallpaperMode: "image",
    wallpaperImage: "/wallpaper.png",
    wallpaperBlurFollowConsole: false,
    wallpaperBlur: 0,
    startButtonIcon: "/start.png"
  });
  assert.equal((await current()).wallpaperImage, "/wallpaper.png");
  assert.equal((await current()).wallpaperImageLight, "/wallpaper.png");
  assert.equal((await current()).wallpaperImageDark, "/wallpaper.png");
  assert.equal((await current()).startButtonIconLight, "/start.png");
  assert.equal((await current()).startButtonIconDark, "/start.png");
  await form.write({
    wallpaperImagePerTheme: true,
    wallpaperImageLight: "/light.png",
    wallpaperImageDark: "/dark.png",
    startButtonIconPerTheme: true,
    startButtonIconLight: "/start-light.png",
    startButtonIconDark: "/start-dark.png"
  });
  await apply(ctx);
  assert.equal(form.read().wallpaperImage, "/wallpaper.png");
  assert.equal(form.read().wallpaperBlurFollowConsole, false);
  assert.equal(form.read().wallpaperBlur, 0);
  assert.equal(form.read().wallpaperImagePerTheme, true);
  assert.equal(form.read().wallpaperImageLight, "/light.png");
  assert.equal(form.read().wallpaperImageDark, "/dark.png");
  assert.equal(form.read().startButtonIcon, "/start.png");
  assert.equal(form.read().startButtonIconPerTheme, true);
  assert.equal(form.read().startButtonIconLight, "/start-light.png");
  assert.equal(form.read().startButtonIconDark, "/start-dark.png");
  await form.write({ startButtonIconLight: null, startButtonIcon: null });
  assert.equal((await current()).startButtonIconLight, "");
  assert.equal((await current()).startButtonIcon, "");
  assert.equal((await current()).startButtonIconDark, "/start-dark.png");
  await form.write({ wallpaperImageLight: null });
  assert.equal((await current()).wallpaperImageLight, "");
  assert.equal((await current()).wallpaperImageDark, "/dark.png");
  await form.write({ wallpaperImage: null });
  assert.equal((await current()).wallpaperImage, "");
  await form.write({ wallpaperMode: "website" });
  const saved = await current();
  for (const invalid of [
    { wallpaperMode: "unknown" },
    { wallpaperMode: "color" },
    { wallpaperImage: 1 },
    { wallpaperBlurFollowConsole: "false" },
    { wallpaperBlur: -1 },
    { wallpaperBlur: 51 },
    { wallpaperBlur: Infinity },
    { wallpaperBlur: "5" },
    { wallpaperBlur: null },
    { wallpaperImagePerTheme: "true" },
    { wallpaperImageLight: 1 },
    { wallpaperImageDark: false },
    { wallpaperImageLight: "/".repeat(8193) },
    { wallpaperImageDark: "/".repeat(8193) },
    { startButtonIconPerTheme: "true" },
    { startButtonIcon: 1 },
    { startButtonIconLight: false },
    { startButtonIconDark: 1 },
    { startButtonIcon: "/".repeat(8193) },
    { startButtonIconLight: "/".repeat(8193) },
    { startButtonIconDark: "/".repeat(8193) }
  ])
    await assert.rejects(form.write(invalid), /DESKTOP_SETTINGS_INVALID/);
  assert.deepEqual(await current(), saved);
  fail = true;
  await assert.rejects(form.write({ wallpaperImage: "/new.png" }), /disk full/);
  await assert.rejects(form.write({ startButtonIconDark: "/new-start.png" }), /disk full/);
  assert.deepEqual(await current(), saved);
});

const dom = createBrowser();
after(() => dom.window.close());
const vue = from("frontend")("vue");
const pointerDrag = load("plugins/console/panel/src/hooks/usePointerDrag.ts", { vue });

function pointer(type, element = window, x = 10, y = 10, options = {}) {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0,
    clientX: x,
    clientY: y,
    ...options
  });
  Object.defineProperties(event, {
    pointerId: { value: options.pointerId ?? 1 },
    pointerType: { value: options.pointerType ?? "mouse" },
    isPrimary: { value: true }
  });
  element.dispatchEvent(event);
  return event;
}

test("instance shortcuts persist per user and invalid layouts leave saved shortcuts intact", async (t) => {
  const previousDirectory = process.cwd();
  const directory = await fs.promises.mkdtemp(
    path.join(require("node:os").tmpdir(), "elements-instance-shortcuts-")
  );
  t.after(async () => {
    process.chdir(previousDirectory);
    await fs.promises.rm(directory, { recursive: true, force: true });
  });
  process.chdir(directory);
  const { getDesktopLayout, setDesktopLayout } = load(
    "plugins/desktop/panel/src/backend/desktop-layout-service.ts"
  );
  const logger = { error() {} };
  const shortcut = { instanceId: "one", daemonId: "node", name: "Server" };
  const layout = {
    windows: [],
    shortcuts: ["instances"],
    instanceShortcuts: [shortcut],
    icons: [{ id: instanceContract.getInstanceShortcutId(shortcut), x: 16, y: 16 }]
  };
  setDesktopLayout("alice", structuredClone(layout), logger);
  const saved = getDesktopLayout("alice", logger);
  assert.deepEqual(saved.instanceShortcuts, [shortcut]);
  assert.deepEqual(saved.icons, layout.icons);
  assert.equal(getDesktopLayout("bob", logger), null);
  for (const invalid of [
    { instanceShortcuts: {} },
    { instanceShortcuts: [{ instanceId: "one", name: "Missing node" }] },
    { instanceShortcuts: [{ ...shortcut, daemonId: "../node" }] },
    { instanceShortcuts: [{ ...shortcut, name: "x".repeat(201) }] },
    { instanceShortcuts: Array(100).fill(shortcut) }
  ])
    assert.throws(() =>
      setDesktopLayout("alice", { ...structuredClone(layout), ...invalid }, logger)
    );
  assert.deepEqual(getDesktopLayout("alice", logger), saved);
});

for (const [view, selector] of [
  ["DesktopMyApps", ".ma-instance"],
  ["DesktopInstanceManager", ".dim-instance"]
]) {
  test(`${view} uses a pointer drag preview, preserves clicks and cleans up cancelled drags`, async (t) => {
    const Vuetify = from("frontend")("vuetify/dist/vuetify.js");
    const instance = {
      instanceUuid: "one",
      daemonId: "node",
      nickname: "Server",
      config: { nickname: "Server", tag: [] },
      status: 0,
      info: {}
    };
    const api = (value) => () => ({ execute: async () => ({ value }) });
    const calls = [];
    const operations = Object.fromEntries(
      [
        "batchDelete",
        "batchKill",
        "batchRestart",
        "batchStart",
        "batchStop",
        "killInstance",
        "openInstance",
        "restartInstance",
        "stopInstance",
        "updateInstanceConfig"
      ].map((name) => [
        name,
        () => ({
          execute: async () => {
            calls.push(name);
          }
        })
      ])
    );
    const file = `plugins/instance/panel/src/desktop/${view}.vue`;
    const component = load(
      file,
      {
        vue,
        "@elements-panel/sdk": { ...instanceContract, usePluginService: () => undefined },
        "@elementspanel/epanel-plugin-i18n": { t: (key) => key },
        "@elementspanel/epanel-plugin-console/components/Empty": {},
        "@elementspanel/epanel-plugin-console/components/DesktopDialog": {},
        "@elementspanel/epanel-plugin-console/hooks/useInstance": { INSTANCE_TYPE_TRANSLATION: {} },
        "@elementspanel/epanel-plugin-console/hooks/usePointerDrag": pointerDrag,
        "@elementspanel/epanel-plugin-console/hooks/usePolling": { usePolling() {} },
        "@elementspanel/epanel-plugin-console/hooks/useInstanceTag": {
          useInstanceTagTips: () => ({ tagTips: vue.ref([]), updateTagTips() {} }),
          useInstanceTagSearch: () => ({
            tags: vue.ref([]),
            setRefreshFn() {},
            selectTag() {},
            removeTag() {},
            isTagSelected() {},
            clearTags() {}
          })
        },
        "@elementspanel/epanel-plugin-console/tools/desktopNotice": {
          notifyDesktop() {},
          notifyDesktopError() {}
        },
        "@elementspanel/epanel-plugin-console/types/const": {
          INSTANCE_STATUS_CODE: { BUSY: -1, STOPPED: 0, STOPPING: 1, STARTING: 2, RUNNING: 3 }
        },
        "@elementspanel/epanel-plugin-console/services/apis": {
          userInfoApiAdvanced: api({ instances: [instance] }),
          remoteNodeList: api([{ uuid: "node", available: true, ip: "localhost", port: 1234 }]),
          remoteInstances: api({ data: [instance], maxPage: 1, allTags: [] })
        },
        "@elementspanel/epanel-plugin-console/services/apis/instance": operations,
        "vuetify/components": Vuetify.components
      },
      compileSfc(file, { inlineTemplate: true })
    ).default;
    const target = document.createElement("div");
    document.body.appendChild(target);
    const app = vue.createApp({
      render: () => vue.h(component, { onOpenConsole: () => calls.push("console") })
    });
    app.use(Vuetify.createVuetify());
    app.mount(target);
    let mounted = true;
    t.after(() => {
      if (mounted) app.unmount();
      target.remove();
    });
    await settle();
    await vue.nextTick();
    const row = target.querySelector(selector);
    assert.ok(row);
    assert.equal(row.draggable, false);
    const nativeDrag = new window.Event("dragstart", { bubbles: true, cancelable: true });
    row.dispatchEvent(nativeDrag);
    assert.equal(nativeDrag.defaultPrevented, true);
    const drops = [];
    const recordDrop = (event) => drops.push(event.detail);
    window.addEventListener(instanceContract.INSTANCE_SHORTCUT_DROP_EVENT, recordDrop);
    const previousElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => row;
    t.after(() => {
      window.removeEventListener(instanceContract.INSTANCE_SHORTCUT_DROP_EVENT, recordDrop);
      document.elementFromPoint = previousElementFromPoint;
    });
    const click = () =>
      row.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })
      );
    const preview = () => document.querySelector(".instance-shortcut-drag-preview");
    const canSelectText = () =>
      document.dispatchEvent(new window.Event("selectstart", { cancelable: true }));
    assert.equal(pointer("pointerdown", row).defaultPrevented, true);
    assert.equal(canSelectText(), false);
    pointer("pointermove", window, 20, 15);
    assert.equal(preview(), null, "small movement stays a normal click");
    pointer("pointerup");
    assert.equal(canSelectText(), true);
    click();
    assert.deepEqual(calls, ["console"]);
    calls.length = 0;

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(row);
    selection.addRange(range);
    assert.ok(selection.toString());
    pointer("pointerdown", row);
    assert.equal(pointer("pointermove", window, 40, 25).defaultPrevented, true);
    await vue.nextTick();
    assert.equal(selection.rangeCount, 0);
    assert.equal(preview().textContent, "Server");
    assert.equal(preview().style.position, "fixed");
    assert.equal(preview().style.pointerEvents, "none");
    assert.equal(preview().style.borderRadius, "14px");
    assert.equal(preview().style.transform, "translate(52px, 39px)");
    assert.equal(row.classList.contains(`${selector.slice(1)}--dragging`), true);
    pointer("pointermove", window, 150, 120);
    assert.equal(preview().style.transform, "translate(162px, 134px)");
    pointer("pointerup", window, 150, 120, { pointerId: 2 });
    assert.ok(preview(), "another pointer must not finish the drag");
    pointer("pointerup", window, 150, 120);
    assert.equal(canSelectText(), true);
    await vue.nextTick();
    assert.equal(preview(), null);
    assert.equal(row.classList.contains(`${selector.slice(1)}--dragging`), false);
    assert.deepEqual(drops, [
      {
        shortcut: { instanceId: "one", daemonId: "node", name: "Server" },
        clientX: 150,
        clientY: 120
      }
    ]);
    click();
    assert.deepEqual(calls, []);
    pointer("pointerdown", row);
    pointer("pointerup");
    click();
    assert.deepEqual(calls, ["console"]);

    for (const reason of ["pointercancel", "blur", "buttons", "unmount"]) {
      pointer("pointerdown", row);
      pointer("pointermove", window, 40, 25);
      assert.ok(preview());
      if (reason === "blur") window.dispatchEvent(new window.Event("blur"));
      else if (reason === "buttons") pointer("pointermove", window, 50, 30, { buttons: 0 });
      else if (reason === "unmount") {
        app.unmount();
        mounted = false;
      } else pointer("pointercancel");
      assert.equal(preview(), null);
      assert.equal(canSelectText(), true, "ending or cancelling a drag restores text selection");
      pointer("pointermove", window, 150, 120);
      pointer("pointerup", window, 150, 120);
      assert.equal(drops.length, 1, "cancelled drags never add a shortcut");
    }
  });
}

function desktopFixture(t, settings, appearance = { backgroundImage: "/website wallpaper.png" }) {
  const dark = vue.ref(false);
  let currentSettings = settings;
  let failSettings = false;
  let failAppearance = false;
  let reads = 0;
  const component = load(
    "plugins/desktop/panel/src/Desktop.vue",
    {
      "@elementspanel/epanel-plugin-i18n": { t: (key) => key },
      "@elementspanel/epanel-plugin-console/stores/useAppConfigStore": {
        useAppConfigStore: () => ({ isDarkTheme: dark })
      },
      "@elementspanel/epanel-plugin-console/stores/useAppStateStore": {
        useAppStateStore: () => ({
          state: {},
          isAdmin: vue.ref(false),
          isLogged: vue.ref(false),
          authEnabled: vue.ref(true)
        })
      },
      "@elements-panel/sdk": {
        ...instanceContract,
        usePluginService: () => undefined,
        ctx: {
          desktop: { apps: [], views: [], provideOpener: () => () => {} },
          actions: { instances: [] }
        }
      },
      "@elementspanel/epanel-plugin-console/services/apis": {},
      "@elementspanel/epanel-plugin-console/tools/vuetifyModal": {},
      "@elementspanel/epanel-plugin-console/services/apis/appearance": {
        resolveBackgroundImage,
        getAppearance: () => ({
          execute: async () => {
            if (failAppearance) throw new Error("appearance unavailable");
            return { value: structuredClone(appearance) };
          }
        })
      },
      "./api": {
        getDesktopSettings: () => ({
          execute: async () => {
            reads++;
            if (failSettings) throw new Error("settings unavailable");
            return { value: currentSettings };
          }
        }),
        getDesktopLayoutConfig: () => ({}),
        setDesktopLayoutConfig: () => ({})
      },
      "vuetify/components": {},
      "vue-router": { useRouter: () => ({}) }
    },
    compileSfc("plugins/desktop/panel/src/Desktop.vue")
  ).default;
  const { state } = mountSetup(t, component);
  const refresh = async (next = currentSettings) => {
    currentSettings = next;
    window.dispatchEvent(
      new CustomEvent("elementspanel:plugin-settings-changed", { detail: { id: "desktop" } })
    );
    await settle();
  };
  return {
    state,
    dark,
    refresh,
    reads: () => reads,
    failSettings: () => {
      failSettings = true;
    },
    failAppearance: () => {
      failAppearance = true;
    }
  };
}

function taskbarComponent(dark = vue.ref(false)) {
  const Vuetify = from("frontend")("vuetify/dist/vuetify.js");
  const file = "plugins/desktop/panel/src/widgets/desktop/DesktopTaskbar.vue";
  const Taskbar = load(
    file,
    {
      "@elementspanel/epanel-plugin-console/config/router": { router: { push() {} } },
      "@elementspanel/epanel-plugin-i18n": { t: (key) => key },
      "@elementspanel/epanel-plugin-console/stores/useAppConfigStore": {
        useAppConfigStore: () => ({ isDarkTheme: dark })
      },
      "@elementspanel/epanel-plugin-console/hooks/useThemeSwitch": { useThemeSwitch: () => ({}) },
      "@elementspanel/epanel-plugin-console/hooks/usePointerDrag": pointerDrag,
      "@elementspanel/epanel-plugin-console/components/ActionRipple": {},
      "@elements-panel/sdk": { ctx: { slots: { entries: () => [] } } },
      "../../assets": {
        desktopIconUrl: "/builtin-dark.svg",
        desktopIconDarkUrl: "/builtin-light.svg"
      },
      "vuetify/components": Vuetify.components
    },
    compileSfc(file, { inlineTemplate: true })
  ).default;
  return { Taskbar, Vuetify };
}

test("taskbar Start icons follow shared and per-theme settings, refresh after saves and restore built-in icons", async (t) => {
  const f = desktopFixture(t);
  await settle();
  const { Taskbar, Vuetify } = taskbarComponent(f.dark);
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = vue.createApp({
    render: () =>
      vue.h(Taskbar, {
        windows: [],
        apps: [],
        username: "test",
        startButtonIcon: f.state.startButtonIcon
      })
  });
  app.use(Vuetify.createVuetify());
  app.mount(target);
  t.after(() => {
    app.unmount();
    target.remove();
  });
  const icon = () => target.querySelector(".taskbar__start img").getAttribute("src");
  assert.equal(icon(), "/builtin-light.svg");
  f.dark.value = true;
  await vue.nextTick();
  assert.equal(icon(), "/builtin-dark.svg");

  const settings = { startButtonIcon: "/shared-start.png" };
  await f.refresh(settings);
  assert.equal(icon(), "/shared-start.png");
  f.dark.value = false;
  await vue.nextTick();
  assert.equal(icon(), "/shared-start.png");
  await f.refresh({
    ...settings,
    startButtonIconPerTheme: true,
    startButtonIconLight: "/light-start.png"
  });
  assert.equal(icon(), "/light-start.png");
  f.dark.value = true;
  await vue.nextTick();
  assert.equal(icon(), "/shared-start.png");

  const themed = {
    ...settings,
    startButtonIconPerTheme: true,
    startButtonIconLight: "/light-start.png",
    startButtonIconDark: "/dark-start.png"
  };
  await f.refresh(themed);
  assert.equal(icon(), "/dark-start.png");
  f.dark.value = false;
  await vue.nextTick();
  assert.equal(icon(), "/light-start.png");
  await f.refresh({ ...themed, startButtonIconLight: "" });
  assert.equal(icon(), "/builtin-light.svg");
  f.dark.value = true;
  await vue.nextTick();
  assert.equal(icon(), "/dark-start.png");
  await f.refresh({ ...themed, startButtonIconPerTheme: false });
  assert.equal(icon(), "/shared-start.png");
  await f.refresh({ ...themed, startButtonIconPerTheme: false, startButtonIcon: "" });
  assert.equal(icon(), "/builtin-dark.svg");
});

function taskbarDragFixture(t) {
  const { Taskbar, Vuetify } = taskbarComponent();
  const windows = vue.ref(
    ["a", "b", "c"].map((id) => ({
      id,
      title: id,
      icon: "mdi-folder",
      active: id === "b",
      minimized: id === "c"
    }))
  );
  const events = { orders: [], toggles: [], shortcuts: [], opens: [], unrelatedDrops: 0 };
  const target = document.createElement("div");
  document.body.appendChild(target);
  target.addEventListener("dragover", () => events.unrelatedDrops++);
  target.addEventListener("drop", () => events.unrelatedDrops++);
  const app = vue.createApp({
    render: () =>
      vue.h(Taskbar, {
        windows: windows.value,
        apps: [{ id: "app", label: "App", icon: "mdi-folder" }],
        username: "test",
        "onReorder-windows": (ids) => {
          events.orders.push(ids);
          windows.value = ids.map((id) => windows.value.find((win) => win.id === id));
        },
        "onToggle-window": (id) => {
          events.toggles.push(id);
        },
        "onAdd-shortcut": (...args) => {
          events.shortcuts.push(args);
        },
        "onOpen-app": (id) => {
          events.opens.push(id);
        }
      })
  });
  app.use(Vuetify.createVuetify());
  app.mount(target);
  t.after(() => {
    app.unmount();
    target.remove();
  });
  const data = new Map();
  const transfer = {
    types: ["text/plain"],
    effectAllowed: "",
    dropEffect: "",
    setData: (type, value) => data.set(type, value),
    getData: (type) => data.get(type) || ""
  };
  const dispatchDrag = (type, element, clientX = 25) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      dataTransfer: { value: transfer },
      clientX: { value: clientX },
      clientY: { value: 100 }
    });
    element.dispatchEvent(event);
    return event;
  };
  const button = (id) => target.querySelector(`[data-window-id="${id}"]`);
  const drag = (type, id, clientX = 25) => {
    button(id).getBoundingClientRect = () => ({ left: 0, width: 100, right: 100 });
    return dispatchDrag(type, button(id).querySelector(".taskbar__window-title"), clientX);
  };
  const displayed = () =>
    [...target.querySelectorAll("[data-window-id]")].map((button) => button.dataset.windowId);
  return { windows, events, target, transfer, button, drag, dispatchDrag, displayed };
}

test("taskbar windows make room during drag and save inside or outside drops without toggling windows", async (t) => {
  const f = taskbarDragFixture(t);
  await vue.nextTick();
  f.drag("dragstart", "c");
  assert.equal(f.drag("dragover", "a").defaultPrevented, true);
  await vue.nextTick();
  assert.deepEqual(f.displayed(), ["c", "a", "b"]);
  assert.deepEqual(
    f.windows.value.map((win) => win.id),
    ["a", "b", "c"]
  );
  assert.deepEqual(f.events.orders, []);

  f.windows.value = f.windows.value.map((win) => ({ ...win, title: `${win.title} live` }));
  await vue.nextTick();
  assert.deepEqual(f.displayed(), ["c", "a", "b"]);
  assert.match(f.button("b").textContent, /b live/);
  assert.equal(f.button("c").classList.contains("taskbar__window-btn--dragging"), true);
  f.drag("drop", "a");
  await vue.nextTick();
  assert.deepEqual(
    f.windows.value.map((win) => win.id),
    ["c", "a", "b"]
  );
  assert.equal(f.windows.value.find((win) => win.id === "c").minimized, true);
  assert.equal(f.button("b").classList.contains("taskbar__window-btn--active"), true);

  f.target.querySelector(".taskbar__start").click();
  await vue.nextTick();
  f.drag("dragstart", "c");
  f.drag("dragover", "b", 75);
  await vue.nextTick();
  assert.deepEqual(f.displayed(), ["a", "b", "c"]);
  f.drag("dragleave", "c");
  const overlay = f.target.querySelector(".start-menu-overlay");
  assert.equal(f.dispatchDrag("dragover", overlay).defaultPrevented, true);
  assert.equal(f.dispatchDrag("drop", overlay).defaultPrevented, true);
  f.drag("dragend", "c");
  await vue.nextTick();
  assert.deepEqual(
    f.windows.value.map((win) => win.id),
    ["a", "b", "c"]
  );
  assert.deepEqual(f.events.orders, [
    ["c", "a", "b"],
    ["a", "b", "c"]
  ]);
  assert.deepEqual(f.events.shortcuts, []);
  assert.deepEqual(f.events.toggles, []);
  assert.equal(f.events.unrelatedDrops, 0);
  f.button("b").click();
  assert.deepEqual(f.events.toggles, ["b"]);
});

test("taskbar windows restore cancelled drags, scroll at edges and leave app shortcut dragging working", async (t) => {
  const f = taskbarDragFixture(t);
  await vue.nextTick();
  const row = f.target.querySelector(".taskbar__windows");
  Object.defineProperties(row, { scrollWidth: { value: 500 }, clientWidth: { value: 100 } });
  row.getBoundingClientRect = () => ({ left: 0, right: 100 });
  row.scrollLeft = 50;
  f.drag("dragstart", "a");
  f.drag("dragover", "c", 75);
  assert.equal(row.scrollLeft, 70);
  await vue.nextTick();
  assert.deepEqual(f.displayed(), ["b", "c", "a"]);
  f.drag("dragend", "a");
  await vue.nextTick();
  assert.deepEqual(f.displayed(), ["a", "b", "c"]);
  assert.deepEqual(f.events.orders, []);

  f.drag("dragstart", "c");
  f.drag("dragover", "a");
  await vue.nextTick();
  f.windows.value = f.windows.value.filter((win) => win.id !== "b");
  await vue.nextTick();
  for (let attempts = 0; f.button("b") && attempts < 100; attempts++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(f.displayed(), ["a", "c"]);
  assert.equal(f.target.querySelector(".taskbar__window-btn--dragging"), null);
  assert.equal(f.dispatchDrag("drop", f.target).defaultPrevented, false);
  assert.deepEqual(f.events.orders, []);

  f.target.querySelector(".taskbar__start").click();
  await vue.nextTick();
  let item = f.target.querySelector(".start-menu__app-item");
  assert.equal(item.draggable, false);
  assert.equal(f.dispatchDrag("dragstart", item).defaultPrevented, true);
  const clickItem = () =>
    item.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })
    );
  const preview = () => document.querySelector(".desktop-app-drag-preview");
  const previousElementFromPoint = document.elementFromPoint;
  document.elementFromPoint = () => f.target.querySelector(".taskbar__start-menu");
  t.after(() => {
    document.elementFromPoint = previousElementFromPoint;
  });
  pointer("pointerdown", item);
  pointer("pointermove", window, 20, 15);
  assert.equal(preview(), null);
  pointer("pointerup");
  clickItem();
  await vue.nextTick();
  assert.deepEqual(f.events.opens, ["app"]);
  assert.deepEqual(f.events.shortcuts, []);

  f.target.querySelector(".taskbar__start").click();
  await vue.nextTick();
  item = f.target.querySelector(".start-menu__app-item");
  pointer("pointerdown", item);
  pointer("pointermove", window, 40, 25);
  await vue.nextTick();
  assert.equal(preview().textContent, "App");
  assert.equal(preview().style.transform, "translate(52px, 39px)");
  assert.equal(item.classList.contains("start-menu__app-item--dragging"), true);
  pointer("pointercancel");
  assert.equal(preview(), null);
  assert.deepEqual(f.events.shortcuts, []);

  pointer("pointerdown", item);
  pointer("pointermove", window, 40, 25);
  pointer("pointerup", window, 40, 25);
  clickItem();
  await vue.nextTick();
  assert.deepEqual(
    f.events.shortcuts,
    [],
    "releasing inside the Start menu does not add a shortcut"
  );
  assert.deepEqual(f.events.opens, ["app"], "dragging must not launch the app");
  assert.ok(f.target.querySelector(".taskbar__start-menu"));

  document.elementFromPoint = () => f.target.querySelector(".start-menu-overlay");
  pointer("pointerdown", item);
  pointer("pointermove", window, 40, 25);
  pointer("pointerup", window, 25, 100);
  clickItem();
  await vue.nextTick();
  assert.equal(preview(), null);
  assert.deepEqual(f.events.shortcuts, [["app", 25, 100]]);
  assert.deepEqual(f.events.opens, ["app"]);
  assert.deepEqual(f.events.orders, []);
});

test("desktop wallpaper follows website and custom theme images, updates after saves and respects overlays", async (t) => {
  const appearance = {
    backgroundImage: "/shared.png",
    backgroundImageBlur: 32,
    backgroundImagePerTheme: true,
    backgroundImageLight: "/website wallpaper.png",
    backgroundImageDark: "/website dark.png"
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
    wallpaperMode: "image",
    wallpaperImage: "/custom (wallpaper).png",
    wallpaperImagePerTheme: true,
    wallpaperImageLight: "/custom light.png",
    wallpaperImageDark: "/custom dark.png"
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
  window.dispatchEvent(
    new CustomEvent("elementspanel:plugin-settings-changed", { detail: { id: "terminal" } })
  );
  await settle();
  assert.equal(f.reads(), reads);
});

test("desktop blur overrides console for both wallpaper sources and can resume following it", async (t) => {
  const appearance = { backgroundImage: "/website.png", backgroundImageBlur: 32 };
  const settings = {
    wallpaperMode: "website",
    wallpaperBlurFollowConsole: false,
    wallpaperBlur: 0
  };
  const f = desktopFixture(t, settings, appearance);
  await settle();
  assert.equal(f.state.wallpaperStyle.filter, "blur(0px)");

  appearance.backgroundImageBlur = 40;
  window.dispatchEvent(
    new CustomEvent("elementspanel:plugin-settings-changed", { detail: { id: "console" } })
  );
  await settle();
  assert.equal(f.state.wallpaperStyle.filter, "blur(0px)");

  const custom = {
    ...settings,
    wallpaperMode: "image",
    wallpaperImage: "/custom.png",
    wallpaperBlur: 12
  };
  await f.refresh(custom);
  assert.equal(f.state.wallpaperStyle.filter, "blur(12px)");
  assert.equal(f.state.wallpaperStyle.inset, "-36px");

  await f.refresh({ ...custom, wallpaperBlurFollowConsole: true });
  assert.equal(f.state.wallpaperStyle.filter, "blur(40px)");
  appearance.backgroundImageBlur = 8;
  window.dispatchEvent(
    new CustomEvent("elementspanel:plugin-settings-changed", { detail: { id: "console" } })
  );
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
    wallpaperMode: "image",
    wallpaperImage: "/custom.png",
    wallpaperBlurFollowConsole: false,
    wallpaperBlur: 15
  });
  custom.failAppearance();
  await custom.refresh();
  assert.match(custom.state.wallpaperStyle.backgroundImage, /custom\.png/);
  assert.equal(custom.state.wallpaperStyle.filter, "blur(15px)");
});
