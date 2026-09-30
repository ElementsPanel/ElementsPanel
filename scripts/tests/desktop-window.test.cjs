const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { after, test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const frontendRequire = Module.createRequire(path.join(root, "frontend/package.json"));
const { JSDOM, VirtualConsole } = frontendRequire("jsdom");
const virtualConsole = new VirtualConsole();
virtualConsole.sendTo(console, { omitJSDOMErrors: true });
virtualConsole.on("jsdomError", (error) => {
  // jsdom 22 cannot parse Vuetify 4's theme cascade layers.
  if (error.type === "css parsing" && error.detail?.includes("@layer")) return;
  throw error;
});
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  pretendToBeVisual: true,
  virtualConsole
});

for (const key of [
  "window",
  "document",
  "Element",
  "HTMLElement",
  "SVGElement",
  "ShadowRoot",
  "MouseEvent",
  "Node",
  "getComputedStyle"
]) {
  global[key] = dom.window[key];
}
global.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 16);
global.cancelAnimationFrame = (handle) => clearTimeout(handle);
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
global.CSS = { supports: () => false };
global.visualViewport = null;
global.devicePixelRatio = 1;
window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {}
});
after(() => dom.window.close());

const vue = frontendRequire("vue");
const Vuetify = frontendRequire("vuetify/dist/vuetify.js");
const ts = frontendRequire("typescript");

const { parse, compileScript } = frontendRequire("@vue/compiler-sfc");
const filename = path.join(root, "panel/plugins/desktop/src/widgets/desktop/DesktopWindow.vue");
const { descriptor } = parse(fs.readFileSync(filename, "utf8"), { filename });
const script = compileScript(descriptor, { id: "desktop-window-test", inlineTemplate: true });
const mod = new Module(filename, module);
mod.require = (id) => id === "vuetify/components" ? Vuetify.components : frontendRequire(id);
mod._compile(ts.transpileModule(script.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename);
const DesktopWindow = mod.exports.default;
const { VSelect, VDialog } = Vuetify.components;
const flush = async () => { for (let i = 0; i < 8; i++) await vue.nextTick(); };

function fixture(t) {
  const minimized = vue.ref(false);
  const zIndex = vue.ref(10003);
  const open = vue.ref(false);
  const dialogOpen = vue.ref(false);
  const childOpen = vue.ref(false);
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = vue.createApp({
    render: () => vue.h(DesktopWindow, {
      id: "owner", title: "Owner", icon: "mdi-window-maximize", visible: true, active: true,
      minimized: minimized.value, maximized: false, zIndex: zIndex.value
    }, { default: () => [
      vue.h(VSelect, { menu: open.value, items: ["node-a", "node-b"] }),
      vue.h(DesktopWindow, {
        id: "child", title: "Child", icon: "mdi-window-maximize", visible: true, active: true,
        minimized: false, maximized: false, zIndex: 20003
      }, { default: () => vue.h(VSelect, { menu: childOpen.value, items: ["child-node"] }) }),
      vue.h(VDialog, { modelValue: dialogOpen.value }, {
        default: () => vue.h(VSelect, { menu: dialogOpen.value, items: ["dialog-node"] })
      })
    ] })
  });
  app.use(Vuetify.createVuetify({ defaults: {
    VMenu: { transition: false }, VDialog: { transition: false }
  } }));
  app.mount(target);
  t.after(() => { if (target.childElementCount) app.unmount(); target.remove(); });
  return { minimized, zIndex, open, dialogOpen, childOpen, target, app };
}

test("desktop menus belong to their window, outside its clipped content", async (t) => {
  const f = fixture(t);
  await flush();
  f.open.value = true;
  await flush();
  const owner = f.target.querySelector(".desktop-window");
  const menu = owner.querySelector(":scope > .v-overlay-container .v-menu");
  assert.ok(menu, "menu must be attached directly to its window");
  assert.equal(menu.closest(".window__frame"), null);
  assert.match(menu.textContent, /node-a/);
  f.zIndex.value = 42000;
  f.minimized.value = true;
  await flush();
  assert.equal(owner.style.zIndex, "42000");
  assert.equal(owner.style.display, "none");
  assert.ok(owner.contains(menu), "menu follows window visibility and stacking");
  f.app.unmount();
  assert.equal(menu.isConnected, false);
});

test("nested windows own their menus and Vuetify dialogs retain their own defaults", async (t) => {
  const f = fixture(t);
  await flush();
  f.childOpen.value = true;
  await flush();
  const windows = f.target.querySelectorAll(".desktop-window");
  const childMenu = windows[1].querySelector(":scope > .v-overlay-container .v-menu");
  assert.ok(childMenu);
  assert.match(childMenu.textContent, /child-node/);
  f.childOpen.value = false;
  f.dialogOpen.value = true;
  await flush();
  const dialogMenu = [...document.querySelectorAll(".v-menu")].find(el => el.textContent.includes("dialog-node"));
  assert.ok(dialogMenu);
  assert.equal(dialogMenu.closest(".desktop-window"), null,
    "a teleported Vuetify dialog must not send its menu back into the desktop window");
});
