const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createBrowser, createLoader, settle } = require("./helpers.cjs");

const markers = ["data-overlayscrollbars", "data-overlayscrollbars-viewport"];

function fixture(t, nodes = 0) {
  const dom = createBrowser();
  const root = document.createElement("main");
  root.className = "scrollable";
  document.body.append(root);
  for (let index = 0; index < nodes; index++) root.append(document.createElement("div"));

  const frames = new Map();
  const timers = new Map();
  const active = new Map();
  const records = [];
  const rules = new Map();
  const events = [];
  const queries = [];
  const media = new Map();
  let nextId = 1;
  let dispose;

  global.CSS.supports = () => true;
  window.matchMedia = (query) => {
    if (!media.has(query)) {
      const listeners = new Set();
      media.set(query, {
        matches: query.includes("any-pointer"),
        listeners,
        addEventListener(_event, listener) {
          listeners.add(listener);
        },
        removeEventListener(_event, listener) {
          listeners.delete(listener);
        },
        change(matches) {
          this.matches = matches;
          listeners.forEach((listener) => listener());
        }
      });
    }
    return media.get(query);
  };

  global.requestAnimationFrame = (callback) => {
    const id = nextId++;
    frames.set(id, callback);
    return id;
  };
  global.cancelAnimationFrame = (id) => frames.delete(id);
  window.setTimeout = (callback) => {
    const id = nextId++;
    timers.set(id, callback);
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);

  const originalQuery = dom.window.Element.prototype.querySelectorAll;
  dom.window.Element.prototype.querySelectorAll = function (selector) {
    if (selector === "*") queries.push(this);
    return originalQuery.call(this, selector);
  };
  const originalSet = dom.window.Element.prototype.setAttribute;
  const originalRemove = dom.window.Element.prototype.removeAttribute;
  dom.window.Element.prototype.setAttribute = function (name, value) {
    if (markers.includes(name)) events.push({ type: "restore", element: this });
    return originalSet.call(this, name, value);
  };
  dom.window.Element.prototype.removeAttribute = function (name) {
    if (markers.includes(name)) events.push({ type: "remove", element: this });
    return originalRemove.call(this, name);
  };
  global.getComputedStyle = (element) => {
    events.push({ type: "read", element });
    assert.equal(
      markers.every((name) => element.hasAttribute(name)),
      active.has(element),
      "Keep initialized viewport markers intact"
    );
    const rule = rules.get(element)?.() || {};
    return {
      overflowX: element.style.overflowX || element.style.overflow || rule.x || "hidden",
      overflowY:
        element.style.overflowY ||
        element.style.overflow ||
        rule.y ||
        (element.classList.contains("scrollable") ? "auto" : "hidden")
    };
  };

  const OverlayScrollbars = ({ target }, options, handlers) => {
    Object.defineProperties(target, {
      clientWidth: { configurable: true, value: 400 },
      clientHeight: { configurable: true, value: 300 }
    });
    const horizontal = document.createElement("div");
    const vertical = document.createElement("div");
    horizontal.className = vertical.className = "os-scrollbar";
    target.append(horizontal, vertical);
    target.setAttribute(markers[0], "host");
    target.setAttribute(markers[1], "");
    const record = {
      target,
      horizontal,
      vertical,
      options,
      changes: [],
      updates: [],
      sleeps: [],
      sleeping: false,
      destroyed: 0,
      coordinates: { start: { x: 0, y: 0 }, end: { x: 600, y: 800 } }
    };
    records.push(record);
    active.set(target, record);
    const instance = {
      options(options) {
        record.changes.push(options);
      },
      state() {
        return {
          sleeping: record.sleeping,
          scrollCoordinates: {
            start: { ...record.coordinates.start },
            end: { ...record.coordinates.end }
          }
        };
      },
      update(force) {
        assert.ok(
          markers.every((name) => target.hasAttribute(name)),
          "Measure with viewport styles restored"
        );
        assert.equal(horizontal.parentElement, target);
        assert.equal(vertical.parentElement, target);
        record.updates.push(force);
        handlers.updated(instance);
      },
      sleep(sleeping) {
        record.sleeping = sleeping;
        record.sleeps.push(sleeping);
        if (!sleeping) instance.update(true);
      },
      elements() {
        return {
          scrollOffsetElement: target,
          scrollbarHorizontal: { scrollbar: horizontal },
          scrollbarVertical: { scrollbar: vertical }
        };
      },
      destroy() {
        record.destroyed++;
        active.delete(target);
        horizontal.remove();
        vertical.remove();
        markers.forEach((name) => target.removeAttribute(name));
      }
    };
    record.updated = () => handlers.updated(instance);
    record.updated();
    return instance;
  };
  OverlayScrollbars.env = () => ({ scrollbarsHiding: true });
  OverlayScrollbars.plugin = () => {};
  const { installOverlayScrollbars } = createLoader({ host: "frontend" })(
    "plugins/console/panel/src/tools/overlayScrollbars.ts",
    { overlayscrollbars: { OverlayScrollbars } }
  );

  const f = {
    dom,
    root,
    frames,
    timers,
    active,
    records,
    rules,
    events,
    queries,
    media,
    install() {
      dispose = installOverlayScrollbars();
    },
    dispose() {
      dispose?.();
    },
    reset() {
      events.length = queries.length = 0;
    },
    resize() {
      window.dispatchEvent(new window.Event("resize"));
    },
    settleResize() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
    async flush() {
      await settle();
      for (let index = 0; frames.size; index++) {
        assert.ok(index < 5, "Scrollbar updates must not trigger an observer loop");
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach((callback) => callback(performance.now()));
        await settle();
      }
    }
  };
  t.after(() => {
    f.dispose();
    dom.window.close();
  });
  return f;
}

