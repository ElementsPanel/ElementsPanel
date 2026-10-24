const { from, compileSfc, createLoader, settle, deferred } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");

const frontendRequire = from("frontend");
const ts = frontendRequire("typescript");
const vue = frontendRequire("vue");
const i18n = { t: (key) => key, getCurrentLang: () => "zh_cn" };

// Execute the real composables/services with only their browser and network
// boundaries replaced. This catches ordering and cancellation bugs without a server.
const load = createLoader({ compiler: ts, host: "frontend" });

function setupSfc(filename, overrides = {}, props = {}) {
  return load(
    filename,
    {
      vue: { ...vue, onMounted() {}, onUnmounted() {}, watch() {} },
      "@/lang/i18n": i18n,
      "@/components/DesktopDialog.vue": {},
      "@/hooks/useScreen": { useScreen: () => ({ isPhone: vue.ref(false) }) },
      "vuetify/components": {},
      ...overrides
    },
    compileSfc(filename)
  ).default.setup(props, { expose() {} });
}

function apiFixture(handler = async () => ({ ok: true })) {
  const requests = [];
  const errors = [];
  const axios = async (config) => {
    requests.push(config);
    return { data: { data: await handler(config, requests.length), status: 200 } };
  };
  axios.defaults = { headers: { common: {} } };
  axios.interceptors = { request: { use() {} } };
  return {
    requests,
    errors,
    ...load("panel/plugins/console/src/services/apiService.ts", {
      axios,
      "@/tools/validator": { reportErrorMsg: (error) => errors.push(error) }
    })
  };
}

test("API caches independent read copies, never caches writes, and invalidates reads after writes", async () => {
  const { apiService, requests } = apiFixture(async (_config, count) => ({ count }));
  const first = await apiService.subscribe({ url: "/items" });
  first.count = 999;
  assert.deepEqual(await apiService.subscribe({ url: "/items" }), { count: 1 });
  await apiService.subscribe({ url: "/items", method: "POST", data: { value: 1 } });
  await apiService.subscribe({ url: "/items", method: "POST", data: { value: 1 } });
  assert.equal(requests.length, 3);
  assert.deepEqual(await apiService.subscribe({ url: "/items" }), { count: 4 });
  assert.equal(requests[0].timeout, 30_000);
});

test("API does not reuse a prior identity's pending response or repopulate cache after invalidation", async () => {
  const old = deferred();
  const { apiService, setAuthToken, requests } = apiFixture(async (_config, count) =>
    count === 1 ? old.promise : count
  );
  setAuthToken("first-user");
  const first = apiService.subscribe({ url: "/account" });
  const duplicate = apiService.subscribe({ url: "/account" });
  assert.equal(requests.length, 1);
  setAuthToken("second-user");
  assert.equal(await apiService.subscribe({ url: "/account" }), 2);
  old.resolve("first-user-result");
  assert.equal(await first, "first-user-result");
  assert.equal(await duplicate, "first-user-result");
  assert.equal(await apiService.subscribe({ url: "/account" }), 2);
});

test("force requests retain error alerts and independently abortable reads are not shared", async () => {
  const failure = new Error("unavailable");
  const fixture = apiFixture(async () => {
    throw failure;
  });
  await assert.rejects(
    fixture.apiService.subscribe({ url: "/items", forceRequest: true, errorAlert: true }),
    failure
  );
  assert.deepEqual(fixture.errors, ["unavailable"]);
  const pending = deferred();
  const reads = apiFixture(() => pending.promise);
  const a = reads.apiService.subscribe({ url: "/items", signal: new AbortController().signal });
  const b = reads.apiService.subscribe({ url: "/items", signal: new AbortController().signal });
  assert.equal(reads.requests.length, 2);
  pending.resolve(true);
  await Promise.all([a, b]);
});

test("API hook isolates per-call configuration/results and preserves the newest request state", async () => {
  const requests = [];
  const pending = [];
  const hook = load("panel/plugins/console/src/hooks/useApi.ts", {
    "@/services/apiService": {
      apiService: {
        subscribe(config) {
          requests.push(config);
          const wait = deferred();
          pending.push(wait);
          return wait.promise;
        }
      }
    }
  });
  const { useDefineApi } = load("panel/plugins/console/src/stores/useDefineApi.ts", {
    "@/hooks/useApi": hook
  });
  const request = useDefineApi({ url: "/base", method: "GET" })();
  const first = request.execute({ url: "/override", method: "POST", data: { changed: true } });
  const second = request.execute();
  assert.deepEqual(requests[1], { url: "/base", method: "GET" });
  pending[1].resolve("new");
  assert.equal((await second).value, "new");
  pending[0].resolve("old");
  assert.equal((await first).value, "old");
  assert.equal(request.state.value, "new");
  assert.equal(request.isLoading.value, false);
});

test("polling waits for completion and never restarts after unmount during a request", async (t) => {
  let mounted, unmounted;
  const scheduled = [];
  t.mock.method(global, "setTimeout", (callback) => {
    scheduled.push(callback);
    return scheduled.length;
  });
  t.mock.method(global, "clearTimeout", () => {});
  const pending = deferred();
  const { usePolling } = load("panel/plugins/console/src/hooks/usePolling.ts", {
    vue: {
      onMounted: (callback) => {
        mounted = callback;
      },
      onUnmounted: (callback) => {
        unmounted = callback;
      }
    }
  });
  usePolling(() => pending.promise, 3000);
  const work = mounted();
  assert.equal(scheduled.length, 0);
  unmounted();
  pending.resolve();
  await work;
  assert.equal(scheduled.length, 0);
});

test("overview derives used memory consistently and leaves the API response untouched", async () => {
  const state = vue.ref();
  const { useOverviewInfo } = load("panel/plugins/console/src/hooks/useOverviewInfo.ts", {
    "@/services/apis": { overviewInfo: () => ({ state, execute: async () => state }) },
    "./usePolling": { usePolling() {} }
  });
  const overview = useOverviewInfo();
  assert.equal(overview.state.value, undefined);
  state.value = { system: { cpu: 0.3, totalmem: 100, freemem: 25 }, remote: [] };
  assert.equal(overview.state.value.mem, 75);
  assert.equal(state.value.mem, undefined);
  state.value.system.totalmem = 0;
  assert.equal(overview.state.value.mem, 0);
  state.value.remote = [{ uuid: "node", features: { instanceBackup: true },
    system: { platform: "linux", totalmem: 2 ** 30, freemem: 2 ** 29, cpuUsage: 0.25 },
    instance: { total: 2, running: 1 } }];
  const node = overview.state.value.remote[0];
  assert.equal(node.platformText, "linux");
  assert.equal(node.cpuInfo, "25.0%");
  assert.equal(node.instanceStatus, "1 / 2");
  assert.deepEqual(node.cpuChartData, []);
  assert.equal(node.features.instanceBackup, true);
  assert.equal(state.value.remote[0].cpuChartData, undefined);
});

