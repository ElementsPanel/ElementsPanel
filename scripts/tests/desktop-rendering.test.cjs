const assert = require("node:assert/strict");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { after, test } = require("node:test");
const { from, createBrowser, createLoader, compileSfc, deferred } = require("./helpers.cjs");

const browser = createBrowser();
after(() => browser.window.close());
const frontend = from("frontend");
const vue = frontend("vue");
const Vuetify = frontend("vuetify/dist/vuetify.js");
const root = path.resolve(__dirname, "../..");
const load = createLoader({
  host: "frontend",
  resolve(id, { filename, localRequire, load, overrides }) {
    if (id === "@/hooks/useDesktopWindowActivity")
      return load("plugins/console/panel/src/hooks/useDesktopWindowActivity.ts", overrides);
    if (id.endsWith(".vue")) {
      const relative = path.relative(root, path.resolve(path.dirname(filename), id));
      return load(relative, overrides, compileSfc(relative, { inlineTemplate: true })).default;
    }
    return localRequire(id);
  }
});
const flush = async () => {
  for (let i = 0; i < 8; i++) await vue.nextTick();
};
const frame = async () => {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await flush();
};
const pointer = (type, options = {}) =>
  new window.MouseEvent(type, { bubbles: true, button: 0, ...options });

async function desktopFixture(t, count = 20) {
  let opener;
  const counters = { mounts: 0, renders: 0, unmounts: 0 };
  const Body = vue.markRaw(
    vue.defineComponent({
      setup() {
        counters.mounts++;
        const value = vue.ref("original");
        vue.onUnmounted(() => {
          counters.unmounts++;
        });
        return () => {
          counters.renders++;
          return vue.h("div", { class: "test-window-scroll" }, [
            vue.h("input", {
              value: value.value,
              onInput: (event) => {
                value.value = event.target.value;
              }
            }),
            ...Array.from({ length: 50 }, (_, i) => vue.h("p", String(i)))
          ]);
        };
      }
    })
  );
  const views = vue.shallowReactive(
    Array.from({ length: count }, (_, i) => ({
      id: `view-${i}`,
      title: `View ${i}`,
      icon: "mdi-window-maximize",
      component: Body
    }))
  );
  const windows = views.map((view, i) => ({
    id: `window-${i}`,
    title: view.title,
    content: view.id,
    x: 100,
    y: 60,
    width: 600,
    height: 400,
    zIndex: 100 + i
  }));
  const ctx = {
    get: () => undefined,
    desktop: {
      apps: [],
      views,
      provideOpener(callback) {
        opener = callback;
        return () => {};
      }
    },
    actions: { instances: [] }
  };
  const writes = [];
  const props = [];
  const overrides = {
    vue,
    "vuetify/components": Vuetify.components,
    "@elements-panel/sdk": { ctx, usePluginService: () => undefined },
    "@elementspanel/epanel-plugin-i18n": { t: (key) => key },
    "@elementspanel/epanel-plugin-console/stores/useAppConfigStore": {
      useAppConfigStore: () => ({ isDarkTheme: vue.ref(false) })
    },
    "@elementspanel/epanel-plugin-console/stores/useAppStateStore": {
      useAppStateStore: () => ({
        state: {},
        isAdmin: vue.ref(false),
        isLogged: vue.ref(true),
        authEnabled: vue.ref(false)
      })
    },
    "@elementspanel/epanel-plugin-console/services/apis": {},
    "@elementspanel/epanel-plugin-console/tools/vuetifyModal": {},
    "@elementspanel/epanel-plugin-console/services/apis/appearance": {
      resolveBackgroundImage: () => "",
      getAppearance: () => ({ execute: async () => ({ value: {} }) })
    },
    "vue-router": { useRouter: () => ({ push() {} }) },
    "./api": {
      getDesktopSettings: () => ({ execute: async () => ({ value: {} }) }),
      getDesktopLayoutConfig: () => ({
        execute: async () => ({ value: { windows, shortcuts: [] } })
      }),
      setDesktopLayoutConfig: () => ({
        execute: async ({ data }) => {
          writes.push(data);
        }
      })
    },
    "./widgets/desktop/DesktopIcon.vue": { render: () => null },
    "./widgets/desktop/DesktopContextMenu.vue": { render: () => null },
    "./widgets/desktop/DesktopTaskbar.vue": vue.defineComponent({
      props: ["windows"],
      setup: (p) => () => {
        props.push(p.windows);
        return vue.h(
          "footer",
          p.windows.map((win) => vue.h("button", { "data-window-id": win.id }, win.title))
        );
      }
    })
  };
  const filename = "plugins/desktop/panel/src/Desktop.vue";
  const Desktop = load(filename, overrides, compileSfc(filename, { inlineTemplate: true })).default;
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = vue.createApp(Desktop);
  app.use(Vuetify.createVuetify());
  app.mount(target);
  t.after(() => {
    app.unmount();
    target.remove();
  });
  await flush();
  await frame();
  await frame();
  const shell = (id) => target.querySelector(`[id="${id}-title"]`)?.closest(".desktop-window");
  const focus = async (id) => {
    shell(id).dispatchEvent(pointer("pointerdown"));
    await flush();
    await frame();
  };
  return {
    target,
    counters,
    writes,
    props,
    shell,
    focus,
    views,
    open: (request) => opener(request)
  };
}