test("window resizing defers DOM discovery until it settles", async (t) => {
  const f = fixture(t, 1000);
  f.install();
  const initialReads = f.events.filter((event) => event.type === "read").length;
  f.reset();
  for (let index = 0; index < 10; index++) {
    f.resize();
    await f.flush();
  }
  assert.equal(f.events.length, 0);
  assert.equal(f.queries.length, 0);
  assert.equal(f.timers.size, 1);
  f.settleResize();
  await f.flush();
  assert.deepEqual(f.queries, [document.body]);
  assert.equal(f.events.filter((event) => event.type === "read").length, initialReads);
  assert.equal(f.records[0].changes.length, 0);
});

test("desktop focus and compositor motion do not scan or measure window content", async (t) => {
  const f = fixture(t, 1000);
  f.root.classList.add("desktop-window");
  f.install();
  f.reset();
  f.root.classList.add("desktop-window--active", "desktop-window--dragging");
  await f.flush();
  for (let index = 0; index < 20; index++) {
    f.root.style.translate = `${index}px ${index}px`;
    f.root.style.zIndex = String(index + 100);
    await f.flush();
  }
  f.root.classList.remove("desktop-window--dragging");
  f.root.classList.add("desktop-window--suspended");
  await f.flush();
  assert.equal(f.queries.length, 0);
  assert.equal(f.events.length, 0);
  f.root.classList.remove("desktop-window--suspended");
  f.root.classList.add("application-layout-change");
  await f.flush();
  assert.deepEqual(f.queries, [f.root]);
  assert.ok(f.events.some((event) => event.type === "read"));
});

test("cached desktop viewports retain their scrollbar instance until the owning window closes", async (t) => {
  const f = fixture(t);
  const window = document.createElement("section");
  window.className = "desktop-window";
  const title = document.createElement("span");
  title.id = "cached-owner-title";
  const content = document.createElement("div");
  content.dataset.desktopWindowContent = "cached-owner";
  content.append(f.root);
  window.append(title, content);
  document.body.append(window);
  f.install();
  const original = f.active.get(f.root);
  original.coordinates.end = { x: 600, y: 800 };
  f.root.scrollTop = 400;
  content.remove();
  await f.flush();
  assert.equal(original.destroyed, 0);
  assert.equal(original.sleeping, true);
  original.coordinates.end = { x: 0, y: 0 };
  original.updated();
  assert.equal(f.root.scrollTop, 400);
  original.coordinates.end = { x: 600, y: 800 };
  window.append(content);
  await f.flush();
  assert.equal(f.active.get(f.root), original);
  assert.equal(f.root.scrollTop, 400);
  assert.equal(original.sleeping, false);
  window.classList.add("desktop-window--suspended");
  await f.flush();
  assert.equal(original.sleeping, true);
  original.coordinates.end = { x: 0, y: 0 };
  original.updated();
  assert.equal(f.root.scrollTop, 400);
  content.remove();
  window.remove();
  await f.flush();
  assert.equal(original.destroyed, 1);
});