test("socket probes release sockets and listeners on failure and cancellation", async () => {
  const sockets = [];
  const { testSocketConnection } = load("panel/plugins/console/src/hooks/useSocketIo.ts", {
    "@/tools/protocol": { parseForwardAddress: (value) => value },
    "@/tools/string": { removeTrail: (value) => value },
    "socket.io-client": {
      io() {
        const socket = new EventEmitter();
        socket.disconnect = () => {
          socket.disconnected = true;
        };
        sockets.push(socket);
        return socket;
      }
    }
  });
  const failed = testSocketConnection("localhost");
  sockets[0].emit("connect_error", new Error("no connection"));
  await assert.rejects(failed, /no connection/);
  assert.equal(sockets[0].disconnected, true);
  assert.equal(sockets[0].listenerCount("connect"), 0);
  const controller = new AbortController();
  const cancelled = testSocketConnection("localhost", "", controller.signal);
  controller.abort();
  await assert.rejects(cancelled, /cancelled/);
  assert.equal(sockets[1].disconnected, true);
  assert.equal(sockets[1].listenerCount("connect_error"), 0);
});

function uploadFixture(initialize, upload = async () => true) {
  const errors = [];
  const requests = [];
  const { default: service } = load("panel/plugins/file/src/services/uploadService.ts", {
    "@/lang/i18n": i18n,
    "@/tools/validator": { reportErrorMsg: (value) => errors.push(value) },
    "@/tools/vuetifyToast": { message: { success() {}, error: (value) => errors.push(value) } },
    "../api": {
      uploadFile: () => {
        const state = vue.ref();
        return {
          state,
          execute: async (config) => {
            requests.push(config);
            state.value = await initialize(config);
            return state;
          }
        };
      },
      uploadFilePiece: () => ({ execute: upload })
    }
  });
  const file = (name = "file.txt", size = 4) => ({
    name,
    size,
    slice: (start, end) => new Blob([new Uint8Array(end - start)])
  });
  return { service, file, errors, requests };
}

test("upload queue IDs stay unique for a same-tick batch and late initialization cannot revive a cancelled queue", async (t) => {
  t.mock.method(Date, "now", () => 12345);
  const pending = deferred();
  const { service, file, requests } = uploadFixture((config) =>
    config.params.stop ? true : pending.promise
  );
  const first = service.append(file("a"), "https://node", "key-a", { overwrite: false });
  const second = service.append(file("b"), "https://node", "key-b", { overwrite: false });
  assert.notEqual(first.id, second.id);
  assert.equal(service.files.size, 2);
  await service.stop();
  pending.resolve({ id: "late-id", received: [] });
  await settle();
  assert.equal(service.files.size, 0);
  assert.equal(service.current, undefined);
  assert.equal(service.status, "stopped");
  assert.equal(requests.filter((request) => request.params.stop).length, 2);
});

test("failed upload initialization advances the queue and missing resume metadata is allowed", async () => {
  const { service, file } = uploadFixture(async (config) => {
    if (config.params.filename === "bad") throw new Error("failed init");
    return { id: "working" };
  });
  service.append(file("bad"), "https://node", "bad", { overwrite: false });
  service.append(file("good"), "https://node", "good", { overwrite: false });
  await settle();
  assert.equal(service.status, "stopped");
  assert.equal(service.files.size, 0);
  assert.equal(service.uploaded, 1);
});

test("upload pause/resume ignores the aborted worker and reports active chunk progress", async () => {
  const workers = [];
  const { service, file, errors } = uploadFixture(
    async () => ({ id: "upload", received: [] }),
    (config) => {
      const wait = deferred();
      workers.push({ config, ...wait });
      return wait.promise;
    }
  );
  service.append(file(), "https://node", "key", { overwrite: false });
  await settle();
  workers[0].config.onUploadProgress({ loaded: 2 });
  assert.deepEqual(service.uiData.value.current, [2, 4]);
  service.suspend();
  service.unsuspend();
  assert.equal(workers.length, 2);
  workers[0].reject(new Error("aborted"));
  await settle();
  assert.equal(workers.length, 2);
  assert.equal(service.status, "working");
  workers[1].resolve(true);
  await settle();
  assert.equal(service.uploaded, 1);
  assert.equal(service.files.size, 0);
  assert.deepEqual(errors, []);
});

function fileManagerFixture(api = {}, savedTabs = {}) {
  const errors = [];
  const scope = vue.effectScope();
  const { useFileManager } = load("panel/plugins/file/src/hooks/useFileManager.ts", {
    vue: { ...vue, onMounted() {}, onUnmounted() {} },
    "@vueuse/core": { useLocalStorage: () => vue.ref(savedTabs) },
    "@/components/fc": {},
    "../dialogs": {},
    "../components/OverwriteFilesPopUpContent.vue": {},
    "@/lang/i18n": i18n,
    "../api": api,
    "../services/uploadService": {},
    "@/tools/permission": {},
    "@/tools/protocol": { parseForwardAddress: (value) => value },
    "@/tools/string": {
      removeTrail: (value, suffix) =>
        value.endsWith(suffix) ? value.slice(0, -suffix.length) : value
    },
    "@/tools/validator": { reportErrorMsg: (error) => errors.push(error) },
    "@/tools/vuetifyToast": { message: { success() {} } },
    "@/tools/vuetifyModal": {},
    "vuetify/components": {}
  });
  return {
    manager: scope.run(() => useFileManager("instance", "node")),
    errors,
    dispose: () => scope.stop()
  };
}

test("file lists ignore stale responses while cancelled dialogs settle without creating a file", async (t) => {
  const pending = [];
  let created = 0;
  const fixture = fileManagerFixture({
    fileList: () => ({
      execute() {
        const wait = deferred();
        pending.push(wait);
        return wait.promise;
      }
    }),
    touchFile: () => ({
      execute: async () => {
        created++;
      }
    })
  });
  t.after(fixture.dispose);
  const { manager } = fixture;
  const first = manager.getFileList();
  const second = manager.getFileList();
  pending[1].resolve({ value: { items: [{ name: "current" }], total: 1 } });
  await second;
  pending[0].resolve({ value: { items: [{ name: "stale" }], total: 1 } });
  await first;
  assert.equal(manager.dataSource.value[0].name, "current");
  const create = manager.touchFile();
  manager.dialog.value.cancel();
  await create;
  assert.equal(created, 0);
});

