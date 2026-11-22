const assert = require("node:assert/strict");
const path = require("node:path");
const { after, test } = require("node:test");
const { from, root, createBrowser, createLoader, compileSfc, settle } = require("./helpers.cjs");

const browser = createBrowser();
after(() => browser.window.close());
const frontend = from("frontend");
const vue = frontend("vue");
const Vuetify = frontend("vuetify/dist/vuetify.js");
const load = createLoader({
  host: "frontend",
  resolve(id, { filename, localRequire, load, overrides }) {
    if (id.endsWith(".vue")) {
      const source = id.startsWith("@/")
        ? path.resolve(root, "plugins/console/panel/src", id.slice(2))
        : path.resolve(path.dirname(filename), id);
      const relative = path.relative(root, source);
      return load(relative, overrides, compileSfc(relative, { inlineTemplate: true })).default;
    }
    if (id.startsWith("@/")) return load(`plugins/console/panel/src/${id.slice(2)}.ts`, overrides);
    return localRequire(id);
  }
});
const flush = async () => {
  for (let i = 0; i < 8; i++) await vue.nextTick();
  await settle();
};

async function fixture(t) {
  const records = ["first", "second"].map((id) => ({
    id,
    enabled: true,
    running: true,
    removable: true,
    state: "active",
    hasSettings: false
  }));
  const writes = [];
  const groupWrites = [];
  const result = (value) => ({ execute: async () => ({ value }) });
  const api = {
    pluginList: () => ({
      execute: async () => ({ value: records.map((record) => ({ ...record })) })
    }),
    pluginGroupList: () =>
      result([
        { id: "a", name: "A", pluginIds: ["first", "second"] },
        { id: "b", name: "B", pluginIds: [] }
      ]),
    updatePluginGroupList: () => ({ execute: async ({ data }) => groupWrites.push(data) }),
    pluginRemarkList: () => result([]),
    pluginSettings: () => result(null),
    setPluginEnabled: () => ({
      execute: async ({ data }) => {
        writes.push(data);
        const record = records.find((record) => record.id === data.id);
        record.enabled = data.enabled;
        record.state = data.enabled ? "active" : "disabled";
        return { value: { result: { application: "applied" } } };
      }
    })
  };
  const filename = "plugins/config/panel/src/components/ConfigPage.vue";
  const Page = load(
    filename,
    {
      vue,
      "vuetify/components": Vuetify.components,
      "@elements-panel/sdk": {
        ctx: { plugins: { loaded: [], refresh: async () => {} } },
        usePluginService: () => undefined
      },
      "@elementspanel/epanel-plugin-i18n": { t: (key) => key },
      "@elementspanel/epanel-plugin-console/components/Empty": { render: () => null },
      "@elementspanel/epanel-plugin-console/hooks/useScreen": {
        useScreen: () => ({ isPhone: vue.ref(false) })
      },
      "@elementspanel/epanel-plugin-console/tools/vuetifyToast": {
        message: { success() {}, error() {} }
      },
      "@elementspanel/epanel-plugin-console/tools/validator": { getValidatorErrorMsg: String },
      "vue-router": {
        useRoute: () => ({ path: "/desktop", query: {} }),
        useRouter: () => ({}),
        onBeforeRouteLeave() {}
      },
      "../api": api,
      "./SettingsPages.vue": { render: () => null }
    },
    compileSfc(filename, { inlineTemplate: true })
  ).default;
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = vue.createApp(Page, { hideTargetSelect: true });
  app.use(Vuetify.createVuetify());
  app.mount(target);
  t.after(() => {
    app.unmount();
    target.remove();
  });
  await flush();
  return {
    target,
    writes,
    groupWrites,
    row: (id) =>
      [...target.querySelectorAll(".plugin-config-item")].find(
        (row) => row.querySelector(".v-list-item-title").textContent === id
      ),
    selected: () => target.querySelector(".plugin-config-title h2").textContent
  };
}

function pointer(type, target, x = 10, y = 10) {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    clientX: x,
    clientY: y
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    isPrimary: { value: true },
    pointerType: { value: "mouse" }
  });
  target.dispatchEvent(event);
  return event;
}

const click = (target) =>
  target.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })
  );

test("config list forwards clicks and drag events while keeping Vuetify ripples", async (t) => {
  const f = await fixture(t);
  assert.equal(f.selected(), "first");
  const second = f.row("second");
  Object.defineProperties(second, { clientWidth: { value: 180 }, clientHeight: { value: 36 } });
  assert.equal(pointer("pointerdown", second).defaultPrevented, false);
  second.dispatchEvent(
    new window.MouseEvent("mousedown", { bubbles: true, clientX: 20, clientY: 10 })
  );
  const ripple = second.querySelector(".v-ripple__animation");
  assert.ok(ripple);
  assert.ok(parseFloat(ripple.style.width) > 0);
  pointer("pointerup", window);
  second.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true }));
  click(second);
  await flush();
  assert.equal(f.selected(), "second");

  const previousHitTest = document.elementFromPoint;
  document.elementFromPoint = () => f.target.querySelector('[data-plugin-group-id="b"]');
  t.after(() => {
    document.elementFromPoint = previousHitTest;
  });
  pointer("pointerdown", f.row("first"));
  pointer("pointermove", window, 50, 50);
  assert.ok(document.querySelector("body > span"), "dragging creates a preview");
  pointer("pointerup", window, 50, 50);
  await flush();
  assert.deepEqual(f.groupWrites.at(-1).groups.find((group) => group.id === "b").pluginIds, [
    "first"
  ]);
  click(f.row("first"));
  await flush();
  assert.equal(f.selected(), "second", "a drag must not select its plugin");
  pointer("pointerdown", f.row("first"));
  pointer("pointerup", window);
  click(f.row("first"));
  await flush();
  assert.equal(f.selected(), "first", "a later normal click still selects the plugin");
});

test("config action dialogs forward cancellation and confirmation to the selected plugin", async (t) => {
  const f = await fixture(t);
  const button = (container, key) =>
    [...container.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === key || button.textContent.trim() === key
    );
  click(button(f.target, "TXT_CODE_PLUGIN_DISABLE"));
  await flush();
  const dialog = () => document.querySelector(".v-dialog.v-overlay--active");
  assert.ok(dialog());
  click(button(dialog(), "TXT_CODE_PLUGIN_CANCEL"));
  await flush();
  assert.equal(dialog(), null);
  assert.deepEqual(f.writes, []);
  click(button(f.target, "TXT_CODE_PLUGIN_DISABLE"));
  await flush();
  click(button(dialog(), "TXT_CODE_PLUGIN_DISABLE"));
  await flush();
  assert.deepEqual(f.writes, [{ id: "first", enabled: false }]);
  assert.equal(dialog(), null);
  assert.ok(button(f.target, "TXT_CODE_PLUGIN_ENABLE"));
});