test("overlapping mutation roots are scanned once and new scroll regions are discovered", async (t) => {
  const f = fixture(t);
  f.install();
  f.reset();
  const parent = document.createElement("section");
  const child = document.createElement("div");
  const input = document.createElement("input");
  child.className = "scrollable";
  input.style.overflow = "auto";
  parent.append(child, input);
  f.root.append(parent);
  parent.classList.add("changed");
  child.classList.add("changed");
  await f.flush();
  assert.deepEqual(f.queries, [parent]);
  assert.ok(f.active.has(child));
  assert.equal(f.active.has(input), false);
  assert.equal(
    f.events.some((event) => event.type === "read" && event.element === input),
    false
  );
});

test("library size styles are ignored while application overflow changes remain supported", async (t) => {
  const f = fixture(t, 1000);
  f.install();
  f.reset();
  f.root.style.width = "100%";
  f.root.style.setProperty("--os-viewport-percent", "50%");
  await f.flush();
  assert.equal(f.events.length, 0);
  assert.equal(f.queries.length, 0);

  const original = f.active.get(f.root);
  f.root.style.overflowY = "hidden";
  await f.flush();
  assert.equal(original.destroyed, 1);
  assert.equal(f.active.has(f.root), false);
  assert.equal(f.queries.length, 0);
  f.root.style.removeProperty("overflow-y");
  await f.flush();
  assert.ok(f.active.has(f.root));
});

test("content replacement restores scrollbar nodes and removing a region destroys its instances", async (t) => {
  const f = fixture(t);
  f.install();
  const original = f.active.get(f.root);
  const child = document.createElement("div");
  child.className = "scrollable";
  f.root.replaceChildren(child);
  await f.flush();
  assert.equal(original.horizontal.parentElement, f.root);
  assert.equal(original.vertical.parentElement, f.root);
  assert.deepEqual(original.updates, [undefined]);
  assert.ok(f.active.has(child));
  f.root.remove();
  await f.flush();
  assert.equal(f.active.size, 0);
  assert.ok(f.records.every((record) => record.destroyed === 1));
});

test("shorter text refreshes the existing viewport and clamps both axes to their actual bounds", async (t) => {
  const f = fixture(t);
  const text = document.createTextNode("Long content");
  f.root.append(text);
  f.install();
  const original = f.active.get(f.root);
  f.root.scrollTop = 900;
  f.root.scrollLeft = 600;
  Object.defineProperty(f.root, "scrollHeight", { configurable: true, value: 1200 });
  Object.defineProperty(f.root, "scrollWidth", { configurable: true, value: 900 });
  original.coordinates.end = { x: 120, y: 80 };
  f.reset();
  text.data = "Short";
  await f.flush();
  assert.equal(f.active.get(f.root), original);
  assert.equal(original.destroyed, 0);
  assert.deepEqual(original.updates, [undefined]);
  assert.equal(f.root.scrollTop, 80);
  assert.equal(f.root.scrollLeft, 120);
  assert.equal(f.events.length, 0);
  assert.equal(f.queries.length, 0);

  f.root.scrollTop = 40;
  f.root.scrollLeft = 50;
  original.updated();
  assert.equal(f.root.scrollTop, 40);
  assert.equal(f.root.scrollLeft, 50);
  original.coordinates.end = { x: 0, y: 0 };
  original.updated();
  assert.equal(f.root.scrollTop, 0);
  assert.equal(f.root.scrollLeft, 0);
});

test("child size changes refresh ancestor scrollbars and preserve valid reversed scroll positions", async (t) => {
  const f = fixture(t);
  const child = document.createElement("div");
  f.root.append(child);
  f.install();
  const original = f.active.get(f.root);
  original.coordinates.end = { x: -60, y: 800 };
  f.root.scrollLeft = -300;
  f.root.scrollTop = 500;
  f.reset();
  child.style.height = "100px";
  await f.flush();
  assert.deepEqual(original.updates, [undefined]);
  assert.equal(f.root.scrollLeft, -60);
  assert.equal(f.root.scrollTop, 500);
  assert.equal(f.events.length, 0);
  assert.equal(f.queries.length, 0);
});

test("ancestor classes and inherited custom properties can change descendant scrollability", async (t) => {
  const f = fixture(t);
  const child = document.createElement("div");
  f.root.append(child);
  f.rules.set(child, () => ({
    y: document.body.classList.contains("mobile")
      ? "auto"
      : f.root.style.getPropertyValue("--application-overflow") || "hidden"
  }));
  f.install();
  assert.equal(f.active.has(child), false);
  f.root.style.setProperty("--application-overflow", "auto");
  await f.flush();
  assert.ok(f.active.has(child));
  f.root.style.removeProperty("--application-overflow");
  await f.flush();
  assert.equal(f.active.has(child), false);
  document.body.classList.add("mobile");
  await f.flush();
  assert.ok(f.active.has(child));
});