test("closing the last folder leaves a persistent empty workspace and ignores late requests", async (t) => {
  const pending = [];
  const fixture = fileManagerFixture({
    fileList: () => ({ execute() {
      const wait = deferred();
      pending.push(wait);
      return wait.promise;
    } })
  });
  t.after(fixture.dispose);
  const { manager } = fixture;
  const loading = manager.getFileList();
  assert.equal(manager.currentTabs.value.length, 1);
  manager.selectedRowKeys.value = ["old-file"];
  manager.operationForm.value.total = 5;
  manager.onEditTabs(manager.activeTab.value, "remove");
  assert.equal(manager.activeTab.value, "");
  assert.deepEqual(manager.currentTabs.value, []);
  assert.deepEqual(manager.selectedRowKeys.value, []);
  assert.equal(manager.operationForm.value.total, 0);
  assert.equal(manager.spinning.value, false);
  pending[0].resolve({ value: { items: [{ name: "late" }], total: 1 } });
  assert.equal(await loading, false);
  assert.deepEqual(manager.dataSource.value, []);
  assert.equal(await manager.getFileList(), false);
  assert.equal(pending.length, 1);

  const restored = fileManagerFixture({}, manager.tabList.value);
  t.after(restored.dispose);
  assert.equal(await restored.manager.getFileList(), false);
  assert.deepEqual(restored.manager.currentTabs.value, []);

  manager.onEditTabs("", "add");
  assert.equal(manager.currentTabs.value.length, 1);
  assert.equal(manager.currentPath.value, "/");
  pending[1].resolve({ value: { items: [{ name: "reopened" }], total: 1 } });
  await settle();
  assert.equal(manager.dataSource.value[0].name, "reopened");
});

test("closing inactive folders preserves selection of the active tab and closing the active folder selects a neighbour", async (t) => {
  const fixture = fileManagerFixture({
    fileList: () => ({ execute: async () => ({ value: { items: [], total: 0 } }) })
  });
  t.after(fixture.dispose);
  const { manager } = fixture;
  await manager.getFileList();
  const first = manager.activeTab.value;
  manager.onEditTabs("", "add");
  const second = manager.activeTab.value;
  manager.onEditTabs("", "add");
  const third = manager.activeTab.value;
  manager.onEditTabs(second, "remove");
  assert.equal(manager.activeTab.value, third);
  manager.onEditTabs(third, "remove");
  assert.equal(manager.activeTab.value, first);
  assert.equal(manager.currentTabs.value.length, 1);
  await settle();
});

test("download links encode reserved filename characters and do not turn them into query/fragment syntax", async (t) => {
  const response = vue.ref({ addr: "https://node", password: "key" });
  const fixture = fileManagerFixture({
    downloadAddress: () => ({ state: response, execute: async () => response })
  });
  t.after(fixture.dispose);
  const link = await fixture.manager.getFileLink("report #1?.txt");
  assert.equal(link, "https://node/download/key/report%20%231%3F.txt");
});

test("schedule edits forward an atomic replacement and propagate a failed save", async () => {
  const calls = [];
  const failure = new Error("schedule rejected");
  const { useSchedule } = load("panel/plugins/instance/src/hooks/useSchedule.ts", {
    "@/lang/i18n": i18n,
    "@/tools/validator": {},
    "@/tools/vuetifyToast": {},
    "@/services/apis/instance": {
      scheduleCreate: () => ({
        state: vue.ref(),
        execute: async (config) => {
          calls.push(config);
          throw failure;
        }
      }),
      scheduleList: () => ({})
    }
  });
  const schedule = useSchedule("instance", "node");
  await assert.rejects(
    schedule.createTaskTypeInterval({ name: "job", cycle: ["1", "0", "0"], count: "" }, "job"),
    failure
  );
  assert.equal(calls[0].data.replaceName, "job");
  assert.equal(calls[0].data.time, "1");
});

test("switching node/plugin configuration cannot display or save a stale schema", async () => {
  const requests = [];
  const saved = [];
  const state = setupSfc("panel/plugins/config/src/ConfigPage.vue", {
    "vue-router": {
      useRoute: () => ({ query: {} }),
      // ConfigPage reads the router to rewrite the URL and guards the route on
      // leave; this test drives the schema load/save race and never navigates, so
      // both are stubbed to what vue-router would provide.
      useRouter: () => ({ resolve: () => ({ fullPath: "/plugins/config" }) }),
      onBeforeRouteLeave: () => {}
    },
    "@/plugin/context": { ctx: {} },
    "@/tools/validator": { getValidatorErrorMsg: (error) => error.message },
    "@/tools/vuetifyToast": { message: { success() {}, error() {} } },
    "./SchemaForm.vue": {},
    "./api": {
      nodePluginSettings: () => ({
        execute: (config) => {
          const wait = deferred();
          requests.push({ ...wait, config });
          return wait.promise;
        }
      }),
      updateNodePluginSettings: () => ({
        execute: async (config) => {
          saved.push(config);
          return { value: { saved: true, application: "applied" } };
        }
      })
    }
  });
  state.scope.value = "node";
  state.nodeSelectedId.value = "config";
  state.selectedNodeId.value = "old-node";
  const old = state.loadSchema();
  state.selectedNodeId.value = "new-node";
  const current = state.loadSchema();
  requests[1].resolve({ value: { id: "config", values: { label: "new" } } });
  await current;
  requests[0].resolve({ value: { id: "config", values: { label: "old" } } });
  await old;
  assert.equal(state.schema.value.values.label, "new");
  const save = state.saveSettings();
  await settle();
  requests[2].resolve({ value: { id: "config", values: { label: "new" } } });
  await save;
  assert.deepEqual(saved[0], {
    params: { daemonId: "new-node", id: "config" },
    data: { label: "new" }
  });
});

function pluginActionFixture(t, inventories = {}, nodeOverrides = {}) {
  t.mock.method(console, "error", () => {});
  const plugin = { id: "sample", enabled: true, running: true, removable: true };
  const panelPlugins = [plugin, { id: "node", enabled: true, running: true, removable: true }];
  const calls = [], notices = [];
  const nodes = Object.keys(inventories).map((uuid) => ({
    uuid, remarks: uuid, ip: uuid, port: 24444, available: true, ...nodeOverrides[uuid]
  }));
  const handlers = {
    pluginList: async () => panelPlugins,
    nodeList: async () => nodes,
    nodePluginList: async ({ params }) => inventories[params.daemonId],
    setPluginEnabled: async () => ({ result: { application: "applied" } }),
    setNodePluginEnabled: async () => ({ result: { application: "applied" } }),
    removePlugin: async () => ({}),
    removeNodePlugin: async () => ({})
  };
  const api = Object.fromEntries(Object.keys(handlers).map((name) => [name, () => ({
    execute: async (config) => {
      calls.push({ name, config });
      return { value: await handlers[name](config) };
    }
  })]));
  const state = setupSfc("panel/plugins/config/src/ConfigPage.vue", {
    "vue-router": {
      useRoute: () => ({ path: "/desktop", query: {} }),
      useRouter: () => ({}),
      onBeforeRouteLeave() {}
    },
    "@/lang/i18n": { t: (key, params) => params ? `${key}: ${Object.values(params).join(", ")}` : key },
    "@/plugin/context": { ctx: { plugins: {
      loaded: [], refresh: async () => calls.push({ name: "refresh" })
    } } },
    "@/tools/validator": { getValidatorErrorMsg: (error) => error.message },
    "@/tools/vuetifyToast": { message: {
      success: (text) => notices.push({ color: "success", text }),
      error: (text) => notices.push({ color: "error", text })
    } },
    "./SchemaForm.vue": {},
    "./api": api
  });
  state.plugins.value = panelPlugins;
  return {
    state, plugin, handlers, calls, notices,
    writes: () => calls.filter(({ name }) => /^(set|remove)/.test(name))
  };
}