test("desktop focus and geometry updates do not render sibling business components or measure a window group", async (t) => {
  const f = await desktopFixture(t);
  assert.equal(f.counters.mounts, 20);
  const initialRenders = f.counters.renders;
  let reads = 0;
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", () => {
    reads++;
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  });
  for (let i = 0; i < 40; i++) {
    f.shell(`window-${i % 20}`).dispatchEvent(pointer("pointerdown"));
    await flush();
  }
  assert.equal(f.counters.renders, initialRenders);
  assert.equal(reads, 0);
  assert.equal(f.counters.unmounts, 0);
  const window = f.shell("window-19");
  const shellInstance = window.__vueParentComponent;
  shellInstance.emit("moved", "window-19", 150, 90);
  shellInstance.emit("resized", "window-19", 150, 90, 700, 450);
  await flush();
  assert.equal(f.counters.renders, initialRenders);
  assert.equal(reads, 0);
});

test("covered business content leaves the document and restores the same input, scroll position and component instance", async (t) => {
  const f = await desktopFixture(t, 8);
  assert.equal(f.target.querySelectorAll("input").length, 1);
  assert.equal(f.target.querySelectorAll(".desktop-window").length, 8);
  await f.focus("window-0");
  const shell = f.shell("window-0");
  const input = shell.querySelector("input");
  const scroller = shell.querySelector(".test-window-scroll");
  input.value = "unsaved edit";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  scroller.scrollTop = 350;
  scroller.scrollLeft = 25;
  scroller.dispatchEvent(new window.Event("scroll"));
  await flush();
  await f.focus("window-7");
  assert.equal(shell.querySelector("input"), null);
  assert.equal(input.isConnected, false);
  assert.equal(f.counters.unmounts, 0);
  scroller.scrollTop = 0;
  scroller.scrollLeft = 0;
  await f.focus("window-0");
  assert.equal(shell.querySelector("input"), input);
  assert.equal(input.value, "unsaved edit");
  assert.equal(scroller.scrollTop, 350);
  assert.equal(scroller.scrollLeft, 25);
  assert.equal(f.counters.mounts, 8);
  shell.querySelector(".window__control--minimize").click();
  await flush();
  await frame();
  assert.equal(input.isConnected, false);
  assert.equal(f.open({ id: "window-0", view: "view-0" }), true);
  await flush();
  await frame();
  assert.equal(shell.querySelector("input"), input);
  assert.equal(input.value, "unsaved edit");
  assert.equal(scroller.scrollTop, 350);
});

test("dragging reveals the next covered window while keeping deeper cached windows detached", async (t) => {
  const f = await desktopFixture(t, 20);
  const title = f.shell("window-19").querySelector(".window__titlebar");
  title.setPointerCapture = () => {};
  const event = pointer("pointerdown", { clientX: 140, clientY: 80 });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    isPrimary: { value: true },
    pointerType: { value: "mouse" }
  });
  title.dispatchEvent(event);
  await flush();
  assert.equal(f.target.querySelectorAll("input").length, 2);
  assert.ok(f.shell("window-18").querySelector("input"));
  assert.equal(f.shell("window-17").querySelector("input"), null);
  const end = pointer("pointerup");
  Object.defineProperty(end, "pointerId", { value: 1 });
  document.dispatchEvent(end);
  await flush();
  await frame();
  assert.equal(f.target.querySelectorAll("input").length, 1);
  assert.equal(f.counters.mounts, 20);
});

test("closing cached windows releases their component and plugin removal cannot revive cached content", async (t) => {
  const f = await desktopFixture(t, 4);
  const shell = f.shell("window-0");
  shell.querySelector(".window__control--close").click();
  await flush();
  await frame();
  await frame();
  assert.equal(f.shell("window-0"), undefined);
  assert.equal(f.counters.unmounts, 1);
  assert.equal(
    f.props.at(-1).some((win) => win.id === "window-0"),
    false
  );
  f.views.splice(1, 1);
  await flush();
  await frame();
  assert.equal(f.shell("window-1"), undefined);
  assert.equal(f.counters.unmounts, 2);
  assert.equal(f.open({ id: "window-1", view: "view-1" }), false);
});

