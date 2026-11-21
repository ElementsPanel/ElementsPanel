const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, test } = require("node:test");
const { createBrowser, createLoader, compileSfc, from, settle } = require("./helpers.cjs");

const load = createLoader({
  resolve(id, { filename, localRequire, load, overrides }) {
    if (id.endsWith(".vue")) return { render: () => null };
    const target = path.resolve(path.dirname(filename), id) + ".ts";
    return id.startsWith(".") && fs.existsSync(target) ? load(target, overrides) : localRequire(id);
  }
});
const layoutTools = load("plugins/desktop/panel/src/iconLayout.ts");

function assertInside(points, grid, count) {
  assert.equal(points.size, count);
  const cells = new Set();
  for (const point of points.values()) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    assert.ok(point.x >= 0 && point.y >= 0);
    assert.ok(point.x + grid.iconWidth <= grid.width + 1e-6);
    assert.ok(point.y + grid.iconHeight <= grid.height + 1e-6);
    const { col, row } = layoutTools.getIconCell(point, grid);
    cells.add(`${col},${row}`);
  }
  assert.equal(cells.size, count, "icons must not hide each other");
  const values = [...points.values()];
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const a = values[i];
      const b = values[j];
      const outlines = grid.scale * 2;
      assert.ok(a.x + grid.iconWidth + outlines < b.x + 1e-6 || b.x + grid.iconWidth + outlines < a.x + 1e-6 ||
        a.y + grid.iconHeight + outlines < b.y + 1e-6 || b.y + grid.iconHeight + outlines < a.y + 1e-6,
      "selected icon outlines must remain separated");
    }
  }
}

function assertBalanced(grid) {
  const left = layoutTools.getIconPosition({ col: 0, row: 0 }, grid).x;
  const rightmost = layoutTools.getIconPosition({ col: grid.columns - 1, row: 0 }, grid).x;
  const right = grid.width - rightmost - grid.iconWidth;
  assert.ok(Math.abs(left - right) < 1e-6, "the grid must have equal horizontal margins");
}

test("desktop grids keep every icon visible across crowded, narrow and resized work areas", () => {
  for (const [width, height, count] of [[1440, 852, 6], [1024, 720, 100], [320, 152, 100], [240, 100, 5], [90, 104, 1]]) {
    const ids = Array.from({ length: count }, (_, index) => `icon-${index}`);
    const grid = layoutTools.createIconGrid(width, height, count);
    assert.ok(grid.columns * grid.rows >= count);
    const saved = new Map(ids.map(id => [id, { x: 16, y: 16 }]));
    saved.set(ids[0], { x: -500, y: height + 500 });
    if (count > 1) saved.set(ids[1], { x: NaN, y: Infinity });
    const arranged = layoutTools.arrangeDesktopIcons(ids, saved, grid);
    assertInside(arranged, grid, count);
    assertBalanced(grid);
    assert.deepEqual(layoutTools.arrangeDesktopIcons(ids, arranged, grid), arranged, "normalizing again must preserve saved grid positions");
    for (const [nextWidth, nextHeight] of [[200, 150], [1800, 1000], [500, 300]]) {
      const resized = layoutTools.createIconGrid(nextWidth, nextHeight, count);
      const points = layoutTools.arrangeDesktopIcons(ids, arranged, resized);
      assertInside(points, resized, count);
      assertBalanced(resized);
      const edge = layoutTools.getIconPosition(layoutTools.getIconCell({ x: 100000, y: -100000 }, resized), resized);
      assertInside(new Map([["edge", edge]]), resized, 1);
    }
  }
  assert.equal(layoutTools.createIconGrid(1440, 852, 6).scale, 1);
  const grid = layoutTools.createIconGrid(1000, 720, 1);
  for (const cell of [{ col: 0, row: 0 }, { col: grid.columns - 1, row: 1 }]) {
    const point = layoutTools.getIconPosition(cell, grid);
    const saved = new Map([["free-icon", point]]);
    assert.deepEqual(layoutTools.arrangeDesktopIcons(["free-icon"], saved, grid), saved, "a single icon must remain where it was placed");
  }
});