test("confirming panel plugin actions opens a separate node picker with all matching nodes selected", async (t) => {
  for (const action of ["disable", "remove"]) await t.test(action, async (t) => {
    const record = { id: "sample", enabled: true, removable: true };
    const f = pluginActionFixture(t, {
      one: [record], two: [record], unrelated: [{ ...record, id: "other" }],
      disabled: [{ ...record, enabled: false }]
    });
    const { state } = f;
    const confirm = () => state.confirmAction();
    state.requestAction(f.plugin, action);
    assert.equal(state.actionConfirmOpen.value, true);
    assert.equal(state.nodePickerOpen.value, false);
    assert.equal(state.actionCandidate.value.checkingNodes, false);
    assert.deepEqual(f.calls, [], "opening the initial confirmation must not check nodes");
    const preparing = confirm();
    assert.equal(state.actionCandidate.value.checkingNodes, true);
    await confirm();
    assert.deepEqual(f.writes(), [], "confirmation must wait for the inventory checks");
    await preparing;
    assert.equal(state.actionConfirmOpen.value, false);
    assert.equal(state.nodePickerOpen.value, true);
    const matchingNodes = action === "disable" ? ["one", "two"] : ["one", "two", "disabled"];
    assert.deepEqual(state.actionCandidate.value.nodeTargets.map(({ node }) => node.uuid),
      matchingNodes);
    assert.deepEqual(state.actionCandidate.value.selectedNodeIds, matchingNodes,
      "all eligible nodes must be selected by default");
    assert.deepEqual(f.writes(), [], "the node picker needs a separate confirmation before any writes");
    state.actionConfirmOpen.value = false;
    assert.equal(state.nodePickerOpen.value, true, "closing the first dialog must not cancel the node picker");

    const wait = deferred();
    f.handlers[action === "disable" ? "setNodePluginEnabled" : "removeNodePlugin"] = () => wait.promise;
    state.actionCandidate.value.selectedNodeIds = ["one"];
    const saving = confirm();
    state.nodePickerOpen.value = false;
    assert.equal(state.nodePickerOpen.value, true, "a running action cannot be dismissed");
    await confirm();
    assert.equal(f.writes().length, 1, "repeated confirmation must not repeat the node write");
    state.scope.value = "node";
    state.selectedNodeId.value = "unrelated";
    state.requestAction({ ...f.plugin, id: "other" }, action);
    assert.equal(state.actionCandidate.value.plugin.id, "sample");
    wait.resolve({ result: { application: "applied" } });
    await saving;
    assert.deepEqual(f.writes(), action === "disable" ? [
      { name: "setNodePluginEnabled", config: { params: { daemonId: "one" }, data: { id: "sample", enabled: false } } },
      { name: "setPluginEnabled", config: { data: { id: "sample", enabled: false } } }
    ] : [
      { name: "removeNodePlugin", config: { params: { daemonId: "one", id: "sample" } } },
      { name: "removePlugin", config: { params: { id: "sample" } } }
    ]);
    assert.equal(state.actionConfirmOpen.value, false);
    assert.equal(state.nodePickerOpen.value, false);
  });
});

test("users can deselect every node to apply a plugin action only to the panel", async (t) => {
  for (const action of ["disable", "remove"]) await t.test(action, async (t) => {
    const f = pluginActionFixture(t, { one: [{ id: "sample", enabled: true, removable: true }] });
    f.state.requestAction(f.plugin, action);
    await f.state.confirmAction();
    assert.equal(f.state.nodePickerOpen.value, true);
    f.state.actionCandidate.value.selectedNodeIds = [];
    await f.state.confirmAction();
    assert.deepEqual(f.writes().map(({ name }) => name),
      [action === "disable" ? "setPluginEnabled" : "removePlugin"]);
  });
});

test("cancelling a plugin action discards its node scan and selection", async (t) => {
  const f = pluginActionFixture(t, { one: [] });
  const reads = [];
  f.handlers.nodePluginList = () => {
    const wait = deferred();
    reads.push(wait);
    return wait.promise;
  };
  f.state.requestAction(f.plugin, "remove");
  const old = f.state.confirmAction();
  await settle();
  f.state.actionConfirmOpen.value = false;
  f.state.requestAction({ ...f.plugin, id: "other" }, "disable");
  const current = f.state.confirmAction();
  await settle();
  reads[1].resolve([{ id: "other", enabled: true }]);
  await current;
  f.state.actionCandidate.value.selectedNodeIds = [];
  reads[0].resolve([{ id: "sample", enabled: true }]);
  await old;
  assert.equal(f.state.actionCandidate.value.plugin.id, "other");
  assert.deepEqual(f.state.actionCandidate.value.nodeTargets.map(({ plugin }) => plugin.id), ["other"]);
  assert.equal(f.state.actionCandidate.value.checkingNodes, false);
  assert.deepEqual(f.state.actionCandidate.value.selectedNodeIds, []);
  f.state.nodePickerOpen.value = false;
  assert.equal(f.state.actionCandidate.value, null);
  f.handlers.nodePluginList = async () => [{ id: "sample", enabled: true }];
  f.state.requestAction(f.plugin, "disable");
  await f.state.confirmAction();
  assert.deepEqual(f.state.actionCandidate.value.selectedNodeIds, ["one"]);
  assert.deepEqual(f.writes(), []);
});

