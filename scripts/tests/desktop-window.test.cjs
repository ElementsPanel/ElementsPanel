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

const { parse, compileScript, compileStyle } = frontendRequire("@vue/compiler-sfc");
const sass = frontendRequire("sass");
const filename = path.join(root, "panel/plugins/desktop/src/widgets/desktop/DesktopWindow.vue");
const { descriptor } = parse(fs.readFileSync(filename, "utf8"), { filename });
const script = compileScript(descriptor, { id: "desktop-window-test", inlineTemplate: true });
const mod = new Module(filename, module);
mod.require = (id) => id === "vuetify/components" ? Vuetify.components : frontendRequire(id);
mod._compile(ts.transpileModule(script.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename);
const DesktopWindow = mod.exports.default;
DesktopWindow.__scopeId = "data-v-desktop-window-test";
const { VSelect, VDialog } = Vuetify.components;
const flush = async () => { for (let i = 0; i < 8; i++) await vue.nextTick(); };

function fixture(t) {
  const closed = vue.ref(false);
  const transitions = { enters: 0, leaves: 0 };
  const visible = vue.ref(true);
  const minimized = vue.ref(false);
  const maximized = vue.ref(false);
  const zIndex = vue.ref(10003);
  const open = vue.ref(false);
  const dialogOpen = vue.ref(false);
  const childOpen = vue.ref(false);
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = vue.createApp({
    render: () => vue.h(vue.TransitionGroup, {
      tag: "div", name: "desktop-window",
      onEnter: (_element, done) => { transitions.enters++; done(); },
      onLeave: (_element, done) => { transitions.leaves++; done(); }
    }, () => closed.value ? [] : [vue.h(DesktopWindow, {
      key: "owner", id: "owner", title: "Owner", icon: "mdi-window-maximize", visible: visible.value, active: true,
      minimized: minimized.value, maximized: maximized.value, zIndex: zIndex.value,
      onMinimize: () => { minimized.value = true; },
      onClose: () => { closed.value = true; }
    }, { default: () => [
      vue.h(VSelect, { menu: open.value, items: ["node-a", "node-b"] }),
      vue.h(DesktopWindow, {
        id: "child", title: "Child", icon: "mdi-window-maximize", visible: true, active: true,
        minimized: false, maximized: false, zIndex: 20003
      }, { default: () => vue.h(VSelect, { menu: childOpen.value, items: ["child-node"] }) }),
      vue.h(VDialog, { modelValue: dialogOpen.value }, {
        default: () => vue.h(VSelect, { menu: dialogOpen.value, items: ["dialog-node"] })
      })
    ] })])
  });
  app.use(Vuetify.createVuetify({ defaults: {
    VMenu: { transition: false }, VDialog: { transition: false }
  } }));
  app.mount(target);
  t.after(() => { if (target.childElementCount) app.unmount(); target.remove(); });
  return { visible, minimized, maximized, zIndex, open, dialogOpen, childOpen, target, app, transitions };
}

function animationFixture(t) {
  const f = fixture(t);
  const owner = f.target.querySelector(".desktop-window");
  const taskbar = document.createElement("div");
  taskbar.className = "desktop-taskbar";
  const otherButton = document.createElement("div");
  otherButton.className = "taskbar__window-btn";
  otherButton.dataset.windowId = "other";
  const button = document.createElement("div");
  button.className = "taskbar__window-btn";
  button.dataset.windowId = "owner";
  taskbar.append(otherButton, button);
  document.body.appendChild(taskbar);
  t.after(() => taskbar.remove());

  const sourceRect = { left: 100, top: 60, width: 800, height: 500 };
  const targetRect = { left: 240, top: 720, width: 160, height: 32 };
  owner.getBoundingClientRect = () => sourceRect;
  button.getBoundingClientRect = () => targetRect;
  let scrollCalls = 0;
  button.scrollIntoView = () => { scrollCalls++; };
  const animations = [];
  owner.animate = (keyframes, options) => {
    const animation = {
      keyframes, options, onfinish: null, cancelled: false,
      cancel() { this.cancelled = true; }
    };
    animations.push(animation);
    return animation;
  };
  return { ...f, owner, button, sourceRect, targetRect, animations, scrollCalls: () => scrollCalls };
}

function dialogFixture(t, shellStyleLast) {
  const proxyFilename = path.join(root, "panel/plugins/instance/src/desktop/DesktopWindow.vue");
  const { descriptor: proxyDescriptor } = parse(fs.readFileSync(proxyFilename, "utf8"), { filename: proxyFilename });
  const proxyScript = compileScript(proxyDescriptor, { id: "instance-window-test", inlineTemplate: true });
  const proxyModule = new Module(proxyFilename, module);
  proxyModule.require = (id) => id === "@/plugin/context"
    ? { usePluginService: () => ({ window: DesktopWindow }) }
    : frontendRequire(id);
  proxyModule._compile(ts.transpileModule(proxyScript.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, proxyFilename);
  const InstanceWindow = proxyModule.exports.default;
  InstanceWindow.__scopeId = "data-v-instance-window-test";

  const ownerScopeId = "data-v-instance-manager-test";
  const ownerFilename = path.join(root, "panel/plugins/instance/src/desktop/DesktopInstanceManager.vue");
  const { descriptor: ownerDescriptor } = parse(fs.readFileSync(ownerFilename, "utf8"), { filename: ownerFilename });
  const styles = [
    { descriptor: ownerDescriptor, scopeId: ownerScopeId },
    { descriptor, scopeId: DesktopWindow.__scopeId }
  ];
  if (!shellStyleLast) styles.reverse();
  const styleElements = styles.map(({ descriptor: source, scopeId }) => {
    const element = document.createElement("style");
    element.textContent = source.styles.map((block) => compileStyle({
      source: sass.compileString(block.content).css,
      filename: "desktop-dialog-test.vue", id: scopeId, scoped: block.scoped
    }).code).join("\n");
    document.head.appendChild(element);
    return element;
  });

  const opened = vue.ref(false);
  let finishEnter, finishLeave;
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = vue.createApp({
    __scopeId: ownerScopeId,
    render: () => vue.h("div", [vue.h(vue.Teleport, { to: "body" }, [vue.h(vue.Transition, {
      name: "desktop-window",
      onEnter: (_element, done) => { finishEnter = done; },
      onLeave: (_element, done) => { finishLeave = done; }
    }, () => opened.value ? vue.h(InstanceWindow, {
      id: "instance-manager-tag-dialog", title: "Tags", visible: opened.value,
      minimized: false, maximized: false, active: true, showMinimize: false, showMaximize: false,
      onClose: () => { opened.value = false; }
    }) : null)])])
  });
  app.use(Vuetify.createVuetify());
  app.mount(target);
  t.after(() => {
    finishEnter?.();
    finishLeave?.();
    app.unmount();
    target.remove();
    styleElements.forEach(element => element.remove());
  });
  return { opened, finishEnter: () => finishEnter(), finishLeave: () => finishLeave() };
}

const transitionFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

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

test("windows shrink into their own taskbar button and restore from its current position", async (t) => {
  const f = animationFixture(t);
  f.owner.querySelector(".window__control--minimize").click();
  await flush();
  assert.equal(f.animations.length, 1);
  assert.notEqual(f.owner.style.display, "none", "keep the window visible until minimization finishes");
  assert.ok(f.owner.classList.contains("desktop-window--animating"));
  const minimize = f.animations[0];
  assert.equal(minimize.keyframes[1].transform, "translate(140px, 660px) scale(0.2, 0.064)");
  assert.equal(minimize.keyframes[1].opacity, 0);
  assert.equal(minimize.keyframes[1].transformOrigin, "top left");
  assert.equal(f.scrollCalls(), 1);
  minimize.onfinish();
  await flush();
  assert.equal(f.owner.style.display, "none");
  assert.equal(minimize.cancelled, true);
  assert.equal(f.owner.classList.contains("desktop-window--animating"), false);

  // Taskbar buttons can move after reordering or horizontal scrolling.
  f.targetRect.left = 480;
  f.minimized.value = false;
  await flush();
  assert.notEqual(f.owner.style.display, "none");
  const restore = f.animations[1];
  assert.equal(restore.keyframes[0].transform, "translate(380px, 660px) scale(0.2, 0.064)");
  assert.equal(restore.keyframes[1].transform, "translate(0px, 0px) scale(1, 1)");
  restore.onfinish();
  await flush();
  assert.notEqual(f.owner.style.display, "none");
  assert.equal(restore.cancelled, true);
  assert.equal(f.owner.classList.contains("desktop-window--animating"), false);
});

test("maximized windows use their rendered bounds for the taskbar animation", async (t) => {
  const f = animationFixture(t);
  f.maximized.value = true;
  Object.assign(f.sourceRect, { left: 0, top: 0, width: 1000, height: 800 });
  f.minimized.value = true;
  await flush();
  assert.equal(f.animations[0].keyframes[1].transform, "translate(240px, 720px) scale(0.16, 0.04)");
});

test("minimizing and restoring do not trigger the window group's open or close transitions", async (t) => {
  const f = animationFixture(t);
  f.minimized.value = true;
  await flush();
  f.animations[0].onfinish();
  await flush();
  assert.equal(f.transitions.leaves, 0, "the taskbar animation must not be followed by a close transition");
  assert.equal(f.owner.style.display, "none");

  f.minimized.value = false;
  await flush();
  f.animations[1].onfinish();
  await flush();
  assert.equal(f.transitions.enters, 0, "restoring must only use the taskbar animation");
  assert.notEqual(f.owner.style.display, "none");

  f.owner.querySelector(".window__control--close").click();
  await flush();
  assert.equal(f.transitions.leaves, 1, "closing still uses the window group's transition");
  assert.equal(f.owner.isConnected, false);
});

test("restoring during minimization continues from the current frame and ignores stale completion", async (t) => {
  const f = animationFixture(t);
  f.minimized.value = true;
  await flush();
  const minimize = f.animations[0];
  const staleFinish = minimize.onfinish;
  const originalGetComputedStyle = window.getComputedStyle.bind(window);
  t.mock.method(window, "getComputedStyle", (element) => element === f.owner
    ? { transform: "matrix(0.6, 0, 0, 0.6, 70, 330)", opacity: "0.5" }
    : originalGetComputedStyle(element));
  f.minimized.value = false;
  await flush();
  assert.equal(minimize.cancelled, true);
  const restore = f.animations[1];
  assert.equal(restore.keyframes[0].transform, "matrix(0.6, 0, 0, 0.6, 70, 330)");
  assert.equal(restore.keyframes[0].opacity, "0.5");
  staleFinish();
  await flush();
  assert.notEqual(f.owner.style.display, "none");
  f.app.unmount();
  assert.equal(restore.cancelled, true);
  assert.equal(restore.onfinish, null);
});

test("hiding a window cancels pending visibility animation", async (t) => {
  const f = animationFixture(t);
  f.minimized.value = true;
  await flush();
  const minimize = f.animations[0];
  f.visible.value = false;
  await flush();
  assert.equal(minimize.cancelled, true);
  assert.equal(f.owner.style.display, "none");
  f.minimized.value = false;
  f.visible.value = true;
  await flush();
  assert.notEqual(f.owner.style.display, "none");
  assert.equal(f.animations.length, 1);
});

test("missing taskbar targets and reduced motion keep minimizing immediate", async (t) => {
  const f = animationFixture(t);
  f.button.remove();
  f.minimized.value = true;
  await flush();
  assert.equal(f.animations.length, 0);
  assert.equal(f.owner.style.display, "none");
  f.minimized.value = false;
  await flush();
  assert.notEqual(f.owner.style.display, "none");
  document.querySelector(".desktop-taskbar").append(f.button);
  t.mock.method(window, "matchMedia", () => ({ matches: true }));
  f.minimized.value = true;
  await flush();
  assert.equal(f.animations.length, 0);
  assert.equal(f.owner.style.display, "none");
  assert.equal(f.owner.classList.contains("desktop-window--animating"), false);
});

for (const shellStyleLast of [true, false]) {
  test(`instance subwindows fade through their wrapper with shell CSS loaded ${shellStyleLast ? "last" : "first"}`, async (t) => {
    const f = dialogFixture(t, shellStyleLast);
    f.opened.value = true;
    await flush();
    const element = document.body.querySelector(".desktop-window");
    assert.ok(element.classList.contains("desktop-window-enter-active"));
    const enterStyle = window.getComputedStyle(element);
    assert.equal(enterStyle.opacity, "0");
    assert.match(enterStyle.transition, /\b(opacity|all)\b/, "opacity must animate regardless of stylesheet order");
    assert.match(enterStyle.transition, /\b(transform|all)\b/, "the existing dialog scale transition must also animate");
    await transitionFrame();
    assert.notEqual(window.getComputedStyle(element).opacity, "0");
    f.finishEnter();

    element.querySelector(".window__control--close").click();
    await flush();
    assert.ok(element.isConnected, "keep the subwindow mounted for its fade-out");
    assert.notEqual(element.style.display, "none", "the visible prop must not hide a leaving subwindow early");
    assert.ok(element.classList.contains("desktop-window-leave-active"));
    await transitionFrame();
    const leaveStyle = window.getComputedStyle(element);
    assert.equal(leaveStyle.opacity, "0");
    assert.match(leaveStyle.transition, /\b(opacity|all)\b/);
    f.finishLeave();
    await flush();
    assert.equal(element.isConnected, false);
  });
}