test("group placement preserves negative offsets, avoids occupied cells and rejects shapes with no space", () => {
  const grid = layoutTools.createIconGrid(450, 400, 4);
  const offsets = [{ col: -1, row: 0 }, { col: 0, row: 0 }, { col: 0, row: -1 }];
  assert.deepEqual(layoutTools.findIconGroupCell({ col: 0, row: 0 }, offsets, new Set(), grid), { col: 1, row: 1 });
  const occupied = new Set(["1,1"]);
  const target = layoutTools.findIconGroupCell({ col: 2, row: 1 }, offsets, occupied, grid);
  assert.deepEqual(target, { col: 3, row: 1 });
  for (const offset of offsets) assert.equal(occupied.has(`${target.col + offset.col},${target.row + offset.row}`), false);
  assert.equal(layoutTools.findIconGroupCell({ col: 0, row: 0 }, [{ col: 0, row: 0 }, { col: grid.columns, row: 0 }], new Set(), grid), undefined);
  const full = new Set(Array.from({ length: grid.columns * grid.rows }, (_, index) => `${index % grid.columns},${Math.floor(index / grid.columns)}`));
  assert.equal(layoutTools.findIconGroupCell({ col: 2, row: 1 }, offsets, full, grid), undefined);
});

const browser = createBrowser();
after(() => browser.window.close());
const frontend = from("frontend");
const vue = frontend("vue");
const Vuetify = frontend("vuetify/dist/vuetify.js");
const instanceContract = load("core/common/src/instance_contract.ts");
const flush = async () => { await settle(); await vue.nextTick(); };