test("node removal reports unavailable and failed nodes, respects removability, and continues other actions", async (t) => {
  const record = { id: "sample", enabled: true, removable: true };
  const f = pluginActionFixture(t, {
    good: [record], failed: [record], disabled: [{ ...record, enabled: false }],
    source: [{ ...record, removable: false }], offline: [record], broken: []
  }, { offline: { available: false } });
  const inventory = f.handlers.nodePluginList;
  f.handlers.nodePluginList = (config) => {
    if (config.params.daemonId === "broken") throw new Error("inventory unavailable");
    return inventory(config);
  };
  f.handlers.removeNodePlugin = async ({ params }) => {
    if (params.daemonId === "failed") throw new Error("node removal failed");
  };
  f.state.requestAction(f.plugin, "remove");
  await f.state.confirmAction();
  assert.match(f.state.actionCandidate.value.nodeCheckError, /offline.*broken/);
  assert.deepEqual(f.state.actionCandidate.value.selectedNodeIds, ["good", "failed", "disabled"],
    "protected source plugins cannot be selected by default");
  assert.equal(f.calls.some(({ name, config }) => name === "nodePluginList" && config.params.daemonId === "offline"), false);
  f.state.actionCandidate.value.selectedNodeIds = ["good", "failed", "disabled", "source"];
  await f.state.confirmAction();
  assert.deepEqual(f.writes().map(({ name, config }) => [name, config.params.daemonId]), [
    ["removeNodePlugin", "good"], ["removeNodePlugin", "failed"],
    ["removeNodePlugin", "disabled"], ["removePlugin", undefined]
  ]);
  assert.equal(f.notices.some(({ color }) => color === "success"), false);
  assert.match(f.notices.find(({ color }) => color === "error").text, /failed.*node removal failed/);
});

test("a failed node disable result is reported without blocking the other nodes or the panel", async (t) => {
  const record = { id: "sample", enabled: true, removable: true };
  const f = pluginActionFixture(t, { failed: [record], good: [record] });
  f.handlers.setNodePluginEnabled = async ({ params }) => ({ result: {
    application: params.daemonId === "failed" ? "failed" : "applied", error: "dispose failed"
  } });
  f.state.toggle(f.plugin, false);
  await f.state.confirmAction();
  await f.state.confirmAction();
  assert.deepEqual(f.writes().map(({ name }) => name), ["setNodePluginEnabled", "setNodePluginEnabled", "setPluginEnabled"]);
  assert.equal(f.notices.some(({ color }) => color === "success"), false);
  assert.match(f.notices.find(({ color }) => color === "error").text, /failed.*dispose failed/);
});

test("retrying a panel removal does not repeat successful node removals", async (t) => {
  const f = pluginActionFixture(t, { one: [{ id: "sample", enabled: true, removable: true }] });
  f.handlers.removePlugin = async () => { throw new Error("panel removal failed"); };
  f.state.requestAction(f.plugin, "remove");
  await f.state.confirmAction();
  await f.state.confirmAction();
  assert.equal(f.state.actionConfirmOpen.value, false);
  assert.equal(f.state.nodePickerOpen.value, true);
  assert.equal(f.state.deletingPlugin.value, false);
  f.handlers.removePlugin = async () => ({});
  await f.state.confirmAction();
  assert.deepEqual(f.writes().map(({ name }) => name), ["removeNodePlugin", "removePlugin", "removePlugin"]);
  assert.equal(f.state.actionConfirmOpen.value, false);
  assert.equal(f.state.nodePickerOpen.value, false);
});

test("panel actions without a matching node plugin execute after the initial confirmation", async (t) => {
  for (const action of ["disable", "remove"]) await t.test(action, async (t) => {
    const f = pluginActionFixture(t, { one: [{ id: "other", enabled: true, removable: true }] });
    f.state.requestAction(f.plugin, action);
    assert.deepEqual(f.writes(), []);
    await f.state.confirmAction();
    assert.equal(f.state.actionConfirmOpen.value, false);
    assert.equal(f.state.nodePickerOpen.value, false);
    assert.deepEqual(f.writes().map(({ name }) => name),
      [action === "disable" ? "setPluginEnabled" : "removePlugin"]);
  });
});

test("panels without node management and actions in the node scope do not scan other nodes", async (t) => {
  const f = pluginActionFixture(t, { one: [{ id: "sample", enabled: true }] });
  f.state.plugins.value = [f.plugin];
  f.state.toggle(f.plugin, false);
  assert.equal(f.state.actionCandidate.value.checkingNodes, false);
  await f.state.confirmAction();
  assert.equal(f.calls.some(({ name }) => name === "nodeList"), false);
  await f.state.toggle(f.plugin, true);
  assert.equal(f.state.actionConfirmOpen.value, false, "enabling remains immediate");
  assert.equal(f.state.nodePickerOpen.value, false);

  f.calls.length = 0;
  f.state.scope.value = "node";
  f.state.selectedNodeId.value = "one";
  f.state.toggle(f.plugin, false);
  f.state.selectedNodeId.value = "other";
  await f.state.confirmAction();
  assert.equal(f.calls.some(({ name }) => name === "nodeList"), false);
  assert.deepEqual(f.writes(), [{ name: "setNodePluginEnabled", config: {
    params: { daemonId: "one" }, data: { id: "sample", enabled: false }
  } }]);
});

