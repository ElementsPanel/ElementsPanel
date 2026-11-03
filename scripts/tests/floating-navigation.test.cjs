const { from, createBrowser, createLoader, compileSfc } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const { after, test } = require("node:test");

const dom = createBrowser();
after(() => dom.window.close());
const frontend = from("frontend");
const vue = frontend("vue");
const vueUse = frontend("@vueuse/core");
const load = createLoader({
  transform: (source, filename) =>
    filename.endsWith(".vue") ? compileSfc(filename, { inlineTemplate: true }) : source
});
const positionStorageKey = "app-floating-navigation-position";

async function fixture(t, { preservePosition = false } = {}) {
  if (!preservePosition) localStorage.removeItem(positionStorageKey);
  window.innerWidth = 390;
  window.innerHeight = 844;
  const visited = [];
  const panelHeight = vue.ref(188);
  const Navigation = load("plugins/console/panel/src/components/AppBottomNav.vue", {
    "@/hooks/useHeaderMenus": {
      useHeaderMenus: () => ({
        menus: vue.ref([
          { path: "/instances", name: "Instances", meta: {} },
          { path: "/users", name: "Users", meta: {} },
          ...Array.from({ length: 7 }, (_, index) => ({
            path: `/menu-${index}`, name: `Menu ${index}`, meta: {}
          }))
        ]),
        handleToPage: (path) => visited.push(path)
      })
    },
    "@vueuse/core": {
      ...vueUse,
      useElementSize: () => ({ width: vue.ref(188), height: panelHeight })
    },
    "vue-router": { useRoute: () => ({ path: "/instances" }) },
    "vuetify/components": {
      VIcon: vue.defineComponent({ render: () => vue.h("i") })
    }
  }).default;
  const target = document.createElement("div");
  document.body.append(target);
  const app = vue.createApp(Navigation);
  app.mount(target);
  const unmount = () => {
    if (target.childElementCount) app.unmount();
    target.remove();
  };
  t.after(unmount);
  await vue.nextTick();

  const ball = target.querySelector(".fab-ball");
  const container = target.querySelector(".fab-container");
  const captures = new Set();
  ball.setPointerCapture = (id) => captures.add(id);
  ball.hasPointerCapture = (id) => captures.has(id);
  ball.releasePointerCapture = (id) => captures.delete(id);
  const position = () => ({ x: parseFloat(container.style.left), y: parseFloat(container.style.top) });
  const pointer = (type, x, y, { pointerId = 1, isPrimary = true, button = 0 } = {}) => {
    const event = new window.MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, button
    });
    Object.defineProperties(event, {
      pointerId: { value: pointerId },
      pointerType: { value: "touch" },
      isPrimary: { value: isPrimary }
    });
    ball.dispatchEvent(event);
    return event;
  };
  const click = async (detail = 1) => {
    ball.dispatchEvent(new window.MouseEvent("click", { bubbles: true, detail }));
    await vue.nextTick();
  };
  const dragTo = async (x, y) => {
    const start = position();
    pointer("pointerdown", start.x + 8, start.y + 20);
    pointer("pointermove", x + 8, y + 20);
    await vue.nextTick();
    const moved = position();
    pointer("pointerup", x + 8, y + 20);
    await vue.nextTick();
    await click();
    return moved;
  };
  return { target, ball, captures, panelHeight, visited, pointer, click, position, dragTo, unmount };
}

test("floating navigation docks to the nearest edge without opening the menu on release", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.dragTo(80, 150), { x: 80, y: 150 }, "the ball follows both drag axes");
  assert.deepEqual(f.position(), { x: 8, y: 150 });
  assert.equal(f.ball.getAttribute("aria-expanded"), "false");
  assert.equal(f.captures.size, 0);

  await f.click();
  assert.equal(f.ball.getAttribute("aria-expanded"), "true");
  assert.deepEqual(f.position(), { x: 8, y: 150 });
  f.panelHeight.value = 420;
  await vue.nextTick();
  assert.deepEqual(f.position(), { x: 8, y: 150 }, "menu resizing must not shift the ball");
  await f.click();
  assert.equal(f.ball.getAttribute("aria-expanded"), "false");
  assert.deepEqual(f.position(), { x: 8, y: 150 });
  await f.dragTo(250, 300);
  assert.deepEqual(f.position(), { x: 326, y: 300 });
});