test("style discovery never removes viewport markers or forces an unchanged instance", async (t) => {
  const f = fixture(t);
  const other = document.createElement("aside");
  other.className = "scrollable";
  document.body.append(other);
  f.install();
  f.reset();
  f.resize();
  f.settleResize();
  await f.flush();
  const types = f.events.map((event) => event.type);
  assert.ok(types.includes("read"));
  assert.equal(types.includes("remove"), false);
  assert.equal(types.includes("restore"), false);
  assert.ok(f.records.every((record) => record.changes.length === 0));
  assert.ok(f.records.every((record) => record.updates.every((force) => !force)));
});

test("native editors remain untouched and their content mutations do not rescan descendants", async (t) => {
  const f = fixture(t);
  const editors = ["xterm", "cm-editor", "monaco-editor"];
  const contents = editors.map((className) => {
    const editor = document.createElement("div");
    editor.className = className;
    const content = document.createElement("div");
    content.className = "scrollable";
    editor.append(content);
    f.root.append(editor);
    return content;
  });
  f.install();
  assert.ok(contents.every((element) => !f.active.has(element)));
  f.reset();
  contents.forEach((element) => element.replaceChildren(document.createElement("div")));
  await f.flush();
  assert.equal(f.queries.length, 0);
  assert.equal(f.events.length, 0);
  assert.deepEqual(f.active.get(f.root).updates, [undefined]);
  f.root.setAttribute("data-native-scrollbars", "");
  await f.flush();
  assert.equal(f.active.size, 0);
  f.root.removeAttribute("data-native-scrollbars");
  await f.flush();
  assert.ok(f.active.has(f.root));
});

test("unchanged or growing bounds preserve overscroll and temporarily hidden viewports retain position", (t) => {
  const f = fixture(t);
  f.install();
  const original = f.active.get(f.root);
  f.root.scrollTop = -30;
  original.updated();
  assert.equal(f.root.scrollTop, -30);
  original.coordinates.end.y = 1000;
  original.updated();
  assert.equal(f.root.scrollTop, -30);
  f.root.scrollTop = 500;
  Object.defineProperty(f.root, "clientHeight", { configurable: true, value: 0 });
  original.coordinates.end.y = 0;
  original.updated();
  assert.equal(f.root.scrollTop, 500);
  Object.defineProperty(f.root, "clientHeight", { configurable: true, value: 300 });
  original.coordinates.end.y = 800;
  original.updated();
  assert.equal(f.root.scrollTop, 500);
});

test("pointer and motion preferences update live and forced colors restore native scrollbars", async (t) => {
  const f = fixture(t);
  f.install();
  const original = f.active.get(f.root);
  assert.equal(original.options.scrollbars.autoHide, "leave");
  assert.equal(original.options.scrollbars.clickScroll, true);
  f.media.get("(prefers-reduced-motion: reduce)").change(true);
  assert.equal(original.changes.at(-1).scrollbars.clickScroll, "instant");
  f.media.get("(any-hover: hover) and (any-pointer: fine)").change(false);
  assert.equal(original.changes.at(-1).scrollbars.autoHide, "scroll");
  f.media.get("(forced-colors: active)").change(true);
  await f.flush();
  assert.equal(original.destroyed, 1);
  assert.equal(f.active.size, 0);
  f.reset();
  f.root.classList.add("native-mode");
  f.resize();
  await f.flush();
  assert.equal(f.queries.length, 0);
  assert.equal(f.events.length, 0);
  f.media.get("(forced-colors: active)").change(false);
  await f.flush();
  assert.ok(f.active.has(f.root));
  f.dispose();
  assert.ok([...f.media.values()].every((query) => query.listeners.size === 0));
});

test("unsupported overflow isolation falls back to native scrolling", (t) => {
  const f = fixture(t);
  global.CSS.supports = () => false;
  f.install();
  assert.equal(f.active.size, 0);
  assert.equal(f.events.length, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.media.size, 0);
});

test("disposing cancels deferred scans and releases each scrollbar once", async (t) => {
  const f = fixture(t);
  f.install();
  f.reset();
  f.resize();
  f.root.classList.add("changed");
  await settle();
  assert.ok(f.frames.size);
  assert.ok(f.timers.size);
  f.dispose();
  f.dispose();
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.active.size, 0);
  assert.ok(f.records.every((record) => record.destroyed === 1));
  f.reset();
  f.resize();
  f.root.classList.add("after-dispose");
  await f.flush();
  assert.equal(f.events.length, 0);
  assert.equal(f.timers.size, 0);
});