test("plugin configuration opens its save tooltip for unsaved edits and preserves edits across saves", async (t) => {
  for (const targetScope of ["panel", "node"]) await t.test(targetScope, async (t) => {
    const effect = vue.effectScope();
    const isPhone = vue.ref(false);
    t.after(() => effect.stop());
    t.mock.method(console, "error", () => {});
    const errors = [];
    const writes = [];
    let stored = { name: "original", entries: [{ name: "first" }] };
    let failSave = false;
    let pendingSave;
    const inventory = [{ id: "settings", enabled: true }, { id: "other", enabled: true }];
    const read = async ({ params }) => ({ value: {
      id: params.id,
      fields: [{ key: "name", type: "string", title: "Name" }],
      values: JSON.parse(JSON.stringify(stored))
    } });
    const write = async (config) => {
      writes.push(config);
      if (failSave) throw new Error("save failed");
      if (pendingSave) await pendingSave.promise;
      stored = JSON.parse(JSON.stringify(config.data));
      return { value: { saved: true, application: "applied" } };
    };
    const state = effect.run(() => setupSfc("panel/plugins/config/src/ConfigPage.vue", {
      vue: { ...vue, onMounted() {}, onUnmounted() {} },
      "@/hooks/useScreen": { useScreen: () => ({ isPhone }) },
      "vue-router": {
        useRoute: () => ({ path: "/desktop", query: {} }),
        useRouter: () => ({}),
        onBeforeRouteLeave() {}
      },
      "@/plugin/context": { ctx: { plugins: { loaded: [] } } },
      "@/tools/validator": { getValidatorErrorMsg: (error) => error.message },
      "@/tools/vuetifyToast": { message: {
        success() {},
        error: (text) => errors.push(text),
        warning: () => assert.fail("the save reminder must use the button tooltip")
      } },
      "./SchemaForm.vue": {},
      "./api": {
        pluginGroupList: () => ({ execute: async () => ({ value: [] }) }),
        nodePluginGroupList: () => ({ execute: async () => ({ value: [] }) }),
        nodeList: () => ({ execute: async () => ({ value: [{ uuid: "node", available: true }] }) }),
        nodePluginList: () => ({ execute: async () => ({ value: inventory }) }),
        pluginSettings: () => ({ execute: read }),
        nodePluginSettings: () => ({ execute: read }),
        updatePluginSettings: () => ({ execute: write }),
        updateNodePluginSettings: () => ({ execute: write })
      }
    }, { scope: targetScope, daemonId: targetScope === "node" ? "node" : undefined }));
    state.plugins.value = inventory;
    await settle();
    assert.equal(state.schema.value.id, "settings");
    assert.equal(state.settingsDirty.value, false);
    assert.equal(state.saveTooltipOpen.value, false, "loading the form must not show a save reminder");
    state.saveTooltipOpen.value = true;
    assert.equal(state.saveTooltipOpen.value, true, "the regular hover/focus tooltip must still open");
    state.saveTooltipOpen.value = false;
    assert.equal(state.saveTooltipOpen.value, false);

    state.schema.value.values.entries[0].name = "edited";
    await vue.nextTick();
    assert.equal(state.settingsDirty.value, true);
    assert.equal(state.saveTooltipOpen.value, true, "editing must open the tooltip without hovering");
    state.saveTooltipOpen.value = false;
    assert.equal(state.saveTooltipOpen.value, true, "mouseleave must not hide the unsaved reminder");
    isPhone.value = true;
    state.sidebarOpen.value = true;
    await vue.nextTick();
    assert.equal(state.saveTooltipOpen.value, false, "the reminder must not overlay the mobile sidebar");
    state.selectPlugin("settings");
    assert.equal(state.sidebarOpen.value, false, "selecting the current plugin must also close the sidebar");
    assert.equal(state.settingsDirty.value, true, "reselecting the plugin must preserve its edits");
    assert.equal(state.saveTooltipOpen.value, true);
    state.sidebarOpen.value = true;
    isPhone.value = false;
    await vue.nextTick();
    assert.equal(state.sidebarOpen.value, false, "switching to the desktop layout must reset the drawer");
    state.toggleTooltipOpen.value = true;
    assert.equal(state.saveTooltipOpen.value, false, "the toggle tooltip must take priority");
    state.deleteTooltipOpen.value = true;
    state.toggleTooltipOpen.value = false;
    assert.equal(state.saveTooltipOpen.value, false, "the delete tooltip must keep the reminder hidden");
    state.deleteTooltipOpen.value = false;
    assert.equal(state.saveTooltipOpen.value, true, "the reminder must return after other tooltips close");
    state.schema.value.values.entries.push({ name: "second" });
    await vue.nextTick();
    assert.equal(state.saveTooltipOpen.value, true);
    state.schema.value.values.entries = [{ name: "first" }];
    await vue.nextTick();
    assert.equal(state.settingsDirty.value, false);
    assert.equal(state.saveTooltipOpen.value, false);

    state.schema.value.values.name = "saved";
    await vue.nextTick();
    failSave = true;
    await state.saveSettings();
    assert.deepEqual(errors, ["save failed"]);
    assert.equal(state.settingsDirty.value, true, "a failed save must retain the unsaved state");
    assert.equal(state.saveTooltipOpen.value, true);
    failSave = false;
    await state.saveSettings();
    await vue.nextTick();
    assert.equal(state.settingsDirty.value, false);
    assert.equal(state.saveTooltipOpen.value, false, "saving must close the reminder");

    state.schema.value.values.name = "submitted";
    await vue.nextTick();
    pendingSave = deferred();
    const saving = state.saveSettings();
    state.schema.value.values.name = "newer edit";
    pendingSave.resolve();
    await saving;
    await vue.nextTick();
    assert.equal(writes.at(-1).data.name, "submitted", "the request must use the submitted snapshot");
    assert.equal(state.schema.value.values.name, "newer edit");
    assert.equal(state.settingsDirty.value, true, "edits made during a save must remain unsaved");
    assert.equal(state.saveTooltipOpen.value, true);
    pendingSave = undefined;
    await state.saveSettings();
    await vue.nextTick();
    assert.equal(state.settingsDirty.value, false);

    state.schema.value.values.name = "discarded";
    await vue.nextTick();
    state.toggleTooltipOpen.value = true;
    state.deleteTooltipOpen.value = true;
    isPhone.value = true;
    state.sidebarOpen.value = true;
    state.selectPlugin("other");
    await settle();
    assert.equal(state.currentId.value, "other");
    assert.equal(state.sidebarOpen.value, false, "choosing another plugin must close the sidebar");
    assert.equal(state.settingsDirty.value, false, "another plugin must receive a fresh baseline");
    assert.equal(state.saveTooltipOpen.value, false);
    assert.equal(state.toggleTooltipOpen.value, false);
    assert.equal(state.deleteTooltipOpen.value, false);
  });
});

test("desktop plugin configuration loads each window's node without changing the desktop route", async (t) => {
  const route = vue.reactive({ path: "/desktop", query: { scope: "node", daemonId: "route-node" } });
  const requests = [];
  const createPage = (props) => {
    const scope = vue.effectScope();
    t.after(() => scope.stop());
    return scope.run(() => setupSfc("panel/plugins/config/src/ConfigPage.vue", {
      vue: { ...vue, onMounted() {}, onUnmounted() {} },
      "vue-router": {
        useRoute: () => route,
        useRouter: () => ({ resolve: () => assert.fail("desktop route must stay unchanged") }),
        onBeforeRouteLeave() {}
      },
      "@/plugin/context": { ctx: { plugins: { loaded: [] } } },
      "@/tools/validator": { getValidatorErrorMsg: String },
      "@/tools/vuetifyToast": { message: { success() {}, error: assert.fail } },
      "./SchemaForm.vue": {},
      "./api": {
        pluginGroupList: () => ({ execute: async () => ({ value: [] }) }),
        nodePluginGroupList: () => ({ execute: async () => ({ value: [] }) }),
        nodeList: () => ({ execute: async () => ({ value: ["one", "two", "route-node"].map(
          (uuid) => ({ uuid, available: true })
        ) }) }),
        nodePluginList: () => ({ execute: async ({ params }) => {
          requests.push(params.daemonId);
          return { value: [{ id: "settings" }] };
        } }),
        nodePluginSettings: () => ({ execute: async ({ params }) => ({
          value: { id: params.id, fields: [], values: { daemonId: params.daemonId } }
        }) })
      }
    }, props));
  };
  const first = createPage({ scope: "node", daemonId: "one" });
  const second = createPage({ scope: "node", daemonId: "two" });
  const fromRoute = createPage({});
  await settle();
  assert.equal(first.schema.value.values.daemonId, "one");
  assert.equal(second.schema.value.values.daemonId, "two");
  assert.equal(fromRoute.schema.value.values.daemonId, "route-node");
  assert.deepEqual(requests, ["one", "two", "route-node"]);
  assert.equal(route.path, "/desktop");
  assert.deepEqual(route.query, { scope: "node", daemonId: "route-node" });
});

