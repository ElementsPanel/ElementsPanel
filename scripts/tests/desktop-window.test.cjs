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
function loadSfc(relative, overrides = {}) {
  const filename = path.join(root, relative);
  const { descriptor } = parse(fs.readFileSync(filename, "utf8"), { filename });
  const script = compileScript(descriptor, { id: "confirmation-test", inlineTemplate: true });
  const component = new Module(filename, module);
  component.require = (id) => Object.hasOwn(overrides, id) ? overrides[id]
    : id === "vuetify/components" ? Vuetify.components : frontendRequire(id);
  component._compile(ts.transpileModule(script.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, filename);
  return component.exports.default;
}

test("node plugin configuration buttons open desktop windows for the clicked node", async (t) => {
  const opened = [];
  const service = vue.shallowReactive({
    views: [{ id: "node-plugin-config" }],
    open: (request) => { opened.push(request); return true; }
  });
  const nodes = [
    { uuid: "one", remarks: "Node One", ip: "one.example", port: 24444, available: false },
    { uuid: "two", remarks: "", ip: "two.example", port: 24444, available: false }
  ];
  const operation = () => ({ execute: async () => {}, isLoading: vue.ref(false) });
  const Manager = loadSfc("panel/plugins/node/src/desktop/DesktopNodeManager.vue", {
    "@/lang/i18n": { t: (key) => key },
    "@/plugin/context": { usePluginService: () => service },
    "@/hooks/useOverviewInfo": { useOverviewInfo: () => ({ state: vue.ref() }) },
    "@/hooks/useSocketIo": { SocketStatus: { Error: "error" }, testSocketConnection() {} },
    "@/hooks/usePolling": { usePolling: (callback) => vue.onMounted(callback) },
    "@/tools/validator": { getValidatorErrorMsg: String, reportErrorMsg: assert.fail },
    "./DesktopWindow.vue": { default: {} },
    "../api": {
      remoteNodeList: () => ({ ...operation(), execute: async () => ({ value: nodes }) }),
      addNode: operation, editNode: operation, deleteNode: operation, connectNode: operation
    }
  });
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = vue.createApp(Manager);
  app.use(Vuetify.createVuetify());
  app.mount(target);
  t.after(() => { app.unmount(); target.remove(); });
  await flush();

  const buttons = [...target.querySelectorAll('button[title="TXT_CODE_PLUGIN_CONFIG"]')];
  assert.equal(buttons.length, 2);
  assert.equal(target.querySelector('a[title="TXT_CODE_PLUGIN_CONFIG"]'), null);
  buttons[1].click();
  buttons[0].click();
  buttons[1].click();
  assert.deepEqual(opened.map(({ view, props }) => ({ view, props })), [
    { view: "node-plugin-config", props: { scope: "node", daemonId: "two" } },
    { view: "node-plugin-config", props: { scope: "node", daemonId: "one" } },
    { view: "node-plugin-config", props: { scope: "node", daemonId: "two" } }
  ]);
  assert.equal(opened[0].id, opened[2].id);
  assert.notEqual(opened[0].id, opened[1].id);
  service.views = [];
  await flush();
  assert.equal(target.querySelector('[title="TXT_CODE_PLUGIN_CONFIG"]'), null);
});

const translations = { t: (key) => key };
const DesktopConfirmation = loadSfc("panel/plugins/desktop/src/widgets/desktop/DesktopConfirmDialog.vue", {
  "@/lang/i18n": translations,
  "./DesktopWindow.vue": { default: DesktopWindow }
});
const desktopService = vue.shallowReactive({ window: DesktopWindow, confirmation: DesktopConfirmation });
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

function viewportFixture(t, width, height) {
  const previous = { width: window.innerWidth, height: window.innerHeight };
  const resize = (width, height) => {
    window.innerWidth = width;
    window.innerHeight = height;
    window.dispatchEvent(new window.Event("resize"));
  };
  resize(width, height);
  t.after(() => resize(previous.width, previous.height));
  return resize;
}

function boundsFixture(t, initial = {}) {
  const state = vue.reactive({
    visible: true, minimized: false, maximized: false,
    initialX: 100, initialY: 60, initialWidth: 800, initialHeight: 500, ...initial
  });
  const changes = [];
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = vue.createApp({
    render: () => vue.h(DesktopWindow, {
      id: "bounds", title: "Bounds", active: true, ...state,
      onMaximize: () => { state.maximized = !state.maximized; },
      onResized: (_id, x, y, width, height) => {
        changes.push({ x, y, width, height });
        Object.assign(state, { initialX: x, initialY: y, initialWidth: width, initialHeight: height });
      }
    })
  });
  app.use(Vuetify.createVuetify());
  app.mount(target);
  t.after(() => { if (target.childElementCount) app.unmount(); target.remove(); });
  const element = target.querySelector(".desktop-window");
  const bounds = () => Object.fromEntries(["left", "top", "width", "height"]
    .map((key) => [key, Number.parseFloat(element.style[key])]));
  const assertInside = () => {
    const box = bounds();
    assert.ok(box.left >= 0 && box.top >= 0, JSON.stringify(box));
    assert.ok(box.width > 0 && box.height > 0, JSON.stringify(box));
    assert.ok(box.left + box.width <= window.innerWidth, JSON.stringify(box));
    assert.ok(box.top + box.height <= window.innerHeight - 48, JSON.stringify(box));
  };
  const dragOutside = () => {
    const box = bounds();
    element.querySelector(".window__titlebar").dispatchEvent(new MouseEvent("mousedown", {
      clientX: box.left + 40, clientY: box.top + 20, bubbles: true, button: 0
    }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: window.innerWidth - 24, clientY: window.innerHeight - 24 }));
    document.dispatchEvent(new MouseEvent("mouseup"));
  };
  return { state, element, app, changes, bounds, assertInside, dragOutside };
}