test("small touch movements still count as taps and do not move the ball", async (t) => {
  const f = await fixture(t);
  const start = f.position();
  f.pointer("pointerdown", 372, 540);
  f.pointer("pointermove", 374, 542);
  f.pointer("pointerup", 374, 542);
  await f.click();
  assert.equal(f.ball.getAttribute("aria-expanded"), "true");
  assert.deepEqual(f.position(), start);
});

test("docked position persists across remounts on either edge", async (t) => {
  const left = await fixture(t);
  await left.dragTo(80, 150);
  assert.deepEqual(JSON.parse(localStorage.getItem(positionStorageKey)), { left: true, top: 150 });
  await left.click();
  left.unmount();

  const restored = await fixture(t, { preservePosition: true });
  assert.deepEqual(restored.position(), { x: 8, y: 150 });
  assert.equal(restored.ball.classList.contains("fab-ball--left"), true);
  assert.equal(restored.ball.getAttribute("aria-expanded"), "false");
  await restored.dragTo(250, 300);
  restored.unmount();

  const right = await fixture(t, { preservePosition: true });
  assert.deepEqual(right.position(), { x: 326, y: 300 });
  assert.equal(right.ball.classList.contains("fab-ball--left"), false);
});

test("stored positions stay reachable and invalid saved fields use defaults", async (t) => {
  localStorage.setItem(positionStorageKey, JSON.stringify({ left: true, top: 5000 }));
  const outside = await fixture(t, { preservePosition: true });
  assert.deepEqual(outside.position(), { x: 8, y: 780 });
  outside.unmount();

  for (const value of [null, 42, { left: "left", top: "invalid" }]) {
    localStorage.setItem(positionStorageKey, JSON.stringify(value));
    const invalid = await fixture(t, { preservePosition: true });
    assert.deepEqual(invalid.position(), { x: 326, y: 534.8 });
    invalid.unmount();
  }
});

test("idle navigation fades and tucks away, then wakes on interaction", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = await fixture(t);
  const idle = () => f.ball.classList.contains("fab-ball--idle");
  t.mock.timers.tick(4999);
  await vue.nextTick();
  assert.equal(idle(), false);
  t.mock.timers.tick(1);
  await vue.nextTick();
  assert.equal(idle(), true);

  f.ball.dispatchEvent(new window.Event("pointerenter"));
  await vue.nextTick();
  assert.equal(idle(), false);
  t.mock.timers.tick(5000);
  await vue.nextTick();
  assert.equal(idle(), true);

  await f.click();
  assert.equal(idle(), false);
  assert.equal(f.ball.getAttribute("aria-expanded"), "true");
  t.mock.timers.tick(15000);
  await vue.nextTick();
  assert.equal(idle(), false, "an open menu must keep the button visible");
  await f.click();
  t.mock.timers.tick(5000);
  await vue.nextTick();
  assert.equal(idle(), true);

  const start = f.position();
  f.pointer("pointerdown", start.x + 10, start.y + 20);
  await vue.nextTick();
  assert.equal(idle(), false);
  t.mock.timers.tick(15000);
  await vue.nextTick();
  assert.equal(idle(), false, "a held pointer must not hide before it is released");
  f.pointer("pointermove", 90, 200);
  f.pointer("pointerup", 90, 200);
  await f.click();
  assert.equal(f.ball.classList.contains("fab-ball--left"), true);
  t.mock.timers.tick(5000);
  await vue.nextTick();
  assert.equal(idle(), true);
});