test("Vuetify key/value form keeps invalid data out of its result callback", async () => {
  const emitted = [];
  let destroyed = false;
  const state = setupSfc(
    "panel/plugins/console/src/components/fc/KvOptionsDialog.vue",
    {
      "../../tools/validator": { emptyValueValidator() {}, reportValidatorError() {} }
    },
    {
      data: [],
      emitResult: (value) => emitted.push(value),
      destroyComponent: () => {
        destroyed = true;
      }
    }
  );
  state.formInstance.value = { validate: async () => ({ valid: false }) };
  await state.submit();
  assert.deepEqual(emitted, []);
  assert.equal(destroyed, false);
  state.formInstance.value = { validate: async () => ({ valid: true }) };
  await state.submit();
  assert.equal(emitted.length, 1);
  assert.equal(destroyed, true);
});

test("user search rejects an older response and fixes pagination after deleting the last row", async () => {
  const requests = [];
  const state = setupSfc("panel/plugins/user/src/widgets/UserList.vue", {
    "@/plugin/context": { usePluginService: () => undefined },
    "@/components/AppDialog.vue": {},
    "@/components/PageToolbar.vue": {},
    "@/tools/vuetifyToast": { message: {} },
    "@/hooks/useAppRouters": { useAppRouters: () => ({}) },
    "@/hooks/useScreen": { useScreen: () => ({ isPhone: vue.ref(false) }) },
    "@/tools/validator": {},
    "@/config/const": { PERMISSION_MAP: {} },
    "../api": {},
    "@/services/apis": {
      getUserInfo: () => ({
        execute: (config) => {
          const wait = deferred();
          requests.push({ config, ...wait });
          return wait.promise;
        }
      })
    }
  });
  const first = state.fetchData();
  state.operationForm.value.name = "current";
  const second = state.fetchData();
  requests[1].resolve({ value: { data: [{ userName: "current" }], total: 1 } });
  await second;
  requests[0].resolve({ value: { data: [{ userName: "old" }], total: 1 } });
  await first;
  assert.equal(state.dataSource.value[0].userName, "current");
  state.operationForm.value.currentPage = 2;
  const refresh = state.fetchData();
  requests[2].resolve({ value: { data: [], total: 20 } });
  await settle();
  assert.equal(requests[3].config.params.page, 1);
  requests[3].resolve({ value: { data: [], total: 20 } });
  await refresh;
  assert.equal(state.operationForm.value.currentPage, 1);
});

test("login keeps its loading state until the final route settles", async () => {
  const navigation = deferred();
  const navigations = [];
  const reports = [];
  const state = setupSfc("panel/plugins/user/src/widgets/LoginCard.vue", {
    "@/config/router": {
      router: {
        currentRoute: { value: { query: {} } },
        replace: (target) => {
          navigations.push(target);
          return navigation.promise;
        }
      }
    },
    "@/plugin/context": { ctx: { menus: { loginActions: [] } } },
    "@/services/apis": {
      loginPageInfo: () => ({ state: vue.ref(), execute: async () => {} }),
      loginUser: () => ({ execute: async () => ({ value: "session-token" }) }),
      ssoConfig: () => ({ execute: async () => ({ value: null }) })
    },
    "@/stores/useAppStateStore": {
      useAppStateStore: () => ({
        updateUserInfo: async () => {}
      })
    },
    "@/tools/safe": { markdownToHTML: (value) => value },
    "@/tools/validator": { reportErrorMsg: (error) => reports.push(error) },
    "@/tools/vuetifyToast": { message: { error() {} } },
    "@/tools/vuetifyModal": { Modal: { error() {} } }
  });
  state.formData.username = "admin";
  state.formData.password = "password";
  const pending = state.handleLogin();
  await settle();
  assert.deepEqual(navigations, [{ path: "/" }]);
  assert.equal(state.loading.value, true);
  await state.handleLogin();
  assert.equal(navigations.length, 1);
  navigation.resolve();
  await pending;
  assert.equal(state.loading.value, false);
  assert.deepEqual(reports, []);
});

test("terminal setup is shared and an unmounted terminal cannot create a late socket", async () => {
  const wait = deferred();
  let dispose,
    sockets = 0,
    calls = 0;
  const { useTerminal } = load("panel/plugins/terminal/src/hooks/useTerminal.ts", {
    vue: {
      ...vue,
      onMounted() {},
      onUnmounted: (callback) => {
        dispose = callback;
      }
    },
    "@/config/const": { GLOBAL_INSTANCE_NAME: "global" },
    "./useCommandHistory": { useCommandHistory: () => ({ setHistory() {} }) },
    "@/lang/i18n": i18n,
    "../api": {
      setUpTerminalStreamChannel: () => ({
        execute: () => {
          calls++;
          return wait.promise;
        }
      })
    },
    "@/stores/useAppConfigStore": { useAppConfigStore: () => ({ hasBgImage: vue.ref(false) }) },
    "@/tools/protocol": {},
    "@/types/const": { INSTANCE_STATUS_CODE: {} },
    "@xterm/addon-canvas": {},
    "@xterm/addon-fit": {},
    "@xterm/addon-webgl": {},
    "@xterm/xterm": {},
    "@/hooks/useSocketIo": {
      makeSocketIo() {
        sockets++;
      }
    }
  });
  const terminal = useTerminal();
  const first = terminal.execute({ instanceId: "instance", daemonId: "node" });
  const second = terminal.execute({ instanceId: "instance", daemonId: "node" });
  assert.equal(first, second);
  assert.equal(calls, 1);
  dispose();
  wait.resolve({ value: { addr: "node" } });
  await assert.rejects(first, /disposed/);
  assert.equal(sockets, 0);
});

