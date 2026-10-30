const { from, createLoader, deferred } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const { test } = require("node:test");

const frontendRequire = from("frontend");
const ts = frontendRequire("typescript");
const vue = frontendRequire("vue");

const load = createLoader({ compiler: ts, host: "frontend" });

function fixture(t, execute) {
  const requests = [];
  const scope = vue.effectScope();
  const { usePluginIcons } = load("plugins/market/panel/src/hooks/usePluginIcons.ts", {
    "../api": {
      pluginMarketIcon: () => ({
        execute: (config) => {
          const wait = deferred();
          requests.push({ config, ...wait });
          return execute ? execute(config, wait, requests) : wait.promise;
        }
      })
    }
  });
  const state = scope.run(() => usePluginIcons());
  t.after(() => scope.stop());
  return { state, requests, scope };
}

test("icon requests deduplicate by plugin and release, then retry after a failure", async (t) => {
  const { state, requests } = fixture(t);
  const first = state.load("plugin-a", true, "1.0.0");
  const duplicate = state.load("plugin-a", true, "1.0.0");
  assert.equal(requests.length, 1);
  assert.equal(first, duplicate);
  requests[0].reject(new Error("temporary market outage"));
  await first;
  assert.equal(state.icons.value["plugin-a"], undefined);

  const retry = state.load("plugin-a", true, "1.0.0");
  assert.equal(requests.length, 2);
  requests[1].resolve({ value: { dataUrl: "data:image/png;base64,one" } });
  await retry;
  assert.equal(state.icons.value["plugin-a"], "data:image/png;base64,one");
  await state.load("plugin-a", true, "1.0.0");
  assert.equal(requests.length, 2);
});

test("a newer release aborts the old request and cannot be overwritten by a late answer", async (t) => {
  const { state, requests } = fixture(t);
  const old = state.load("plugin-a", true, "1.0.0");
  const current = state.load("plugin-a", true, "2.0.0");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].config.signal.aborted, true);
  requests[0].resolve({ value: { dataUrl: "data:image/png;base64,old" } });
  requests[1].resolve({ value: { dataUrl: "data:image/png;base64,current" } });
  await Promise.all([old, current]);
  assert.equal(state.icons.value["plugin-a"], "data:image/png;base64,current");
  assert.equal(requests[0].config.params.version, "1.0.0");
  assert.equal(requests[1].config.params.version, "2.0.0");
});

test("removing hasIcon clears a previous image and avoids a request for legacy records", async (t) => {
  const { state, requests } = fixture(t);
  const loaded = state.load("plugin-a", true, "1.0.0");
  requests[0].resolve({ value: { dataUrl: "data:image/png;base64,old" } });
  await loaded;
  await state.load("plugin-a", false, "1.0.0");
  assert.equal(state.icons.value["plugin-a"], undefined);
  assert.equal(requests.length, 1);

  await state.load("plugin-b", undefined, "1.0.0");
  assert.equal(requests.length, 1);
});

test("scope disposal aborts requests and ignores late image responses", async (t) => {
  const { state, requests, scope } = fixture(t);
  const pending = state.load("plugin-a", true, "1.0.0");
  scope.stop();
  assert.equal(requests[0].config.signal.aborted, true);
  requests[0].resolve({ value: { dataUrl: "data:image/png;base64,late" } });
  await pending;
  assert.equal(Object.keys(state.icons.value).length, 0);
  await state.load("plugin-a", true, "1.0.0");
  assert.equal(requests.length, 1);
});