async function desktopFixture(t, savedIcons = []) {
  const previousSize = { width: window.innerWidth, height: window.innerHeight };
  const previousObserver = global.ResizeObserver;
  window.innerWidth = 800;
  window.innerHeight = 600;
  const observers = [];
  global.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  };
  const writes = [];
  const apps = ["a", "b", "c", "d"].map(id => ({
    id, label: id, icon: "mdi-application-outline", component: { render: () => vue.h("span", id) }
  }));
  const common = {
    vue,
    "vuetify/components": Vuetify.components,
    "@elementspanel/epanel-plugin-i18n": { t: key => key },
    "@elementspanel/epanel-plugin-console/stores/useAppConfigStore": { useAppConfigStore: () => ({ isDarkTheme: vue.ref(false) }) }
  };
  const iconFile = "plugins/desktop/panel/src/widgets/desktop/DesktopIcon.vue";
  const Icon = load(iconFile, common, compileSfc(iconFile, { inlineTemplate: true })).default;
  const Window = vue.defineComponent({
    props: ["window"],
    setup: (props) => () => vue.h("div", { class: "test-desktop-window", "data-window-id": props.window.id })
  });
  const Menu = vue.defineComponent({
    props: ["visible", "items"], emits: ["close"],
    setup: (props, { emit }) => () => props.visible ? vue.h("div", { class: "test-desktop-menu" }, props.items.map(item => vue.h("button", {
      onClick: () => { item.action(); emit("close"); }
    }, item.label))) : null
  });
  const file = "plugins/desktop/panel/src/Desktop.vue";
  const Desktop = load(file, {
    ...common,
    "@elementspanel/epanel-plugin-console/stores/useAppStateStore": { useAppStateStore: () => ({ state: {}, isAdmin: vue.ref(false), isLogged: vue.ref(true), authEnabled: vue.ref(false) }) },
    "@elementspanel/epanel-plugin-console/services/apis": {},
    "@elementspanel/epanel-plugin-console/tools/vuetifyModal": {},
    "@elementspanel/epanel-plugin-console/services/apis/appearance": { resolveBackgroundImage: () => "", getAppearance: () => ({ execute: async () => ({ value: {} }) }) },
    "@elements-panel/sdk": { ...instanceContract, usePluginService: () => undefined, ctx: { get: () => undefined, desktop: { apps, views: [], provideOpener: () => () => {} }, actions: { instances: [] } } },
    "./api": {
      getDesktopSettings: () => ({ execute: async () => ({ value: {} }) }),
      getDesktopLayoutConfig: () => ({ execute: async () => ({ value: { windows: [], shortcuts: apps.map(app => app.id), icons: savedIcons } }) }),
      setDesktopLayoutConfig: () => ({ execute: async ({ data }) => { writes.push(JSON.parse(JSON.stringify(data))); } })
    },
    "./widgets/desktop/DesktopIcon.vue": Icon,
    "./widgets/desktop/DesktopWindowHost.vue": Window,
    "./widgets/desktop/DesktopContextMenu.vue": Menu,
    "vue-router": { useRouter: () => ({ push() {} }) }
  }, compileSfc(file, { inlineTemplate: true })).default;
  const target = document.createElement("div");
  document.body.appendChild(target);
  const app = vue.createApp(Desktop);
  app.use(Vuetify.createVuetify());
  app.mount(target);
  let mounted = true;
  t.after(() => {
    if (mounted) app.unmount();
    target.remove();
    window.innerWidth = previousSize.width;
    window.innerHeight = previousSize.height;
    global.ResizeObserver = previousObserver;
  });
  await flush();
  const surface = target.querySelector(".desktop-icons");
  let workWidth;
  let workHeight;
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: workWidth || window.innerWidth, height: workHeight || window.innerHeight - 48 });
  const icons = () => [...target.querySelectorAll(".desktop-icon")];
  const icon = id => icons().find(element => element.querySelector(".desktop-icon__label").textContent === id);
  const points = () => new Map(icons().map(element => [element.querySelector(".desktop-icon__label").textContent, {
    x: parseFloat(element.style.left), y: parseFloat(element.style.top)
  }]));
  const scale = () => Number(icons()[0].style.transform.match(/scale\((.*)\)/)[1]);
  const mouse = (type, element, x, y, options = {}) => {
    const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === "mousemove" || type === "mousedown" ? 1 : 0, clientX: x, clientY: y, detail: 1, ...options });
    element.dispatchEvent(event);
    return event;
  };
  const selected = () => icons().filter(element => element.classList.contains("desktop-icon--selected")).map(element => element.querySelector(".desktop-icon__label").textContent).sort();
  return { target, surface, icons, icon, points, scale, mouse, selected, writes, observers,
    resize: async (width, height) => { window.innerWidth = width; window.innerHeight = height; window.dispatchEvent(new window.Event("resize")); await flush(); },
    resizeSurface: async (width, height) => { workWidth = width; workHeight = height; observers.at(-1).callback(); await flush(); },
    unmount: () => { app.unmount(); mounted = false; }
  };
}

function selectWithMarquee(f, ids, grid) {
  const points = ids.map(id => f.points().get(id));
  const left = Math.min(...points.map(point => point.x)) - 4;
  const top = Math.min(...points.map(point => point.y)) - 4;
  const right = Math.max(...points.map(point => point.x)) + grid.iconWidth + 4;
  const bottom = Math.max(...points.map(point => point.y)) + grid.iconHeight + 4;
  f.mouse("mousedown", f.surface, left, top);
  f.mouse("mousemove", document, right, bottom);
  f.mouse("mouseup", document, right, bottom);
  f.mouse("click", f.surface, right, bottom);
}