test("partial instance deletion surfaces the failed UUID and does not emit success", async () => {
  const deletion = load("panel/plugins/instance/src/tools/deletion.ts", { "@/lang/i18n": i18n });
  const emitted = [];
  const errors = [];
  const state = setupSfc(
    "panel/plugins/instance/src/widgets/instance/dialogs/DeleteInstanceDialog.vue",
    {
      "@/components/AppDialog.vue": {},
      "@/services/apis/instance": {
        batchDelete: () => ({
          execute: async () => ({
            value: { instances: [], errors: [{ instanceUuid: "failed", error: "still running" }] }
          })
        })
      },
      "@/tools/validator": { reportErrorMsg: (error) => errors.push(error.message) },
      "../../../tools/deletion": deletion
    },
    {
      instanceId: "failed",
      daemonId: "node",
      emitResult: (value) => emitted.push(value),
      destroyComponent() {}
    }
  );
  await state.submit();
  assert.deepEqual(emitted, [false]);
  assert.deepEqual(errors, ["failed: still running"]);
});

test("desktop node refresh ignores stale results, validates ports and reports failed actions", async (t) => {
  const previousWindow = global.window;
  global.window = { innerWidth: 1280, innerHeight: 800 };
  t.after(() => {
    global.window = previousWindow;
  });
  const requests = [],
    errors = [],
    writes = [];
  const operation = (name) => () => ({
    execute: async (config) => {
      writes.push({ name, config });
      if (name === "delete" || name === "connect") throw new Error(`${name} failed`);
    }
  });
  const state = setupSfc("panel/plugins/node/src/desktop/DesktopNodeManager.vue", {
    "@/plugin/context": { usePluginService: () => undefined },
    "@/hooks/useOverviewInfo": { useOverviewInfo: () => ({ state: vue.ref() }) },
    "@/hooks/useSocketIo": {
      testSocketConnection: async () => {},
      SocketStatus: { Error: "error", Connected: "connected" }
    },
    "@/hooks/usePolling": { usePolling() {} },
    "@/tools/version": { hasVersionUpdate: () => false },
    "@/tools/validator": {
      reportErrorMsg: (error) => errors.push(error.message),
      getValidatorErrorMsg: (error) => error.message
    },
    "./DesktopWindow.vue": {},
    "../api": {
      remoteNodeList: () => ({
        isLoading: vue.ref(false),
        execute: () => {
          const request = deferred();
          requests.push(request);
          return request.promise;
        }
      }),
      addNode: operation("add"),
      editNode: operation("edit"),
      deleteNode: operation("delete"),
      connectNode: operation("connect")
    }
  });
  const older = state.fetchNodes();
  const newer = state.fetchNodes(true);
  const node = { uuid: "new", ip: "example.com", port: 24444, remarks: "New", available: false };
  requests[1].resolve({ value: [node] });
  await newer;
  requests[0].resolve({ value: [{ ...node, uuid: "old" }] });
  await older;
  assert.equal(state.nodes.value[0].uuid, "new");
  state.openAddDialog();
  Object.assign(state.form, { ip: "example.com", port: 70000, apiKey: "key" });
  await state.saveNode();
  assert.equal(writes.length, 0);
  assert.equal(state.formError.value, "TXT_CODE_12040bf0");
  state.confirmDelete(node);
  await state.executeDelete();
  assert.equal(state.showDeleteConfirm.value, true);
  await state.reconnectNode(node);
  assert.deepEqual(errors, ["delete failed", "connect failed"]);
});

for (const layout of ["normal", "desktop"]) {
  test(`${layout} mod downloads keep the selected file's MCIM fallback for queued and immediate downloads`, async () => {
    const requests = [];
    const { useModSearch } = load(`panel/plugins/mod/src/${layout}/mod-manager/useModSearch.ts`, {
      "@/lang/i18n": i18n,
      "@vueuse/core": { useLocalStorage: (_key, value) => vue.ref(value) },
      "@/tools/vuetifyToast": { message: { success() {}, error(error) { assert.fail(error); } } },
      "@/tools/vuetifyModal": { Modal: {} },
      "vuetify/components": {},
      "../notice": { notifyDesktop() {} },
      "../../api": {
        downloadModApi: () => ({ execute: async (config) => requests.push(config) })
      }
    });
    const state = useModSearch("instance", "node", () => [], async () => {}, vue.ref(["mods"]), layout === "desktop");
    state.selectedMod.value = { id: "project", title: "Example", source: "Modrinth" };
    const primary = {
      primary: true,
      filename: "mod.jar",
      url: "https://cdn.modrinth.com/data/project/versions/v1/mod.jar",
      fallbackUrl: "https://mod.mcimirror.top/data/project/versions/v1/mod.jar"
    };
    const task = await state.onDownload({
      id: "v1", project_type: "mod",
      files: [{ url: "https://cdn.modrinth.com/data/project/versions/v1/mod-sources.jar" }, primary]
    });
    assert.equal(task.data.url, primary.url);
    assert.equal(task.data.fallbackUrl, primary.fallbackUrl);
    assert.equal(task.data.fileName, primary.filename);
    await task.immediateFn();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].data.url, primary.url);
    assert.equal(requests[0].data.fallbackUrl, primary.fallbackUrl);

    state.selectedMod.value = { id: "123", source: "SpigotMC" };
    const spigot = await state.onDownload({ files: [
      { primary: true, filename: "plugin.jar", url: "https://api.spiget.org/v2/resources/123/download" },
      { url: "https://cdn.spiget.org/file/123.jar" }
    ] });
    assert.equal(spigot.data.fallbackUrl, "https://cdn.spiget.org/file/123.jar");
  });
}

test("editing node connection details preserves plugin settings and a blank API key", async () => {
  const writes = [];
  const state = setupSfc("panel/plugins/node/src/normal/node/NodeDetailDialog.vue", {
    "../../hooks/useRemoteNode": {
      useRemoteNode: () => ({
        updateNode: async (uuid, data) => writes.push({ uuid, data }),
        addNode() {}, deleteNode() {}
      })
    },
    "@/tools/validator": { isLocalNetworkIP: () => false, getValidatorErrorMsg() {}, reportErrorMsg(error) { throw error; } },
    "@/tools/vuetifyToast": { message: { success() {} } },
    "@/tools/vuetifyModal": { Modal: {} }
  });
  state.openDialog({
    uuid: "node", ip: "example.com", port: 24444, prefix: "/daemon", remarks: "Existing",
    apiKey: "private", available: true,
    config: { port: 25565, uploadSpeedRate: 128, outputBufferSize: 1024, enableSoftShutdown: false },
    remoteMappings: [{ from: {}, to: {} }]
  }, "node");
  const expected = { ip: "example.com", port: 24444, prefix: "/daemon", remarks: "Existing", apiKey: "" };
  assert.deepEqual({ ...state.dialog.data }, expected);
  const originalTimeout = global.setTimeout;
  global.setTimeout = () => 0; // Do not reload the browser after the successful save.
  try {
    await state.submit();
  } finally {
    global.setTimeout = originalTimeout;
  }
  assert.deepEqual(writes, [{ uuid: "node", data: { ...expected, apiKey: undefined } }]);
});