function confirmationFixture(t, options = {}) {
  const open = vue.ref(true);
  const loading = vue.ref(false);
  const disabled = vue.ref(false);
  const events = { confirmations: 0, cancellations: 0, actions: [] };
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = vue.createApp({
    render: () => vue.h(DesktopConfirmation, {
      title: "Delete user", message: "Delete Alice?", danger: true, ...options,
      modelValue: open.value, loading: loading.value, disabled: disabled.value,
      "onUpdate:modelValue": (value) => { open.value = value; },
      onConfirm: () => { events.confirmations++; },
      onCancel: () => { events.cancellations++; },
      onAction: (id) => events.actions.push(id)
    })
  });
  app.use(Vuetify.createVuetify());
  app.mount(target);
  t.after(() => { app.unmount(); target.remove(); });
  const findWindow = () => [...document.body.querySelectorAll(".desktop-confirm")]
    .find(element => element.querySelector(".window__title").textContent === (options.title || "Delete user"));
  return { open, loading, disabled, events, findWindow };
}

function fileManagerDialogFixture(t) {
  const events = { cancelled: 0, deleted: [], downloads: [], uploads: [], overwritePromise: undefined };
  const manager = {
    dialog: vue.ref({ show: false, title: "Operation", info: "File operation", mode: "", value: "", loading: false, unzipmode: "0", code: "utf-8", ok() {}, cancel() {} }),
    spinning: vue.ref(false),
    fileStatus: vue.ref({ platform: "linux", disks: [] }),
    permission: vue.ref({ loading: false, item: [{ key: "Owner", role: "owner" }], data: { owner: [] }, deep: false }),
    selectedRowKeys: vue.ref([]),
    operationForm: vue.ref({ name: "", current: 1, pageSize: 100, total: 0 }),
    dataSource: vue.ref([]),
    breadcrumbs: [], currentPath: vue.ref("/"), clipboard: vue.ref(), currentDisk: vue.ref("/"),
    isMultiple: vue.ref(false), activeTab: vue.ref("root"), currentTabs: vue.ref([{ key: "root", name: "/", path: "/" }]),
    selectionData: vue.ref([]),
    loadingWindow: vue.ref({ show: false, title: "Progress", text: "Copying files" }),
    archivePreview: vue.ref({ show: false, title: "archive.zip", entries: [], loading: false }),
    deleteDialog: vue.ref({ show: false, loading: false, resolve: undefined }),
    getFileList: async () => {},
    handleTableChange() {},
    downloadFromUrl: async (config) => { events.downloads.push(config); },
    selectedFiles: async (files, _path, overwriteHandler) => {
      events.uploads.push(files);
      events.overwritePromise = overwriteHandler({ count: 2, fileName: files[0].name });
      await events.overwritePromise;
    },
    closeArchivePreview: () => { manager.archivePreview.value.show = false; }
  };
  manager.dialog.value.cancel = () => { events.cancelled++; manager.dialog.value.show = false; };
  manager.deleteDialog.value.resolve = (confirmed) => { events.deleted.push(confirmed); manager.deleteDialog.value.show = false; };

  const fileManagerFilename = path.join(root, "panel/plugins/file/src/desktop/DesktopFileManager.vue");
  const { descriptor: fileManagerDescriptor } = parse(fs.readFileSync(fileManagerFilename, "utf8"), { filename: fileManagerFilename });
  const fileManagerScript = compileScript(fileManagerDescriptor, { id: "file-manager-dialog-test", inlineTemplate: true });
  const fileManagerModule = new Module(fileManagerFilename, module);
  const overrides = {
    "../hooks/useFileManager": { useFileManager: () => manager },
    "@/hooks/usePolling": { usePolling() {} },
    "@/plugin/context": { usePluginService: () => desktopService },
    "@/lang/i18n": { t: (key) => key },
    "../components/FileManagerTabs.vue": { default: { props: ["activeTab", "tabs"], render: () => vue.h("div") } },
    "../components/ArchivePreview.vue": { default: { props: ["compact", "entries", "loading"], render: () => vue.h("div", { class: "archive-content" }) } },
    "../services/uploadService": { default: { uiData: vue.ref({}) } },
    "../tools/fileManager": {},
    "@/tools/fileSize": {},
    "@/tools/desktopNotice": { notifyDesktopError() {} }
  };
  fileManagerModule.require = (id) => Object.hasOwn(overrides, id) ? overrides[id]
    : id === "vuetify/components" ? Vuetify.components : frontendRequire(id);
  fileManagerModule._compile(ts.transpileModule(fileManagerScript.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, fileManagerFilename);
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = vue.createApp(fileManagerModule.exports.default, { instanceId: "instance", daemonId: "node", sessionId: "files-session" });
  app.use(Vuetify.createVuetify());
  app.mount(target);
  t.after(() => { app.unmount(); target.remove(); });
  const findWindow = (title) => [...document.body.querySelectorAll(".desktop-window")]
    .find(element => element.querySelector(".window__title")?.textContent === title);
  return { manager, events, target, findWindow };
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

test("file manager operations, archive preview and deletion use desktop subwindows with working cancellation", async (t) => {
  const f = fileManagerDialogFixture(t);
  await flush();
  for (const mode of ["", "zip", "unzip", "permission"]) {
    Object.assign(f.manager.dialog.value, { mode, show: true });
    await flush();
    const operation = f.findWindow("Operation");
    assert.ok(operation, `missing operation subwindow for ${mode || "create/rename"}`);
    assert.equal(operation.closest(".v-dialog"), null);
    assert.equal(operation.querySelector(".window__control--minimize"), null);
    assert.equal(operation.querySelector(".window__control--maximize"), null);
    assert.ok(operation.classList.contains("desktop-window-enter-active"));
    if (mode === "permission") assert.equal(operation.querySelectorAll('input[type="checkbox"]').length, 4);
    else if (mode === "unzip") assert.equal(operation.querySelectorAll('input[type="radio"]').length, 5);
    else assert.ok(operation.querySelector('input[type="text"]'));
    operation.querySelector(".window__control--close").click();
    await flush();
    assert.equal(f.manager.dialog.value.show, false);
    await transitionFrame();
  }
  assert.equal(f.events.cancelled, 4);

  f.manager.archivePreview.value.show = true;
  await flush();
  const archive = f.findWindow("TXT_CODE_ARCHIVE_PREVIEW: archive.zip");
  assert.ok(archive.querySelector(".archive-content"));
  assert.ok(archive.querySelector(".window__resize-handle"));
  archive.querySelector(".window__control--close").click();
  await flush();
  assert.equal(f.manager.archivePreview.value.show, false);
  await transitionFrame();

  f.manager.deleteDialog.value.show = true;
  await flush();
  f.findWindow("TXT_CODE_71155575").querySelector(".window__control--close").click();
  await flush();
  assert.deepEqual(f.events.deleted, [false]);
  assert.equal(f.manager.deleteDialog.value.show, false);
  await transitionFrame();
  f.manager.deleteDialog.value.show = true;
  await flush();
  const deletion = f.findWindow("TXT_CODE_71155575");
  [...deletion.querySelectorAll(".desktop-confirm__footer .v-btn")].find(button => button.textContent.includes("TXT_CODE_d507abff")).click();
  await flush();
  assert.deepEqual(f.events.deleted, [false, true]);
  await transitionFrame();
});

test("file manager URL downloads and upload overwrite confirmations run in desktop subwindows", async (t) => {
  const f = fileManagerDialogFixture(t);
  await flush();
  [...f.target.querySelectorAll(".dfm-toolbar .v-btn")].find(button => button.textContent.includes("TXT_CODE_5b364aef")).click();
  await flush();
  const download = f.findWindow("TXT_CODE_f27b68b3");
  const urlInput = download.querySelector("input");
  urlInput.value = "https://example.com/files/server.jar";
  urlInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  await flush();
  assert.equal(download.querySelectorAll("input")[1].value, "server.jar");
  [...download.querySelectorAll(".dfm-dialog__footer .v-btn")].find(button => button.textContent.includes("TXT_CODE_d507abff")).click();
  await flush();
  assert.deepEqual(f.events.downloads, [{ url: "https://example.com/files/server.jar", fileName: "server.jar" }]);
  await transitionFrame();

  const uploadInput = f.target.querySelector('input[type="file"]');
  const files = [new window.File(["data"], "existing.txt")];
  Object.defineProperty(uploadInput, "files", { value: files });
  uploadInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  await flush();
  const upload = f.findWindow("TXT_CODE_52bc24ec");
  assert.ok(upload.textContent.includes("existing.txt"));
  [...upload.querySelectorAll(".desktop-confirm__footer .v-btn")].find(button => button.textContent.includes("TXT_CODE_d507abff")).click();
  await flush();
  assert.equal(f.events.uploads.length, 1);
  const overwrite = f.findWindow("TXT_CODE_99ca8563");
  assert.ok(overwrite);
  assert.equal(overwrite.querySelectorAll('input[type="checkbox"]').length, 2);
  overwrite.querySelector(".window__control--close").click();
  assert.deepEqual(await f.events.overwritePromise, { confirmed: false, all: false, overwrite: false });
  await transitionFrame();
});

test("file operation progress remains a non-dismissable desktop subwindow", async (t) => {
  const f = fileManagerDialogFixture(t);
  await flush();
  f.manager.loadingWindow.value.show = true;
  await flush();
  const progress = f.findWindow("Progress");
  assert.ok(progress);
  assert.equal(progress.querySelector(".window__control--close"), null);
  assert.ok(progress.textContent.includes("Copying files"));
  progress.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await flush();
  assert.equal(f.manager.loadingWindow.value.show, true);
  f.manager.loadingWindow.value.show = false;
  await flush();
  await transitionFrame();
  assert.equal(progress.isConnected, false);
});

for (const dismiss of ["button", "titlebar", "escape"]) {
  test(`shared desktop confirmations use the user deletion layout and cancel once through ${dismiss}`, async (t) => {
    const f = confirmationFixture(t);
    await flush();
    const dialog = f.findWindow();
    assert.equal(dialog.closest(".v-dialog"), null);
    assert.ok(dialog.querySelector(".desktop-confirm__icon.mdi-alert-circle-outline"));
    assert.ok(dialog.querySelector(".desktop-confirm__message").textContent.includes("Delete Alice?"));
    assert.ok(dialog.querySelector(".desktop-confirm__button--danger"));
    assert.equal(dialog.querySelector(".window__control--minimize"), null);
    assert.equal(dialog.querySelector(".window__control--maximize"), null);
    assert.equal(document.activeElement, dialog.querySelector(".desktop-confirm__cancel"));
    if (dismiss === "button") dialog.querySelector(".desktop-confirm__cancel").click();
    else if (dismiss === "titlebar") dialog.querySelector(".window__control--close").click();
    else dialog.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flush();
    assert.equal(f.open.value, false);
    assert.equal(f.events.cancellations, 1);
    assert.equal(f.events.confirmations, 0);
    await transitionFrame();
    assert.equal(dialog.isConnected, false);
  });
}

test("pending confirmations and required acknowledgements prevent duplicate or premature actions", async (t) => {
  const f = confirmationFixture(t);
  f.loading.value = true;
  await flush();
  let dialog = f.findWindow();
  assert.equal(dialog.querySelector(".window__control--close"), null);
  assert.ok(dialog.querySelector(".desktop-confirm__cancel").disabled);
  dialog.querySelector(".desktop-confirm__button--danger").click();
  dialog.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(f.open.value, true);
  assert.equal(f.events.confirmations + f.events.cancellations, 0);
  f.loading.value = false;
  f.disabled.value = true;
  await flush();
  dialog = f.findWindow();
  assert.ok(dialog.querySelector(".window__control--close"));
  dialog.querySelector(".desktop-confirm__button--danger").click();
  assert.equal(f.events.confirmations, 0);
  f.disabled.value = false;
  await flush();
  dialog.querySelector(".desktop-confirm__button--danger").click();
  assert.equal(f.events.confirmations, 1);
  assert.equal(f.open.value, true, "the owner decides when its asynchronous action has finished");
});

test("desktop confirmations preserve multiple choices and stack independently across application roots", async (t) => {
  const first = confirmationFixture(t, { title: "First" });
  await flush();
  const second = confirmationFixture(t, { title: "Choose action", actions: [
    { id: "immediate", text: "Try immediately", danger: true },
    { id: "queue", text: "Add to queue", highlighted: true }
  ] });
  await flush();
  const firstWindow = first.findWindow();
  const secondWindow = second.findWindow();
  assert.notEqual(firstWindow.querySelector('.window__title').id, secondWindow.querySelector('.window__title').id);
  assert.ok(Number(secondWindow.style.zIndex) > Number(firstWindow.style.zIndex));
  const highlighted = secondWindow.querySelector(".desktop-confirm__button--highlighted");
  assert.ok(highlighted.textContent.includes("Add to queue"));
  highlighted.click();
  secondWindow.querySelector(".desktop-confirm__button--danger").click();
  assert.deepEqual(second.events.actions, ["queue", "immediate"]);
  firstWindow.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  await flush();
  assert.ok(Number(firstWindow.style.zIndex) > Number(secondWindow.style.zIndex));
});

for (const scenario of [
  { name: "negative centered coordinates", viewport: [1024, 768], initial: { initialX: -200, initialY: -90, initialWidth: 440, initialHeight: 420 }, expected: { left: 0, top: 0, width: 440, height: 420 } },
  { name: "saved coordinates beyond the bottom right", viewport: [1024, 768], initial: { initialX: 900, initialY: 650, initialWidth: 500, initialHeight: 400 }, expected: { left: 524, top: 16, width: 500, height: 400 } },
  { name: "an oversized application", viewport: [1024, 768], initial: { initialX: 150, initialY: 110, initialWidth: 1600, initialHeight: 900 }, expected: { left: 0, top: 16, width: 1024, height: 704 } },
  { name: "a subwindow on a small screen", viewport: [320, 240], initial: { initialX: -60, initialY: -90, initialWidth: 440, initialHeight: 420, resizable: false }, expected: { left: 0, top: 16, width: 320, height: 176 } }
]) {
  test(`windows fit before the first frame with ${scenario.name}`, async (t) => {
    viewportFixture(t, ...scenario.viewport);
    const f = boundsFixture(t, scenario.initial);
    assert.deepEqual(f.bounds(), scenario.expected, "the first rendered style must already be within the work area");
    f.assertInside();
    await flush();
    const { left: x, top: y, width, height } = scenario.expected;
    assert.deepEqual(f.changes, [{ x, y, width, height }], "publish corrected geometry for layout persistence");
  });
}

test("viewport changes fit existing windows, preserve the taskbar and stop observing after unmount", async (t) => {
  const resize = viewportFixture(t, 1280, 900);
  const f = boundsFixture(t, { initialX: 200, initialY: 150, initialWidth: 900, initialHeight: 650 });
  await flush();
  assert.equal(f.changes.length, 0);
  resize(640, 480);
  await flush();
  assert.deepEqual(f.bounds(), { left: 0, top: 0, width: 640, height: 432 });
  f.assertInside();
  assert.deepEqual(f.changes.at(-1), { x: 0, y: 0, width: 640, height: 432 });
  resize(1280, 900);
  await flush();
  f.assertInside();
  const updates = f.changes.length;
  f.app.unmount();
  resize(320, 240);
  assert.equal(f.changes.length, updates);
});

test("new windows reaching the bottom work-area edge open with a top gap before their first frame", async (t) => {
  viewportFixture(t, 1024, 768);
  const f = boundsFixture(t, { initialX: 120, initialY: 320, initialWidth: 500, initialHeight: 400 });
  assert.deepEqual(f.bounds(), { left: 120, top: 16, width: 500, height: 400 });
  await flush();
  assert.deepEqual(f.changes, [{ x: 120, y: 16, width: 500, height: 400 }]);
});

test("new windows with space below them keep their requested position", async (t) => {
  viewportFixture(t, 1024, 768);
  const f = boundsFixture(t, { initialX: 120, initialY: 319, initialWidth: 500, initialHeight: 400 });
  assert.deepEqual(f.bounds(), { left: 120, top: 319, width: 500, height: 400 });
  await flush();
  assert.equal(f.changes.length, 0);
});

test("existing windows resize into the work area without restarting at the top", async (t) => {
  const resize = viewportFixture(t, 1024, 900);
  const f = boundsFixture(t, { initialX: 120, initialY: 300, initialWidth: 500, initialHeight: 400 });
  await flush();
  resize(1024, 748);
  await flush();
  assert.deepEqual(f.bounds(), { left: 120, top: 300, width: 500, height: 400 });
  resize(1024, 700);
  await flush();
  assert.deepEqual(f.bounds(), { left: 120, top: 252, width: 500, height: 400 });
  f.assertInside();
});

for (const channel of ["visible", "minimized"]) {
  test(`showing a window through ${channel} fits a previously dragged position`, async (t) => {
    viewportFixture(t, 1024, 768);
    const f = boundsFixture(t, { initialWidth: 400, initialHeight: 300 });
    await flush();
    f.dragOutside();
    await flush();
    assert.ok(f.bounds().left + f.bounds().width > window.innerWidth);
    f.state[channel] = channel === "minimized";
    await flush();
    f.state[channel] = channel === "visible";
    await flush();
    f.assertInside();
    assert.notEqual(f.element.style.display, "none");
  });
}

test("context-menu maximization restores the latest user size and remains bounded after a screen change", async (t) => {
  const resize = viewportFixture(t, 1280, 900);
  const f = boundsFixture(t);
  await flush();
  f.element.querySelector(".window__resize-handle--se").dispatchEvent(new MouseEvent("mousedown", {
    clientX: 900, clientY: 560, bubbles: true, button: 0
  }));
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 1000, clientY: 710 }));
  document.dispatchEvent(new MouseEvent("mouseup"));
  await flush();
  const resized = f.bounds();
  assert.deepEqual(resized, { left: 100, top: 60, width: 900, height: 650 });
  f.state.maximized = true;
  await flush();
  f.state.maximized = false;
  await flush();
  assert.deepEqual(f.bounds(), resized);
  f.state.maximized = true;
  await flush();
  resize(640, 480);
  await flush();
  f.state.maximized = false;
  await flush();
  f.assertInside();
  assert.deepEqual(f.bounds(), { left: 0, top: 0, width: 640, height: 432 });
});