test("desktop drops, restoration and resize observation never put icons behind the taskbar", async (t) => {
  const f = await desktopFixture(t, [{ id: "a", x: 16, y: 16 }, { id: "b", x: -500, y: 100000 }]);
  assertInside(f.points(), layoutTools.createIconGrid(800, 552, 4), 4);
  const a = f.points().get("a");
  f.mouse("mousedown", f.icon("a"), a.x + 15, a.y + 15);
  f.mouse("mousemove", document, 5000, -300);
  f.mouse("mouseup", document, 5000, -300);
  f.mouse("click", f.surface, 790, 0);
  await flush();
  assertInside(f.points(), layoutTools.createIconGrid(800, 552, 4), 4);
  assert.ok(f.points().get("a").x > 800 * 0.7, "dropping on the right must not pull the icon back to the center");
  assertBalanced(layoutTools.createIconGrid(800, 552, 4));
  for (const [width, height] of [[280, 240], [1400, 900], [400, 300]]) {
    await f.resize(width, height);
    assertInside(f.points(), layoutTools.createIconGrid(width, height - 48, 4), 4);
    assertBalanced(layoutTools.createIconGrid(width, height - 48, 4));
  }
  await f.resizeSurface(200, 140);
  assertInside(f.points(), layoutTools.createIconGrid(200, 140, 4), 4);
  assertBalanced(layoutTools.createIconGrid(200, 140, 4));
  assert.ok(f.scale() < 1);
  await new Promise(resolve => setTimeout(resolve, 550));
  assertInside(new Map(f.writes.at(-1).icons.map(({ id, x, y }) => [id, { x, y }])), layoutTools.createIconGrid(200, 140, 4), 4);
  f.unmount();
  assert.equal(f.observers.at(-1).disconnected, true);
});

test("desktop marquee selection supports addition, right-click deletion and keyboard deletion", async (t) => {
  const f = await desktopFixture(t, [
    { id: "a", x: 16, y: 16 }, { id: "b", x: 110, y: 16 },
    { id: "c", x: 16, y: 120 }, { id: "d", x: 110, y: 120 }
  ]);
  const initial = f.points();
  const c = initial.get("c");
  const d = initial.get("d");
  const iconWidth = layoutTools.DESKTOP_ICON_WIDTH * f.scale();
  const iconHeight = layoutTools.DESKTOP_ICON_HEIGHT * f.scale();
  const start = { x: Math.max(c.x, d.x) + iconWidth + 5, y: Math.max(c.y, d.y) + iconHeight + 5 };
  const end = { x: Math.min(c.x, d.x) - 5, y: Math.min(c.y, d.y) + 5 };
  f.mouse("dblclick", f.icon("a"), initial.get("a").x + 15, initial.get("a").y + 15);
  await flush();
  assert.ok(f.target.querySelector('[data-window-id="a"]'));
  f.mouse("mousedown", f.surface, start.x, start.y);
  await vue.nextTick();
  assert.equal(f.target.querySelector(".desktop-drag-select-rect"), null);
  f.mouse("mousemove", document, end.x, end.y);
  await new Promise(resolve => requestAnimationFrame(resolve));
  await vue.nextTick();
  assert.ok(f.target.querySelector(".desktop-drag-select-rect"));
  assert.deepEqual(f.selected(), ["c", "d"]);
  f.mouse("mouseup", document, end.x, end.y);
  f.mouse("click", f.surface, end.x, end.y);
  await flush();
  assert.deepEqual(f.selected(), ["c", "d"], "the mouseup click must keep the marquee selection");
  assert.equal(f.target.querySelector(".desktop-drag-select-rect"), null);
  f.mouse("contextmenu", f.icon("c"), c.x + 15, c.y + 15);
  await flush();
  assert.deepEqual(f.selected(), ["c", "d"]);
  f.target.querySelector(".test-desktop-menu button").click();
  await flush();
  assert.deepEqual([...f.points().keys()].sort(), ["a", "b"]);
  assert.ok(f.target.querySelector('[data-window-id="a"]'), "removing shortcuts must keep applications open");

  const a = f.points().get("a");
  const b = f.points().get("b");
  f.mouse("mousedown", f.icon("a"), a.x + 15, a.y + 15);
  f.mouse("mouseup", document, a.x + 15, a.y + 15);
  f.mouse("click", f.icon("a"), a.x + 15, a.y + 15);
  f.mouse("mousedown", f.surface, b.x + iconWidth + 5, b.y + iconHeight - 5, { ctrlKey: true });
  f.mouse("mouseup", document, b.x - 5, b.y - 5, { ctrlKey: true });
  f.mouse("click", f.surface, b.x - 5, b.y - 5, { ctrlKey: true });
  await flush();
  assert.deepEqual(f.selected(), ["a", "b"]);
  const input = document.createElement("input");
  f.target.appendChild(input);
  input.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Delete" }));
  assert.equal(f.icons().length, 2);
  f.surface.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Delete" }));
  await flush();
  assert.equal(f.icons().length, 0);
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.deepEqual(f.writes.at(-1).shortcuts, []);
  assert.deepEqual(f.writes.at(-1).icons, []);
  assert.equal(f.writes.at(-1).windows.length, 1);
});