for (const action of ["cache", "close"]) {
  test(`terminal initialization tolerates ${action} while its connection request is pending`, async (t) => {
    const wait = deferred();
    const events = new EventEmitter();
    const initialized = [];
    const visible = vue.ref(true);
    const hook = {
      state: vue.ref(),
      events,
      isConnect: vue.ref(true),
      socketAddress: vue.ref(""),
      execute: () => wait.promise,
      initTerminalWindow: (element) => initialized.push(element),
      sendCommand() {},
      writeOutputHistory() {},
      clearTerminal() {}
    };
    const filename = "plugins/instance/panel/src/terminal/components/TerminalCore.vue";
    const Core = load(
      filename,
      {
        vue,
        "vuetify/components": Vuetify.components,
        "@elementspanel/epanel-plugin-console/components/Empty": { render: () => null },
        "@elementspanel/epanel-plugin-console/hooks/useXhrPollError": {
          useXhrPollError: () => ({
            isXhrPollError: vue.ref(false),
            xhrPollErrorReason: vue.ref("")
          })
        },
        "@elementspanel/epanel-plugin-console/services/apis/operationLog": {},
        "@elementspanel/epanel-plugin-console/tools/randId": { getRandomId: () => action },
        "@elementspanel/epanel-plugin-console/tools/vuetifyToast": {},
        "@elementspanel/epanel-plugin-i18n": { t: (key) => key },
        "../api": {},
        "../hooks/useCommandHistory": {
          useCommandHistory: () => ({
            commandInputValue: vue.ref(""),
            handleHistorySelect() {},
            resetHistorySelection() {}
          })
        }
      },
      compileSfc(filename, { inlineTemplate: true })
    ).default;
    const target = document.createElement("div");
    document.body.appendChild(target);
    const app = vue.createApp({
      render: () =>
        action === "cache"
          ? vue.h(
              vue.KeepAlive,
              {},
              {
                default: () =>
                  visible.value
                    ? vue.h(Core, {
                        instanceId: "one",
                        daemonId: "node",
                        height: "400px",
                        useTerminalHook: hook
                      })
                    : null
              }
            )
          : visible.value
          ? vue.h(Core, {
              instanceId: "one",
              daemonId: "node",
              height: "400px",
              useTerminalHook: hook
            })
          : null
    });
    app.use(Vuetify.createVuetify());
    app.mount(target);
    t.after(() => {
      app.unmount();
      target.remove();
    });
    await flush();
    const terminal = target.querySelector('[id^="terminal-window-"]');
    assert.ok(terminal);
    visible.value = false;
    await flush();
    assert.equal(terminal.isConnected, false);
    wait.resolve();
    await flush();
    assert.deepEqual(initialized, action === "cache" ? [terminal] : []);
    if (action === "cache") {
      visible.value = true;
      await flush();
      assert.equal(target.querySelector('[id^="terminal-window-"]'), terminal);
      assert.equal(initialized.length, 1);
    }
  });
}

test("coverage recognizes unions while keeping gaps and rounded maximized corners visible", () => {
  const { isWindowCovered } = load("plugins/desktop/panel/src/windowRendering.ts", { vue });
  const rect = { left: 100, top: 60, right: 700, bottom: 460 };
  assert.equal(isWindowCovered(rect, false, [{ rect, maximized: false }]), true);
  assert.equal(isWindowCovered(rect, true, [{ rect, maximized: false }]), false);
  assert.equal(
    isWindowCovered(rect, false, [{ rect: { ...rect, left: 101 }, maximized: true }]),
    false
  );
  const covers = [
    { rect: { ...rect, right: 400 }, maximized: true },
    { rect: { ...rect, left: 400 }, maximized: true }
  ];
  assert.equal(isWindowCovered(rect, false, covers), true);
  covers[1].rect.left = 401;
  assert.equal(isWindowCovered(rect, false, covers), false);
});

test("window polling pauses for occlusion and interaction, resumes once and never overlaps pending requests", async (t) => {
  const activity = { visible: vue.ref(true), interacting: vue.ref(false) };
  const timers = new Map();
  let id = 0,
    mount,
    dispose,
    calls = 0;
  t.mock.method(global, "setTimeout", (callback, delay) => {
    timers.set(++id, { callback, delay });
    return id;
  });
  t.mock.method(global, "clearTimeout", (id) => timers.delete(id));
  const wait = deferred();
  const { usePolling } = load("plugins/console/panel/src/hooks/usePolling.ts", {
    vue: {
      ...vue,
      onMounted: (callback) => {
        mount = callback;
      },
      onUnmounted: (callback) => {
        dispose = callback;
      }
    },
    "./useDesktopWindowActivity": { useDesktopWindowActivity: () => activity }
  });
  usePolling(async () => {
    calls++;
    if (calls === 2) await wait.promise;
  }, 3000);
  t.after(() => dispose());
  await mount();
  assert.equal(calls, 1);
  assert.equal([...timers.values()][0].delay, 3000);
  activity.visible.value = false;
  assert.equal(timers.size, 0);
  activity.visible.value = true;
  assert.equal(timers.size, 1);
  const resume = [...timers.values()][0];
  timers.clear();
  const pending = resume.callback();
  assert.equal(calls, 2);
  activity.interacting.value = true;
  activity.interacting.value = false;
  assert.equal(timers.size, 0);
  wait.resolve();
  await pending;
  assert.equal(timers.size, 1);
  activity.interacting.value = true;
  assert.equal(timers.size, 0);
  assert.equal(calls, 2);
  dispose();
  activity.visible.value = false;
  activity.visible.value = true;
  assert.equal(timers.size, 0);
});