test("dragging preserves a visible handle at viewport edges and survives rotation", async (t) => {
  const f = await fixture(t);
  await f.dragTo(-500, -500);
  assert.deepEqual(f.position(), { x: 8, y: 8 });
  await f.dragTo(1000, 1000);
  assert.deepEqual(f.position(), { x: 326, y: 780 });

  window.innerWidth = 320;
  window.innerHeight = 390;
  window.dispatchEvent(new window.Event("resize"));
  await vue.nextTick();
  assert.deepEqual(f.position(), { x: 256, y: 326 });
  await f.click();
  assert.deepEqual(f.position(), { x: 256, y: 326 });
  window.innerWidth = 844;
  window.innerHeight = 390;
  window.dispatchEvent(new window.Event("resize"));
  await vue.nextTick();
  assert.deepEqual(f.position(), { x: 780, y: 326 }, "rotation keeps the selected dock edge");
});

for (const end of ["pointercancel", "lostpointercapture"]) {
  test(`${end} ends a drag without trapping later gestures or keyboard activation`, async (t) => {
    const f = await fixture(t);
    const start = f.position();
    f.pointer("pointerdown", 372, 540);
    f.pointer("pointermove", 100, 100);
    f.pointer(end, 100, 100);
    await vue.nextTick();
    const stopped = f.position();
    assert.notDeepEqual(stopped, start);
    f.pointer("pointermove", 200, 200);
    await vue.nextTick();
    assert.deepEqual(f.position(), stopped);
    assert.equal(f.ball.classList.contains("fab-ball--dragging"), false);
    await f.click(0);
    assert.equal(f.ball.getAttribute("aria-expanded"), "true");
    await f.dragTo(120, 240);
    assert.deepEqual(f.position(), { x: 8, y: 240 });
    assert.equal(f.ball.getAttribute("aria-expanded"), "true");
  });
}

test("secondary pointers and mouse buttons cannot take over an active drag", async (t) => {
  const f = await fixture(t);
  const start = f.position();
  f.pointer("pointerdown", 372, 540, { button: 2 });
  f.pointer("pointermove", 100, 100);
  await vue.nextTick();
  assert.deepEqual(f.position(), start);
  f.pointer("pointerdown", 372, 540);
  f.pointer("pointerdown", 50, 50, { pointerId: 2, isPrimary: false });
  f.pointer("pointermove", 100, 100, { pointerId: 2 });
  f.pointer("pointerup", 100, 100, { pointerId: 2 });
  await vue.nextTick();
  assert.deepEqual(f.position(), start);
  assert.equal(f.captures.has(1), true);
  f.pointer("pointerup", 372, 540);
  await f.click();
  assert.equal(f.ball.getAttribute("aria-expanded"), "true");
});

test("expanded menus fit at either docked edge without moving or covering the ball", async (t) => {
  const f = await fixture(t);
  for (const [x, y] of [[8, 8], [326, 8], [8, 780], [326, 780], [167, 387]]) {
    await f.dragTo(x, y);
    if (f.ball.getAttribute("aria-expanded") !== "true") await f.click();
    const panel = f.target.querySelector(".fab-menu-panel");
    const left = parseFloat(panel.style.left);
    const top = parseFloat(panel.style.top);
    const width = 188;
    const height = Math.min(f.panelHeight.value, parseFloat(panel.style.maxHeight));
    const position = f.position();
    assert.ok(left >= 8 && left + width <= 382, "menu must fit horizontally");
    assert.ok(top >= 8 && top + height <= 836, "menu must fit vertically");
    assert.ok(left + width <= position.x || left >= position.x + 56 || top + height <= y || top >= y + 56,
      "menu must not cover the handle");
    assert.deepEqual(position, { x: x + 28 < 195 ? 8 : 326, y });
  }
  const start = f.position();
  f.target.querySelectorAll(".fab-menu-item")[1].click();
  await vue.nextTick();
  assert.deepEqual(f.visited, ["/users"]);
  assert.equal(f.ball.getAttribute("aria-expanded"), "false");
  assert.deepEqual(f.position(), start);
});