test("marquee-selected icons preview and move together from any selected icon and persist all new positions", async (t) => {
  const grid = layoutTools.createIconGrid(800, 552, 4);
  const positions = [["a", 0, 0], ["b", 1, 0], ["c", 0, 2], ["d", 6, 3]]
    .map(([id, col, row]) => ({ id, ...layoutTools.getIconPosition({ col, row }, grid) }));
  const f = await desktopFixture(t, positions);
  const original = f.points();
  selectWithMarquee(f, ["a", "b"], grid);
  await flush();
  assert.deepEqual(f.selected(), ["a", "b"]);
  const start = original.get("b");
  const target = layoutTools.getIconPosition({ col: 3, row: 1 }, grid);
  f.mouse("mousedown", f.icon("b"), start.x + 20, start.y + 20);
  f.mouse("mousemove", document, target.x + 20, target.y + 20);
  await flush();
  assert.deepEqual([...f.target.querySelectorAll(".drag-ghost__label")].map(element => element.textContent), ["a", "b"]);
  const expected = [layoutTools.getIconPosition({ col: 2, row: 1 }, grid), target];
  assert.deepEqual([...f.target.querySelectorAll(".drop-indicator")].map(element => ({ x: parseFloat(element.style.left), y: parseFloat(element.style.top) })), expected);
  assert.deepEqual(f.points(), original, "preview leaves the saved positions untouched");
  f.mouse("mouseup", document, target.x + 20, target.y + 20);
  f.mouse("click", f.icon("b"), target.x + 20, target.y + 20);
  await flush();
  assert.deepEqual(f.points().get("a"), expected[0]);
  assert.deepEqual(f.points().get("b"), expected[1]);
  assert.deepEqual(f.points().get("c"), original.get("c"));
  assert.deepEqual(f.points().get("d"), original.get("d"));
  assert.deepEqual(f.selected(), ["a", "b"]);
  assert.equal(f.target.querySelectorAll(".drag-ghost").length, 0);
  assertInside(f.points(), grid, 4);
  await new Promise(resolve => setTimeout(resolve, 550));
  const saved = new Map(f.writes.at(-1).icons.map(({ id, x, y }) => [id, { x, y }]));
  assert.deepEqual(saved, f.points());
});

test("dropping a group over another icon finds a free position for the entire shape", async (t) => {
  const grid = layoutTools.createIconGrid(800, 552, 4);
  const positions = [["a", 0, 0], ["b", 1, 0], ["c", 2, 1], ["d", 4, 1]]
    .map(([id, col, row]) => ({ id, ...layoutTools.getIconPosition({ col, row }, grid) }));
  const f = await desktopFixture(t, positions);
  const original = f.points();
  selectWithMarquee(f, ["a", "b"], grid);
  await flush();
  const start = original.get("b");
  const target = layoutTools.getIconPosition({ col: 3, row: 1 }, grid);
  f.mouse("mousedown", f.icon("b"), start.x + 10, start.y + 10);
  f.mouse("mousemove", document, target.x + 10, target.y + 10);
  f.mouse("mouseup", document, target.x + 10, target.y + 10);
  await flush();
  assert.deepEqual(f.points().get("a"), layoutTools.getIconPosition({ col: 2, row: 0 }, grid));
  assert.deepEqual(f.points().get("b"), layoutTools.getIconPosition({ col: 3, row: 0 }, grid));
  assert.deepEqual(f.points().get("c"), original.get("c"));
  assert.deepEqual(f.points().get("d"), original.get("d"));
  assertInside(f.points(), grid, 4);
});

