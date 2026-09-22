const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const frontendRequire = Module.createRequire(path.join(root, "frontend/package.json"));
const ts = frontendRequire("typescript");
const vue = frontendRequire("vue");
const i18n = { t: (key) => key, getCurrentLang: () => "zh_cn" };
const settle = () => new Promise((resolve) => setImmediate(resolve));

// Execute the real composables/services with only their browser and network
// boundaries replaced. This catches ordering and cancellation bugs without a server.
function load(filename, overrides = {}, source) {
  filename = path.join(root, filename);
  const mod = new Module(filename, module);
  const localRequire = Module.createRequire(filename);
  mod.require = (id) => {
    if (Object.hasOwn(overrides, id)) return overrides[id];
    if (id.startsWith(".")) return localRequire(id);
    return frontendRequire(id);
  };
  mod._compile(
    ts.transpileModule(source ?? fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      },
      fileName: filename + ".ts"
    }).outputText,
    filename
  );
  return mod.exports;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function setupSfc(filename, overrides = {}, props = {}) {
  const { parse, compileScript } = frontendRequire("@vue/compiler-sfc");
  const { descriptor } = parse(fs.readFileSync(path.join(root, filename), "utf8"), {
    filename: path.join(root, filename).replaceAll("\\", "/")
  });
  const script = compileScript(descriptor, {
    id: "review-test",
    fs: {
      fileExists: (file) => fs.existsSync(file) && fs.statSync(file).isFile(),
      readFile: (file) => fs.readFileSync(file, "utf8")
    }
  });
  return load(
    filename,
    {
      vue: { ...vue, onMounted() {}, onUnmounted() {}, watch() {} },
      "@/lang/i18n": i18n,
      "vuetify/components": {},
      ...overrides
    },
    script.content
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

function fileManagerFixture(api = {}) {
  const errors = [];
  const scope = vue.effectScope();
  const { useFileManager } = load("panel/plugins/file/src/hooks/useFileManager.ts", {
    vue: { ...vue, onMounted() {}, onUnmounted() {} },
    "@vueuse/core": { useLocalStorage: (_key, value) => vue.ref(value) },
    "@/components/fc": {},
    "../dialogs": {},
    "@/components/OverwriteFilesPopUpContent.vue": {},
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

test("download links encode reserved filename characters and do not turn them into query/fragment syntax", async (t) => {
  const response = vue.ref({ addr: "https://node", password: "key" });
  const fixture = fileManagerFixture({
    downloadAddress: () => ({ state: response, execute: async () => response })
  });
  t.after(fixture.dispose);
  const link = await fixture.manager.getFileLink("report #1?.txt");
  assert.equal(link, "https://node/download/key/report%20%231%3F.txt");
});

test("market reset clears platform/language filters and returns all languages", () => {
  const { useMarketPackages } = load("panel/plugins/market/src/hooks/useMarketPackages.ts", {
    "@/lang/i18n": i18n,
    "@/tools/validator": {},
    "@/types/const": { SEARCH_ALL_KEY: "ALL" },
    "@/tools/vuetifyModal": {},
    "../api": { quickInstallListAddr: () => ({}) }
  });
  const market = useMarketPackages();
  market.packages.value = ["zh_cn", "en_us", "ja_jp"].map((language) => ({
    language,
    gameType: "test",
    platform: "linux"
  }));
  market.searchForm.platform = "windows";
  market.handleReset();
  assert.equal(market.searchForm.platform, "ALL");
  assert.equal(market.getFilteredPackages().length, 3);
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

test("empty validators reject asynchronously and reporting null errors falls back safely", async () => {
  const validators = load("panel/plugins/console/src/tools/validator.ts", {
    "@/lang/i18n": i18n,
    "@/tools/vuetifyToast": {}
  });
  const invalid = validators
    .emptyValueValidator(undefined)
    .then(() => true)
    .catch((error) => error.message);
  assert.equal(await invalid, "TXT_CODE_cb08d342");
  assert.equal(await validators.emptyValueValidator(0), undefined);
  assert.equal(validators.getValidatorErrorMsg(null, "fallback"), "fallback");
});

test("switching node/plugin configuration cannot display or save a stale schema", async () => {
  const requests = [];
  const saved = [];
  const state = setupSfc("panel/plugins/config/src/ConfigPage.vue", {
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
    "./DesktopNodeAdvancedSettings.vue": {},
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
