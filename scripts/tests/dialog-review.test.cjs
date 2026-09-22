const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const frontendRequire = Module.createRequire(path.join(root, "frontend/package.json"));
const ts = frontendRequire("typescript");
const vue = frontendRequire("vue");
const i18n = { t: (key) => key };
const settle = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function load(relative, overrides = {}, source) {
  const filename = path.join(root, relative);
  const mod = new Module(filename, module);
  const localRequire = Module.createRequire(filename);
  mod.require = (id) =>
    Object.hasOwn(overrides, id)
      ? overrides[id]
      : id.startsWith(".")
      ? localRequire(id)
      : frontendRequire(id);
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

function lifecycle() {
  const mounted = [],
    unmounted = [];
  const scope = vue.effectScope();
  return {
    vue: {
      ...vue,
      onMounted: (callback) => mounted.push(callback),
      onUnmounted: (callback) => unmounted.push(callback)
    },
    run: (callback) => scope.run(callback),
    mount: () => Promise.all(mounted.map((callback) => callback())),
    dispose() {
      unmounted.forEach((callback) => callback());
      scope.stop();
    }
  };
}

function setupSfc(relative, overrides = {}, props = {}) {
  const { parse, compileScript } = frontendRequire("@vue/compiler-sfc");
  const filename = path.join(root, relative);
  const { descriptor } = parse(fs.readFileSync(filename, "utf8"), {
    filename: filename.replaceAll("\\", "/")
  });
  const script = compileScript(descriptor, {
    id: "dialog-review",
    fs: { fileExists: fs.existsSync, readFile: (file) => fs.readFileSync(file, "utf8") }
  });
  const life = lifecycle();
  const emitted = [];
  const component = load(
    relative,
    {
      vue: life.vue,
      "@/lang/i18n": i18n,
      "vuetify/components": {},
      ...overrides
    },
    script.content
  ).default;
  return {
    ...life,
    emitted,
    state: life.run(() =>
      component.setup(props, { expose() {}, emit: (...args) => emitted.push(args) })
    )
  };
}

function browser(t) {
  const previousDocument = global.document;
  const previousStorage = global.localStorage;
  const previousWindow = global.window;
  const elements = new Set(),
    listeners = new Set();
  global.document = {
    body: { appendChild: (element) => elements.add(element) },
    createElement: () => ({
      remove() {
        elements.delete(this);
      }
    }),
    addEventListener: (_event, callback) => listeners.add(callback),
    removeEventListener: (_event, callback) => listeners.delete(callback)
  };
  global.localStorage = { getItem: () => null, setItem() {} };
  global.window = {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener() {},
    removeEventListener() {}
  };
  t.after(() => {
    global.document = previousDocument;
    global.localStorage = previousStorage;
    global.window = previousWindow;
  });
  return { elements, listeners };
}

test("mounted dialogs settle cancellation and share a repeated open until cleanup", async (t) => {
  const { elements } = browser(t);
  const hosts = [],
    timers = [];
  t.mock.method(global, "setTimeout", (callback) => {
    timers.push(callback);
    return timers.length;
  });
  t.mock.method(global, "clearTimeout", () => {});
  const { useMountComponent } = load("panel/plugins/console/src/hooks/useMountComponent.ts", {
    vue: {
      createApp: (_component, props) => {
        const host = {
          props,
          unmounts: 0,
          mount: () => ({}),
          unmount() {
            this.unmounts++;
          }
        };
        hosts.push(host);
        return host;
      }
    },
    "../vuetify": { installVuetify() {} }
  });
  const dialog = useMountComponent();
  const cancelled = dialog.mount({});
  assert.equal(dialog.mount({}), cancelled);
  hosts[0].props.destroyComponent();
  assert.equal(await cancelled, undefined);
  assert.equal(dialog.mount({}), cancelled);
  hosts[0].props.destroyComponent();
  assert.equal(timers.length, 1);
  timers[0]();
  assert.equal(hosts[0].unmounts, 1);
  assert.equal(elements.size, 0);
  const confirmed = dialog.mount({});
  hosts[1].props.emitResult([]);
  assert.deepEqual(await confirmed, []);
  hosts[1].props.destroyComponent(0);
  timers[1]();
  assert.equal(hosts[1].unmounts, 1);
  assert.equal(elements.size, 0);
});

test("promise dialogs cancel, submit, and unmount exactly once", async (t) => {
  const life = lifecycle();
  t.after(life.dispose);
  const { useDialog } = load("panel/plugins/console/src/hooks/useDialog.ts", { vue: life.vue });
  const values = [];
  let destroyed = 0;
  const dialog = life.run(() =>
    useDialog({ emitResult: (value) => values.push(value), destroyComponent: () => destroyed++ })
  );
  dialog.cancel();
  const result = dialog.openDialog();
  assert.equal(dialog.openDialog(), result);
  dialog.submit("saved");
  dialog.cancel();
  assert.equal(await result, "saved");
  assert.deepEqual(values, ["saved"]);
  assert.equal(destroyed, 1);
  assert.equal(await dialog.openDialog(), undefined);

  const reusable = life.run(() => useDialog({}));
  const cancelled = reusable.openDialog();
  reusable.isVisible.value = false;
  assert.equal(await cancelled, undefined);
  const unmounted = reusable.openDialog();
  life.dispose();
  assert.equal(await unmounted, undefined);
});

function selectorFixture(
  t,
  nodeList = [{ uuid: "node-a", ip: "a", port: 24444, remarks: "A", available: true }]
) {
  browser(t);
  const requests = [],
    errors = [];
  const fixture = setupSfc(
    "panel/plugins/instance/src/components/SelectInstances.vue",
    {
      "@/hooks/useScreen": { useScreen: () => ({ isPhone: vue.ref(false) }) },
      "@/services/apis": {
        remoteNodeList: () => ({ execute: async () => ({ value: nodeList }) }),
        remoteInstances: () => ({
          execute: (config) => {
            const wait = deferred();
            requests.push({ config, ...wait });
            return wait.promise;
          }
        })
      },
      "@/tools/nodes": {},
      "@/tools/validator": { reportErrorMsg: (error) => errors.push(error) },
      "@/types/const": { INSTANCE_STATUS: {} }
    },
    { data: [], destroyComponent() {}, emitResult() {} }
  );
  t.after(fixture.dispose);
  return { ...fixture, requests, errors };
}

test("instance selection recovers invalid storage and ignores the previous node response", async (t) => {
  const { state, requests, errors } = selectorFixture(t);
  global.localStorage.getItem = () => "broken JSON";
  const first = state.initInstancesData();
  await settle();
  assert.equal(requests[0].config.params.daemonId, "node-a");
  const next = state.handleChangeNode({
    uuid: "node-b",
    ip: "b",
    port: 24444,
    remarks: "B",
    available: true
  });
  assert.equal(requests[0].config.signal.aborted, true);
  requests[1].resolve({
    value: {
      maxPage: 1,
      data: [{ instanceUuid: "current", config: { nickname: "current" }, status: 0 }]
    }
  });
  await next;
  requests[0].resolve({
    value: { maxPage: 1, data: [{ instanceUuid: "old", config: { nickname: "old" }, status: 0 }] }
  });
  await first;
  assert.equal(state.instancesList.value[0].instanceUuid, "current");
  assert.equal(state.instancesList.value[0].daemonId, "node-b");
  assert.deepEqual(errors, []);
  state.operationForm.value.instanceName = null;
  const cleared = state.initInstancesData();
  assert.equal(requests[2].config.params.instance_name, "");
  requests[2].resolve({ value: { maxPage: 1, data: [] } });
  await cleared;
});

test("instance selection makes no empty-node request and cancellation stops pending work", async (t) => {
  const empty = selectorFixture(t, []);
  await empty.state.initInstancesData();
  assert.equal(empty.requests.length, 0);
  assert.equal(empty.state.isLoading.value, false);
  assert.equal(empty.errors.length, 1);

  const fixture = selectorFixture(t);
  const request = fixture.state.initInstancesData();
  await settle();
  await fixture.state.cancel();
  assert.equal(fixture.requests[0].config.signal.aborted, true);
  fixture.requests[0].resolve({ value: { maxPage: 1, data: [{ instanceUuid: "late" }] } });
  await request;
  assert.equal(fixture.state.instances.value, undefined);
  assert.equal(fixture.state.isLoading.value, false);
});

test("node picker refresh updates the empty state and uses manual polling", async (t) => {
  const response = vue.ref({ remote: [] });
  const refreshLoading = vue.ref(false);
  let options;
  const fixture = setupSfc(
    "panel/plugins/instance/src/components/NodeSelectDialog.vue",
    {
      "@/hooks/useDialog": { useDialog: () => ({ isVisible: vue.ref(true) }) },
      "@/hooks/useRemoteNode": {
        useRemoteNode: (value) => {
          options = value;
          return {
            response,
            refreshLoading,
            refresh: async () => {
              response.value = {
                remote: [
                  { uuid: "ready", available: true },
                  { uuid: "offline", available: false }
                ]
              };
            }
          };
        }
      },
      "@/tools/validator": { reportErrorMsg() {} }
    },
    {}
  );
  t.after(fixture.dispose);
  assert.deepEqual(options, { poll: false });
  assert.equal(fixture.state.availableNodes.value.length, 0);
  await fixture.state.refreshNodes();
  assert.deepEqual(
    fixture.state.availableNodes.value.map((node) => node.uuid),
    ["ready"]
  );
});

function editorFixture(t) {
  const { listeners } = browser(t);
  const requests = [],
    errors = [];
  const fixture = setupSfc(
    "panel/plugins/file/src/normal/FileEditor.vue",
    {
      "@/components/Editor.vue": {},
      "@/hooks/useScreen": { useScreen: () => ({ isPhone: vue.ref(false) }) },
      "../api": {
        fileContent: () => ({
          execute: (config) => {
            const wait = deferred();
            requests.push({ config, ...wait });
            return wait.promise;
          }
        })
      },
      "@/tools/validator": { reportErrorMsg: (error) => errors.push(error) },
      "@/tools/vuetifyToast": { message: { success() {} } }
    },
    { daemonId: "node", instanceId: "instance" }
  );
  t.after(fixture.dispose);
  return { ...fixture, requests, errors, listeners };
}

test("file editor cancels the previous session and replaces its content with an empty file", async (t) => {
  const { state, requests, listeners } = editorFixture(t);
  const old = state.openDialog("/old.txt", "old.txt");
  const current = state.openDialog("/empty.txt", "empty.txt");
  assert.equal(await old, undefined);
  assert.equal(requests[0].config.signal.aborted, true);
  assert.equal(listeners.size, 1);
  state.handleKeydown({ ctrlKey: true, key: "s", preventDefault() {} });
  assert.equal(requests.length, 2);
  requests[1].resolve({ value: "" });
  await settle();
  requests[0].resolve({ value: "stale content" });
  await settle();
  assert.equal(state.editorText.value, "");
  assert.equal(state.openEditor.value, true);
  state.cancel();
  assert.equal(await current, undefined);
  assert.equal(listeners.size, 0);
});

test("file editor closes a failed load, permits a failed save retry, and prevents duplicate saves", async (t) => {
  const { state, requests, errors, emitted } = editorFixture(t);
  const failed = state.openDialog("/missing.txt", "missing.txt");
  requests[0].reject(new Error("load failed"));
  assert.equal(await failed, undefined);
  assert.equal(state.open.value, false);
  const edited = state.openDialog("/file.txt", "file.txt");
  requests[1].resolve({ value: "original" });
  await settle();
  state.editorText.value = "changed";
  const firstSave = state.submit();
  await state.submit();
  assert.equal(requests.length, 3);
  requests[2].reject(new Error("save failed"));
  await firstSave;
  assert.equal(state.open.value, true);
  assert.equal(state.isSaving.value, false);
  const retry = state.submit();
  assert.equal(requests[3].config.data.text, "changed");
  requests[3].resolve({ value: true });
  await retry;
  assert.equal(await edited, "changed");
  assert.deepEqual(emitted, [["save"]]);
  assert.equal(errors.length, 2);
});

test("a late file save cannot close a new editor and unmount settles its open promise", async (t) => {
  const { state, requests, emitted, listeners, dispose } = editorFixture(t);
  const previous = state.openDialog("/previous.txt", "previous.txt");
  requests[0].resolve({ value: "previous" });
  await settle();
  state.editorText.value = "saved previous";
  const save = state.submit();
  const current = state.openDialog("/current.txt", "current.txt");
  assert.equal(await previous, undefined);
  assert.equal(requests[1].config.signal.aborted, true);
  assert.equal(requests[1].config.data.target, "/previous.txt");
  requests[2].resolve({ value: "current" });
  await settle();
  requests[1].resolve({ value: true });
  await save;
  assert.equal(state.open.value, true);
  assert.equal(state.editorText.value, "current");
  assert.deepEqual(emitted, []);
  dispose();
  assert.equal(await current, undefined);
  assert.equal(listeners.size, 0);
});

test("Docker option cancellation preserves values while confirming an empty list clears them", async (t) => {
  let result;
  const optionNames = [
    "usePortEditDialog",
    "useVolumeEditDialog",
    "useDockerEnvEditDialog",
    "useDockerLabelEditDialog",
    "useDockerCapabilityEditDialog",
    "useDockerDeviceEditDialog"
  ];
  const helpers = load("panel/plugins/console/src/components/fc/index.ts", {
    "@/hooks/useMountComponent": { useMountComponent: () => ({ mount: async () => result }) },
    "@/plugin/context": { usePluginService: () => ({ components: {} }) },
    "@/components/fc/KvOptionsDialog.vue": {},
    "@/lang/i18n": i18n,
    "./TaskLoadingDialog.vue": {}
  });
  const fixture = setupSfc(
    "panel/plugins/instance/src/widgets/instance/dialogs/InstanceDetail.vue",
    {
      "@/components/fc": helpers,
      "@/components/AppDialog.vue": {},
      "@/plugin/context": {},
      "@/hooks/useInstance": { INSTANCE_TYPE_TRANSLATION: {} },
      "@/hooks/useScreen": { useScreen: () => ({ isPhone: vue.ref(false) }) },
      "@/services/apis/envImage": { getNetworkModeList: () => ({}) },
      "@/services/apis/instance": { updateAnyInstanceConfig: () => ({}) },
      "@/tools/common": { dockerPortsArray: () => [] },
      "@/tools/validator": {},
      "@/types/const": { defaultQuickStartPackages: {} },
      "@/tools/vuetifyToast": {},
      "@/config/const": {},
      "@/tools/time": {},
      "./components/DockerImageSelect.vue": {}
    },
    {}
  );
  t.after(fixture.dispose);
  const original = {
    ports: ["1:2/tcp"],
    extraVolumes: ["host|container"],
    env: ["TOKEN=a=b"],
    labels: ["label=value"],
    capAdd: ["ALL"],
    capDrop: [],
    devices: ["host|container|rwm"]
  };
  fixture.state.formData.value.instance = { config: { docker: structuredClone(original) } };
  for (const name of optionNames) assert.equal(await helpers[name](), undefined);
  for (const type of ["port", "volume", "env", "label", "capability", "device"])
    await fixture.state.handleEditDockerConfig(type);
  assert.deepEqual(vue.toRaw(fixture.state.docker.value), original);
  result = [];
  for (const type of ["port", "volume", "env", "label", "capability", "device"])
    await fixture.state.handleEditDockerConfig(type);
  assert.deepEqual(Object.values(fixture.state.docker.value), [[], [], [], [], [], [], []]);
});

function fileManagerFixture(t, api = {}) {
  const life = lifecycle();
  const { useFileManager } = load("panel/plugins/file/src/hooks/useFileManager.ts", {
    vue: life.vue,
    "@vueuse/core": { useLocalStorage: (_key, value) => vue.ref(value) },
    "@/components/fc": {},
    "../dialogs": {},
    "@/components/OverwriteFilesPopUpContent.vue": {},
    "@/lang/i18n": i18n,
    "../api": {
      fileList: () => ({ execute: async () => ({ value: { items: [], total: 0 } }) }),
      ...api
    },
    "../services/uploadService": {},
    "@/tools/permission": {},
    "@/tools/protocol": {},
    "@/tools/string": {
      removeTrail: (value, suffix) =>
        value.endsWith(suffix) ? value.slice(0, -suffix.length) : value
    },
    "@/tools/validator": { reportErrorMsg() {} },
    "@/tools/vuetifyToast": { message: { success() {} } },
    "@/tools/vuetifyModal": {},
    "vuetify/components": {}
  });
  t.after(life.dispose);
  return { ...life, manager: life.run(() => useFileManager("instance", "node")) };
}

test("file deletion settles external close and unmount while confirmation runs only once", async (t) => {
  let deleted = 0;
  const { manager, dispose } = fileManagerFixture(t, {
    deleteFile: () => ({
      execute: async () => {
        deleted++;
      }
    })
  });
  const dismissed = manager.deleteFile("dismissed.txt");
  manager.deleteDialog.value.show = false;
  await dismissed;
  assert.equal(deleted, 0);
  assert.equal(manager.deleteDialog.value.resolve, null);

  const confirmed = manager.deleteFile("confirmed.txt");
  const confirm = manager.deleteDialog.value.resolve;
  confirm(true);
  confirm(true);
  await confirmed;
  assert.equal(deleted, 1);

  const closed = manager.deleteFile("closed.txt");
  dispose();
  await closed;
  assert.equal(deleted, 1);
  assert.equal(manager.deleteDialog.value.resolve, null);
  await manager.deleteFile("after-unmount.txt");
  assert.equal(manager.deleteDialog.value.show, false);
});

test("unmounted file managers cannot resume upload confirmations or publish late status", async (t) => {
  const confirmation = deferred(),
    status = deferred();
  const statusState = vue.ref();
  let missions = 0;
  const { manager, dispose } = fileManagerFixture(t, {
    uploadAddress: () => ({
      state: vue.ref(),
      execute: async () => {
        missions++;
      }
    }),
    getFileStatus: () => ({
      state: statusState,
      execute: async () => {
        statusState.value = await status.promise;
      }
    })
  });
  manager.dataSource.value = [{ name: "existing.txt" }];
  const upload = manager.selectedFiles(
    [{ name: "existing.txt" }],
    undefined,
    () => confirmation.promise
  );
  const refresh = manager.getFileStatus();
  dispose();
  confirmation.resolve({ confirmed: true, all: true, overwrite: true });
  status.resolve({ disks: ["late"] });
  await Promise.all([upload, refresh]);
  assert.equal(missions, 0);
  assert.equal(manager.fileStatus.value, undefined);
  assert.equal(await manager.getFileList(), false);
});

test("desktop overwrite dialogs settle dismissal, replacement, and window close", async (t) => {
  browser(t);
  const { manager } = fileManagerFixture(t);
  const polls = [];
  const fixture = setupSfc(
    "panel/plugins/file/src/desktop/DesktopFileManager.vue",
    {
      "../hooks/useFileManager": { useFileManager: () => manager },
      "@/hooks/usePolling": {
        usePolling: (refresh, interval) => polls.push({ refresh, interval })
      },
      "@/components/ArchivePreview.vue": {},
      "../services/uploadService": { uiData: vue.ref({}) },
      "../tools/fileManager": {},
      "@/tools/fileSize": {},
      "../../../desktop/src/desktopNotice": {}
    },
    { instanceId: "instance", daemonId: "node" }
  );
  t.after(fixture.dispose);
  assert.equal(polls.length, 1);
  assert.equal(polls[0].refresh, manager.getFileStatus);
  assert.equal(polls[0].interval, 3000);

  const { state } = fixture;
  const ask = state.createOverwriteHandler();
  const dismissed = ask({ count: 1, fileName: "first" });
  state.overwriteDialog.value.show = false;
  assert.deepEqual(await dismissed, { confirmed: false, all: false, overwrite: false });
  assert.equal(state.overwriteDialog.value.resolve, null);
  const confirmed = ask({ count: 2, fileName: "second" });
  state.overwriteDialog.value.all = true;
  state.overwriteDialog.value.overwrite = true;
  state.handleOverwriteOk();
  state.handleOverwriteCancel();
  assert.deepEqual(await confirmed, { confirmed: true, all: true, overwrite: true });
  const replaced = ask({ count: 2, fileName: "third" });
  const current = ask({ count: 1, fileName: "fourth" });
  assert.deepEqual(await replaced, { confirmed: false, all: true, overwrite: false });
  fixture.dispose();
  assert.deepEqual(await current, { confirmed: false, all: true, overwrite: false });
  assert.equal(state.overwriteDialog.value.resolve, null);
  assert.equal(state.overwriteDialog.value.show, false);
});