test("scaled icon groups clamp their complete preview to the desktop and retain relative rows on drop", async (t) => {
  const initialGrid = layoutTools.createIconGrid(800, 552, 4);
  const positions = [["a", 0, 0], ["b", 1, 0], ["c", 0, 2], ["d", 6, 3]]
    .map(([id, col, row]) => ({ id, ...layoutTools.getIconPosition({ col, row }, initialGrid) }));
  const f = await desktopFixture(t, positions);
  await f.resize(280, 240);
  const grid = layoutTools.createIconGrid(280, 192, 4);
  const original = f.points();
  assert.ok(grid.scale < 1);
  selectWithMarquee(f, ["a", "c"], grid);
  await flush();
  assert.deepEqual(f.selected(), ["a", "c"]);
  const start = original.get("c");
  f.mouse("mousedown", f.icon("c"), start.x + 10, start.y + 10);
  f.mouse("mousemove", document, 5000, 5000);
  await flush();
  const ghosts = [...f.target.querySelectorAll(".drag-ghost")].map(element => ({ x: parseFloat(element.style.left), y: parseFloat(element.style.top) }));
  assert.equal(ghosts.length, 2);
  assert.ok(Math.abs(ghosts[1].y - ghosts[0].y - grid.rowHeight) < 1e-6, "pixel offsets must not be scaled twice");
  ghosts.forEach(point => assertInside(new Map([["ghost", point]]), grid, 1));
  f.mouse("mouseup", document, 5000, 5000);
  await flush();
  assert.deepEqual(f.points().get("a"), layoutTools.getIconPosition({ col: 1, row: 0 }, grid));
  const c = f.points().get("c");
  const expected = layoutTools.getIconPosition({ col: 1, row: 1 }, grid);
  assert.deepEqual(layoutTools.getIconCell(c, grid), { col: 1, row: 1 });
  assert.ok(Math.abs(c.x - expected.x) < 1e-6 && Math.abs(c.y - expected.y) < 1e-6);
  assert.deepEqual(f.points().get("b"), original.get("b"));
  assert.deepEqual(f.points().get("d"), original.get("d"));
  assertInside(f.points(), grid, 4);
});

test("cancelling a group drag preserves positions and dragging an unselected icon still moves only that icon", async (t) => {
  const grid = layoutTools.createIconGrid(800, 552, 4);
  const positions = ["a", "b", "c", "d"].map((id, col) => ({ id, ...layoutTools.getIconPosition({ col, row: 0 }, grid) }));
  const f = await desktopFixture(t, positions);
  const original = f.points();
  selectWithMarquee(f, ["a", "b"], grid);
  await flush();
  const start = original.get("a");
  f.mouse("mousedown", f.icon("a"), start.x + 10, start.y + 10);
  f.mouse("mousemove", document, 500, 400);
  await flush();
  assert.equal(f.target.querySelectorAll(".drag-ghost").length, 2);
  window.dispatchEvent(new window.Event("blur"));
  f.mouse("mouseup", document, 500, 400);
  await flush();
  assert.deepEqual(f.points(), original);
  assert.deepEqual(f.selected(), ["a", "b"]);
  assert.equal(f.target.querySelectorAll(".drag-ghost").length, 0);
  const c = original.get("c");
  const target = layoutTools.getIconPosition({ col: 4, row: 1 }, grid);
  f.mouse("mousedown", f.icon("c"), c.x + 10, c.y + 10);
  f.mouse("mousemove", document, target.x + 10, target.y + 10);
  await flush();
  assert.equal(f.target.querySelectorAll(".drag-ghost").length, 1);
  f.mouse("mouseup", document, target.x + 10, target.y + 10);
  await flush();
  assert.deepEqual(f.points().get("c"), target);
  assert.deepEqual(f.points().get("a"), original.get("a"));
  assert.deepEqual(f.points().get("b"), original.get("b"));
  assert.deepEqual(f.selected(), ["c"]);
});
