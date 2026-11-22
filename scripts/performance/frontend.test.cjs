const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createLoader, deferred, from, mountSetup } = require("../tests/helpers.cjs");

const vue = from("frontend")("vue");

test("frontend: 500 concurrent equivalent reads share one request and independent results", async () => {
  const response = deferred();
  let requests = 0;
  const axios = async () => {
    requests++;
    return { data: { data: await response.promise, status: 200 } };
  };
  axios.defaults = { headers: { common: {} } };
  axios.interceptors = { request: { use() {} } };
  const { apiService, setAuthToken } = createLoader({ host: "frontend" })(
    "plugins/console/panel/src/services/apiService.ts",
    { axios, "@/tools/validator": { reportErrorMsg: assert.fail } }
  );
  const options = { url: "/items", params: { page: 1 } };
  const pending = Array.from({ length: 500 }, () => apiService.subscribe(options));
  assert.equal(requests, 1);
  response.resolve({ items: [{ value: 42 }] });
  const results = await Promise.all(pending);
  results[0].items[0].value = 99;
  assert.ok(results.slice(1).every((result) => result.items[0].value === 42));
  await Promise.all(Array.from({ length: 500 }, () => apiService.subscribe(options)));
  assert.equal(requests, 1, "cached reads must not send more requests");
  setAuthToken("next-user");
  await apiService.subscribe(options);
  assert.equal(requests, 2, "changing identity must invalidate the shared cache");
});

test("frontend: geometry bursts share a frame and teardown releases the shared renderer", async (t) => {
  const frames = new Map();
  let scheduled = 0;
  let boundsReads = 0;
  const listeners = new Set();
  const document = {
    defaultView: {
      innerWidth: 1280,
      innerHeight: 800,
      addEventListener(event, listener) {
        assert.equal(event, "resize");
        listeners.add(listener);
      },
      removeEventListener(event, listener) {
        assert.equal(event, "resize");
        listeners.delete(listener);
      }
    }
  };
  const { useWindowRendering } = createLoader({ host: "frontend", globals: true })(
    "plugins/desktop/panel/src/windowRendering.ts",
    {},
    {
      document,
      requestAnimationFrame(callback) {
        frames.set(++scheduled, callback);
        return scheduled;
      },
      cancelAnimationFrame(id) {
        frames.delete(id);
      }
    }
  );
  const windows = Array.from({ length: 64 }, () =>
    vue.ref({ left: 0, top: 0, right: 600, bottom: 400 })
  );
  const rendering = [];
  let dispose;
  mountSetup(
    {
      after(callback) {
        dispose = callback;
      }
    },
    {
      setup() {
        windows.forEach((bounds, index) =>
          rendering.push(
            useWindowRendering({
              bounds: () => {
                boundsReads++;
                return bounds.value;
              },
              visible: () => true,
              zIndex: () => index,
              maximized: () => false,
              interacting: () => false,
              animating: () => false
            })
          )
        );
        return {};
      }
    }
  );
  let disposed = false;
  t.after(() => {
    if (!disposed) dispose();
  });
  const paint = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback());
  };
  assert.equal(listeners.size, 1);
  paint();
  assert.equal(rendering.filter((entry) => !entry.suspended.value).length, 1);
  const initialScheduled = scheduled;
  boundsReads = 0;
  for (let i = 0; i < 500; i++) {
    windows.forEach((bounds) => {
      bounds.value = { left: i % 10, top: 0, right: 600 + (i % 10), bottom: 400 };
    });
  }
  await vue.nextTick();
  assert.equal(frames.size, 1);
  assert.equal(
    scheduled - initialScheduled,
    1,
    "geometry bursts must not schedule one frame per update"
  );
  paint();
  assert.ok(
    boundsReads <= windows.length * 2,
    `${boundsReads} bounds reads exceed one watch and paint per window`
  );
  assert.equal(rendering.filter((entry) => !entry.suspended.value).length, 1);
  windows[0].value = { left: 5, top: 0, right: 605, bottom: 400 };
  await vue.nextTick();
  assert.equal(frames.size, 1);
  dispose();
  disposed = true;
  assert.equal(frames.size, 0);
  assert.equal(listeners.size, 0);
});