test("the standalone desktop login window centers using its actual size and stays inside a smaller screen", async (t) => {
  const resize = viewportFixture(t, 800, 600);
  const getRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    return this.classList.contains("desktop-login-window")
      ? { width: Math.min(380, window.innerWidth), height: Math.min(340, window.innerHeight) }
      : getRect.call(this);
  };
  t.after(() => { HTMLElement.prototype.getBoundingClientRect = getRect; });
  const Login = loadSfc("panel/plugins/user/src/desktop/DesktopLoginWindow.vue", {
    "@/config/router": { router: { push() {} } },
    "@/lang/i18n": translations,
    "@/services/apis": { loginUser: () => ({ execute: async () => ({}) }) },
    "@/stores/useAppStateStore": { useAppStateStore: () => ({ updateUserInfo: async () => {} }) },
    "@/stores/useAppConfigStore": { useAppConfigStore: () => ({ isDarkTheme: vue.ref(false) }) },
    "@/tools/common": { sleep: async () => {} },
    "@/tools/desktopNotice": {},
    "../assets": { desktopIconDarkUrl: "/icon.svg", desktopIconUrl: "/icon.svg" }
  });
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = vue.createApp(Login);
  app.use(Vuetify.createVuetify());
  app.mount(target);
  t.after(() => { app.unmount(); target.remove(); });
  await flush();
  const element = target.querySelector(".desktop-login-window");
  assert.equal(element.style.left, "210px");
  assert.equal(element.style.top, "130px");
  resize(320, 240);
  await flush();
  assert.equal(element.style.left, "0px");
  assert.equal(element.style.top, "0px");
});
