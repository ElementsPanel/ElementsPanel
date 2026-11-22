const { from, createBrowser, createLoader, compileSfc } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const { after, test } = require("node:test");

const dom = createBrowser();
after(() => dom.window.close());
const frontendRequire = from("frontend");
const vue = frontendRequire("vue");
const Vuetify = frontendRequire("vuetify/dist/vuetify.js");
const load = createLoader({ host: "frontend" });
const filename = "plugins/console/panel/src/components/TargetSelectionList.vue";
const TargetSelectionList = load(
  filename,
  {
    vue,
    "@/lang/i18n": { t: (key) => key },
    "vuetify/components": Vuetify.components
  },
  compileSfc(filename, { inlineTemplate: true })
).default;

function fixture(t, items) {
  const selected = vue.ref([]);
  const disabled = vue.ref(false);
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = vue.createApp({
    render: () =>
      vue.h(TargetSelectionList, {
        items,
        disabled: disabled.value,
        modelValue: selected.value,
        "onUpdate:modelValue": (value) => {
          selected.value = value;
        }
      })
  });
  app.use(Vuetify.createVuetify());
  app.mount(target);
  t.after(() => {
    app.unmount();
    target.remove();
  });
  const all = () => target.querySelector('.target-selection-toolbar input[type="checkbox"]');
  const rows = () => [...target.querySelectorAll('.target-selection-item input[type="checkbox"]')];
  const search = async (value) => {
    const input = target.querySelector(".v-text-field input");
    input.value = value;
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    await vue.nextTick();
  };
  return { selected, disabled, target, all, rows, search };
}

test("large target lists select across pages and search, including the panel and excluding protected nodes", async (t) => {
  const items = [
    { value: "", title: "Current panel" },
    ...Array.from({ length: 1000 }, (_, index) => ({
      value: `node-${index + 1}`,
      title: `Node ${index + 1}`,
      subtitle: `host-${index + 1}:24444`,
      disabled: index === 14,
      hint: index === 14 ? "Protected plugin" : undefined
    }))
  ];
  const f = fixture(t, items);
  assert.equal(f.rows().length, 10, "only one page of targets is mounted");
  f.rows()[0].click();
  await vue.nextTick();
  assert.deepEqual([...f.selected.value], [""], "the panel's empty ID is a valid selection");

  f.target.querySelector(".v-pagination__next button").click();
  await vue.nextTick();
  assert.equal(f.rows().length, 10);
  assert.equal(f.rows().filter((input) => input.disabled).length, 1);
  f.rows()[0].click();
  await vue.nextTick();
  assert.deepEqual([...f.selected.value], ["", "node-10"]);

  await f.search(" HOST-999:24444 ");
  assert.equal(
    f.rows().length,
    1,
    "address search resets pagination and finds a later-page target"
  );
  assert.match(f.target.querySelector(".target-selection-item").textContent, /Node 999/);
  assert.match(f.target.querySelector(".target-selection-item").textContent, /host-999:24444/);
  assert.deepEqual(
    [...f.selected.value],
    ["", "node-10"],
    "search keeps selections from other pages"
  );
  f.all().click();
  await vue.nextTick();
  assert.equal(
    f.selected.value.length,
    1000,
    "select all covers every eligible target across search and pages"
  );
  assert.equal(f.selected.value.includes(""), true);
  assert.equal(f.selected.value.includes("node-15"), false);
  assert.equal(f.all().checked, true);
  f.rows()[0].click();
  await vue.nextTick();
  assert.equal(f.selected.value.length, 999);
  assert.equal(f.all().getAttribute("aria-checked"), "mixed");
  f.all().click();
  await vue.nextTick();
  assert.equal(f.selected.value.length, 1000);
  f.all().click();
  await vue.nextTick();
  assert.deepEqual([...f.selected.value], [], "deselect all also clears targets hidden by search");

  await f.search("no matching targets");
  assert.equal(f.rows().length, 0);
  assert.match(f.target.textContent, /TXT_CODE_NO_DATA/);
  await f.search("");
  assert.equal(f.rows().length, 10);
  assert.match(f.target.querySelector(".target-selection-item").textContent, /Current panel/);
});

test("target selection controls lock during submission and skip lists with no eligible targets", async (t) => {
  const f = fixture(
    t,
    Array.from({ length: 20 }, (_, index) => ({
      value: String(index),
      title: `Node ${index}`
    }))
  );
  f.disabled.value = true;
  await vue.nextTick();
  assert.equal(f.all().disabled, true);
  assert.equal(
    f.rows().every((input) => input.disabled),
    true
  );
  assert.equal(f.target.querySelector(".v-text-field input").disabled, true);
  assert.equal(f.target.querySelector(".v-pagination__next button").disabled, true);
  f.all().click();
  f.rows()[0].click();
  await vue.nextTick();
  assert.deepEqual([...f.selected.value], []);

  const protectedList = fixture(t, [{ value: "source", title: "Source plugin", disabled: true }]);
  assert.equal(protectedList.all().disabled, true);
  assert.equal(protectedList.rows()[0].disabled, true);
});
