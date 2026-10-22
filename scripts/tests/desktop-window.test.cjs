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
