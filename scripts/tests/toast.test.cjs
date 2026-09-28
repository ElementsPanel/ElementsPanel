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
window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {}
});
after(() => dom.window.close());

const vue = frontendRequire("vue");
const Vuetify = frontendRequire("vuetify/dist/vuetify.js");
const ts = frontendRequire("typescript");

function fixture(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  for (const name of ["setTimeout", "clearTimeout", "setInterval", "clearInterval"]) {
    t.mock.method(window, name, global[name]);
  }
  const vuetify = Vuetify.createVuetify({
    defaults: { VSnackbarQueue: { transition: { css: false } } }
  });
  const filename = path.join(root, "panel/plugins/console/src/tools/vuetifyToast.ts");
  const mod = new Module(filename, module);
  const imports = {
    vue,
    "vuetify/components": Vuetify.components,
    "../vuetify": { installVuetify: (app) => app.use(vuetify) }
  };
  mod.require = (id) => imports[id] ?? frontendRequire(id);
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText,
    filename
  );
  t.after(() => mod.exports.destroyAll());
  return { ...mod.exports, vuetify };
}

async function flush() {
  await vue.nextTick();
  await vue.nextTick();
}

async function advance(t, milliseconds) {
  t.mock.timers.tick(milliseconds);
  await flush();
}

const visible = () =>
  [...document.querySelectorAll(".v-snackbar--active.vuetify-toast")]
    .sort(
      (a, b) =>
        Number(a.style.getPropertyValue("--v-snackbar-index")) -
        Number(b.style.getPropertyValue("--v-snackbar-index"))
    )
    .map((element) => element.querySelector(".vuetify-toast-text").textContent);

test("toast bursts show three messages and drain the waiting queue in arrival order", async (t) => {
  const { message } = fixture(t);
  const handles = ["one", "two", "three", "four", "five"].map((text) => message.info(text, 0));
  await flush();
  assert.deepEqual(visible(), ["three", "two", "one"]);
  assert.equal(document.querySelectorAll(".v-snackbar.vuetify-toast").length, 3);
  assert.equal(document.querySelector(".vuetify-toast-host .v-snackbar"), null);

  handles[0].close();
  handles[0].close();
  await flush();
  assert.deepEqual(visible(), ["four", "three", "two"]);

  handles[1].close();
  await flush();
  assert.deepEqual(visible(), ["five", "four", "three"]);
});

test("default toasts last five seconds and waiting messages receive their full timeout", async (t) => {
  const { message } = fixture(t);
  ["one", "two", "three", "waiting"].forEach((text) => message.success(text));
  await flush();
  await advance(t, 4999);
  assert.deepEqual(visible(), ["three", "two", "one"]);
  await advance(t, 1);
  assert.deepEqual(visible(), ["waiting"]);

  await advance(t, 4999);
  assert.deepEqual(visible(), ["waiting"]);
  await advance(t, 1);
  assert.equal(document.querySelector(".vuetify-toast-host"), null);
});

test("pending messages can be cancelled and duration zero stays open", async (t) => {
  const { message } = fixture(t);
  const handles = ["one", "two", "three", "cancelled"].map((text) => message.warning(text, 0));
  message.info("short", 100);
  handles[3].close();
  await flush();
  await advance(t, 10000);
  assert.deepEqual(visible(), ["three", "two", "one"]);

  handles[0].close();
  await flush();
  assert.deepEqual(visible(), ["short", "three", "two"]);
  await advance(t, 99);
  assert.deepEqual(visible(), ["short", "three", "two"]);
  await advance(t, 1);
  assert.deepEqual(visible(), ["three", "two"]);
});

test("blank messages are ignored while descriptions and renderable content are preserved", async (t) => {
  const { message, notification, vuetify } = fixture(t);
  message.info(" \n ");
  message.info(undefined);
  message.info(() => [" ", undefined]);
  notification.open({ message: "", description: " " });
  assert.equal(document.querySelector(".vuetify-toast-host"), null);

  notification.error({ message: " Title ", description: " Details ", duration: 0 });
  message.warn(() => ["Before ", vue.h("strong", "rich"), () => " after"], 0);
  message.info(0, 0);
  await flush();
  assert.deepEqual(visible(), ["0", "Before rich after", "TitleDetails"]);
  assert.equal(document.querySelector(".vuetify-toast-description").textContent, "Details");
  assert.equal(document.querySelector(".vuetify-toast-text strong").textContent, "rich");
  assert.ok(document.querySelector(".vuetify-toast .mdi-alert-circle-outline"));
  assert.ok(document.querySelector(".vuetify-toast .mdi-alert-outline"));

  await vuetify.theme.change("dark");
  await flush();
  assert.equal(
    document.querySelectorAll(".vuetify-toast .v-snackbar__wrapper.v-theme--dark").length,
    3
  );
});

test("immediate close and destroyAll release the host without reviving old messages", async (t) => {
  const { message, destroyAll } = fixture(t);
  message.info("immediate", 0).close();
  await flush();
  assert.equal(document.querySelector(".vuetify-toast-host"), null);

  const handles = ["one", "two", "three", "waiting"].map((text) => message.info(text, 0));
  await flush();
  handles[0].close();
  destroyAll();
  assert.equal(document.querySelector(".vuetify-toast-host"), null);

  const fresh = message.success("fresh", 0);
  await flush();
  await advance(t, 1000);
  handles.forEach((handle) => handle.close());
  await flush();
  assert.deepEqual(visible(), ["fresh"]);
  assert.equal(document.querySelectorAll(".vuetify-toast-host").length, 1);

  fresh.close();
  await flush();
  assert.equal(document.querySelector(".vuetify-toast-host"), null);
});
