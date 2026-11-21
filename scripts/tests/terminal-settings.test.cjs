const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { createLoader, from } = require("./helpers.cjs");

const load = createLoader({
  globals: true,
  resolve(id, { filename, localRequire, load, overrides }) {
    const target = path.resolve(path.dirname(filename), id) + ".ts";
    return id.startsWith(".") && fs.existsSync(target) ? load(target, overrides) : localRequire(id);
  }
});
const settingsModule = load("plugins/instance/shared/terminal_settings.ts");
const { TerminalSettings } = settingsModule;

test("terminal global settings survive reloads and failed saves leave the active settings unchanged", async () => {
  const { registerTerminalSettings } = load("plugins/instance/panel/src/backend/terminal/settings.ts");
  let stored = { fontSize: 18, scrollback: -1 };
  let fail = false;
  let writes = 0;
  const storage = {
    load: async () => stored,
    async store(_category, _uuid, value) {
      if (fail) throw new Error("disk full");
      writes++;
      stored = structuredClone(value);
    }
  };
  let form;
  const scope = {
    i18n: { $t: key => key },
    storage: { getStorage: () => storage },
    settingsForm: { declare: value => { form = value; } },
    inject: (_services, callback) => callback(scope)
  };
  const current = await registerTerminalSettings(scope);
  assert.equal(current().fontSize, 18);
  assert.equal(current().scrollback, 1000);
  const next = { ...current(), historyLimitKB: 0, fontFamily: "monospace", fontSize: 20, ctrlCProtection: false };
  await form.write(next);
  assert.deepEqual(current(), next);
  assert.deepEqual((await registerTerminalSettings(scope))(), next);
  for (const invalid of [{ fontSize: 14.5 }, { scrollback: Infinity }, { historyLimitKB: -1 }, { fontFamily: " " }, { ctrlCProtection: "false" }, { ctrlCIntervalMs: 0 }])
    await assert.rejects(form.write({ ...next, ...invalid }), /INVALID_SETTINGS/);
  assert.equal(writes, 1);
  fail = true;
  await assert.rejects(form.write({ ...next, fontSize: 22 }), /disk full/);
  assert.deepEqual(current(), next);
});

test("history replay forwards its byte limit, caps older daemon responses and skips disabled history", async () => {
  const Router = from("panel")("@koa/router");
  const router = new Router();
  const requests = [];
  const settings = new TerminalSettings();
  settings.historyLimitKB = 1;
  const pass = () => async (_request, next) => next();
  const { registerTerminalRoutes } = load("plugins/instance/panel/src/backend/terminal/terminal_router.ts", {
    "./runtime": {
      $t: key => key,
      koa: () => ({ router: () => router }),
      roles: () => ({ USER: 1 }),
      middleware: () => ({ permission: pass, validator: pass, instanceAccess: pass() }),
      remote: () => ({
        services: { getInstance: () => ({ config: { addr: "localhost", prefix: "", getConvertedRemoteMappings: () => [] } }) },
        Request: class {
          async request(event, data) {
            requests.push({ event, data });
            return "你".repeat(1000);
          }
        }
      })
    }
  });
  registerTerminalRoutes(() => ({ ...settings }));
  const handler = (route) => router.stack.find(entry => entry.path === route).stack.at(-1);
  const response = { query: { daemonId: "node", uuid: "instance", size: "2KB" } };
  await handler("/outputlog")(response);
  assert.deepEqual(requests[0], { event: "instance/outputlog", data: { instanceUuid: "instance", size: 1024 } });
  assert.ok(Buffer.byteLength(response.body) <= 1024);
  assert.ok(!response.body.includes("\ufffd"));
  const invalid = { query: { daemonId: "node", uuid: "instance", size: "-1" } };
  await handler("/outputlog")(invalid);
  assert.equal(invalid.status, 400);
  settings.historyLimitKB = 0;
  const disabled = { query: { daemonId: "node", uuid: "instance" } };
  await handler("/outputlog")(disabled);
  assert.equal(disabled.body, "");
  assert.equal(requests.length, 1);
  const channel = { query: { daemonId: "node", uuid: "instance" } };
  await handler("/stream_channel")(channel);
  assert.deepEqual(channel.body.terminalSettings, { ...settings });
});

test("panel settings registered after terminal startup keep their terminal ownership", async (t) => {
  const { Context } = from("panel")("cordis");
  const ctx = new Context();
  t.after(() => ctx.stop());
  ctx.set("i18n", { $t: key => key });
  ctx.set("storage", { getStorage: () => ({ load: async () => ({ fontSize: 19 }), store: async () => {} }) });
  ctx.set("plugins", { runExclusive: callback => callback(), configuration: () => ({ fields: [], values: {} }) });
  const { registerTerminalSettings } = load("plugins/instance/panel/src/backend/terminal/settings.ts");
  ctx.plugin({ name: "instance", inject: ["storage", "i18n"], apply: registerTerminalSettings });
  await ctx.start();
  const { SettingsFormService } = load("plugins/config/panel/src/backend/settings.ts", {
    "mcsmanager-common": load("core/common/src/plugin_contract.ts")
  });
  ctx.plugin({ name: "config", inject: ["plugins"], apply: scope => { scope.plugin(SettingsFormService); } });
  await ctx.events.flush();
  assert.deepEqual(ctx.settingsForm.declared(), ["instance"]);
  const schema = await ctx.settingsForm.read("instance");
  assert.equal(schema.values.fontSize, 19);
  assert.equal(schema.fields.find(field => field.key === "ctrlCIntervalMs").visibleWhen, "ctrlCProtection");
  const result = await ctx.settingsForm.write("instance", { ...schema.values, fontSize: 22 });
  assert.deepEqual(result, { saved: true, application: "applied" });
  assert.equal((await ctx.settingsForm.read("instance")).values.fontSize, 22);
  await ctx.settingsForm.reset("instance");
  assert.equal((await ctx.settingsForm.read("instance")).values.fontSize, 14);
});

test("daemon reads only the log suffix, handles partial reads and preserves UTF-8 boundaries", async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "elements-terminal-log-"));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "instance.log");
  const content = Buffer.from("x".repeat(2 * 1024 * 1024) + "日誌🙂ABC");
  await fsp.writeFile(filename, content);
  const reads = [];
  let opens = 0;
  let closes = 0;
  const { readOutputLogTail } = load("plugins/instance/daemon/src/backend/terminal/output_log.ts", {
    "node:fs/promises": {
      async open(...args) {
        opens++;
        const file = await fsp.open(...args);
        return {
          stat: () => file.stat(),
          read(buffer, offset, length, position) {
            reads.push({ length, position });
            return file.read(buffer, offset, Math.min(2, length), position);
          },
          close: () => { closes++; return file.close(); }
        };
      }
    }
  });
  assert.equal(await readOutputLogTail(filename, 8), "🙂ABC");
  assert.equal(reads[0].position, content.length - 8);
  assert.ok(reads.every(read => read.length <= 8));
  assert.equal(closes, 1);
  assert.equal(await readOutputLogTail(filename, 0), "");
  assert.equal(opens, 1);
  await assert.rejects(readOutputLogTail(filename, 8 * 1024 * 1024), /Invalid/);
  assert.equal(opens, 1);
});

function terminalFixture(t, settings, activity) {
  const vue = from("frontend")("vue");
  activity ??= { visible: vue.ref(true), interacting: vue.ref(false) };
  const disposals = [], mounts = [], frames = new Map(), timers = new Map(), intervals = [], observers = [];
  const disposed = new Set();
  let frameId = 0, timerId = 0, fitCalls = 0, probes = 0;
  let time = 1000;
  const sent = [];
  class Terminal {
    constructor(options) { this.options = options; this.cols = 81; this.rows = 25; this.addons = []; this.writes = []; }
    loadAddon(addon) { this.addons.push(addon); }
    open() {}
    attachCustomKeyEventHandler() {}
    onData(callback) { this.input = callback; }
    write(text, callback) { this.writes.push({ text, callback }); }
    clear() { this.cleared = true; }
    dispose() {}
  }
  class WebglAddon {
    onContextLoss(callback) { this.loss = callback; }
    dispose() { this.disposed = true; }
  }
  class CanvasAddon {}
  const socketListeners = new Map();
  const { useTerminal } = load("plugins/instance/panel/src/terminal/hooks/useTerminal.ts", {
    vue: { ...vue, onMounted: callback => mounts.push(callback), onUnmounted: callback => disposals.push(callback) },
    "./useCommandHistory": { useCommandHistory: () => ({ setHistory() {} }) },
    "@elementspanel/epanel-plugin-console/config/const": { GLOBAL_INSTANCE_NAME: "global" },
    "@elementspanel/epanel-plugin-i18n": { t: key => key },
    "../api": { setUpTerminalStreamChannel: () => ({ execute: async () => ({ value: { addr: "node", terminalSettings: settings } }) }) },
    "@elementspanel/epanel-plugin-console/stores/useAppConfigStore": { useAppConfigStore: () => ({ hasBgImage: vue.ref(false) }) },
    "@elementspanel/epanel-plugin-console/hooks/useDesktopWindowActivity": { useDesktopWindowActivity: () => activity },
    "@elementspanel/epanel-plugin-console/tools/protocol": { parseForwardAddress: addr => addr },
    "@elementspanel/epanel-plugin-console/types/const": { INSTANCE_STATUS_CODE: { STOPPED: 0 } },
    "@xterm/addon-canvas": { CanvasAddon },
    "@xterm/addon-fit": { FitAddon: class { fit() { fitCalls++; } } },
    "@xterm/addon-webgl": { WebglAddon },
    "@xterm/xterm": { Terminal },
    "@elementspanel/epanel-plugin-console/hooks/useSocketIo": {
      makeSocketIo: () => ({ connected: true, on: (name, callback) => socketListeners.set(name, callback), connect() {}, disconnect() {}, removeAllListeners() {}, emit: (event, data) => sent.push({ event, data }) })
    }
  }, {
    document: { createElement: () => { probes++; return { getContext: () => null }; } },
    ResizeObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    Date: { now: () => time },
    setInterval: callback => { intervals.push(callback); return intervals.length; },
    clearInterval() {}
  });
  const hook = useTerminal();
  const dispose = index => { if (!disposed.has(index)) { disposed.add(index); disposals[index](); } };
  t.after(() => disposals.forEach((_callback, i) => dispose(i)));
  return {
    hook,
    sent,
    activity, frames, timers, intervals, observers, socketListeners, dispose,
    fitCalls: () => fitCalls, probes: () => probes,
    createHook: () => useTerminal(),
    mount: () => mounts.forEach(callback => callback()),
    flushFrames: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
    setTime: value => { time = value; },
    async initialize(terminalHook = hook) {
      await terminalHook.execute({ instanceId: "instance", daemonId: "node" });
      terminalHook.state.value = { status: 3, config: { terminalOption: { pty: true } } };
      return terminalHook.initTerminalWindow({ addEventListener() {}, removeEventListener() {} });
    }
  };
}

test("new terminals apply global fonts and scrollback while Ctrl+C respects the configured interval", async (t) => {
  const settings = { ...new TerminalSettings(), fontFamily: "monospace", fontSize: 20, scrollback: 8000, ctrlCIntervalMs: 1200 };
  const fixture = terminalFixture(t, settings);
  const term = await fixture.initialize();
  assert.equal(term.options.fontFamily, settings.fontFamily);
  assert.equal(term.options.fontSize, settings.fontSize);
  assert.equal(term.options.scrollback, settings.scrollback);
  const inputs = () => fixture.sent.filter(item => item.event === "stream/write");
  term.input("\x03");
  assert.equal(inputs().length, 0);
  fixture.setTime(1600);
  term.input("\x03");
  assert.equal(inputs().length, 1);
  fixture.setTime(2000);
  term.input("\x03");
  fixture.setTime(3300);
  term.input("\x03");
  assert.equal(inputs().length, 1, "expired confirmation does not send Ctrl+C");
  term.input("hello");
  term.input("\x03");
  assert.equal(inputs().length, 2, "other input resets the confirmation");
});

test("terminal output batches live packets, preserves history order and resumes buffered output without dropping bytes", async (t) => {
  const vue = from("frontend")("vue");
  const f = terminalFixture(t);
  const term = await f.initialize();
  for (let i = 0; i < 100; i++) f.hook.events.emit("stdout", { text: `${i}:日誌🙂\n` });
  assert.equal(term.writes.length, 0);
  assert.equal(f.frames.size, 1);
  f.hook.writeOutputHistory("history\n");
  assert.deepEqual(term.writes.map(write => write.text), [Array.from({ length: 100 }, (_, i) => `${i}:日誌🙂\n`).join(""), "", "history\n"]);
  assert.equal(f.frames.size, 0);
  f.activity.visible.value = false;
  await vue.nextTick();
  f.hook.events.emit("stdout", { text: "hidden-one\n" });
  f.hook.events.emit("stdout", { text: "hidden-two\n" });
  assert.equal(term.writes.length, 3);
  assert.equal(f.timers.size, 1);
  assert.equal([...f.timers.values()][0].delay, 1000);
  f.activity.visible.value = true;
  await vue.nextTick();
  assert.equal(f.timers.size, 0);
  assert.equal(term.writes.at(-1).text, "hidden-one\nhidden-two\n");
  f.hook.events.emit("stdout", { text: "x".repeat(256 * 1024) });
  assert.equal(term.writes.at(-1).text.length, 256 * 1024);
  assert.equal(f.frames.size, 1, "only the resumed geometry fit remains queued");
  f.dispose(0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
});

test("terminal layout responds to actual size changes and status updates pause during window interaction", async (t) => {
  const vue = from("frontend")("vue");
  const f = terminalFixture(t);
  const term = await f.initialize();
  f.mount();
  assert.equal(f.fitCalls(), 1);
  for (let i = 0; i < 10; i++) f.observers[0].callback();
  assert.equal(f.frames.size, 1);
  f.flushFrames();
  assert.equal(f.fitCalls(), 2);
  assert.equal(f.sent.filter(item => item.event === "stream/resize").length, 1);
  term.cols++;
  f.observers[0].callback(); f.flushFrames();
  assert.equal(f.sent.filter(item => item.event === "stream/resize").length, 2);
  const state = f.hook.state.value;
  f.activity.interacting.value = true;
  await vue.nextTick();
  assert.equal(term.options.cursorBlink, false);
  f.intervals[0]();
  assert.equal(f.sent.filter(item => item.event === "stream/detail").length, 0);
  f.observers[0].callback();
  assert.equal(f.frames.size, 0);
  const newest = { ...state, status: 0 };
  f.socketListeners.get("stream/detail")({ data: { ...state, status: 1 } });
  f.socketListeners.get("stream/detail")({ data: newest });
  assert.equal(f.hook.state.value, state);
  f.activity.interacting.value = false;
  await vue.nextTick();
  assert.equal(f.hook.state.value.status, 0);
  assert.equal(term.options.cursorBlink, true);
  assert.equal(f.frames.size, 1);
  f.flushFrames();
  f.intervals[0]();
  assert.equal(f.sent.filter(item => item.event === "stream/detail").length, 1);
  f.dispose(0);
  assert.equal(f.observers[0].disconnected, true);
});

test("large terminal desktops cap WebGL contexts, recover context loss and return renderer capacity on close", async (t) => {
  const f = terminalFixture(t);
  const terms = [await f.initialize()];
  for (let i = 0; i < 7; i++) terms.push(await f.initialize(f.createHook()));
  const webgl = () => terms.flatMap(term => term.addons).filter(addon => addon.constructor.name === "WebglAddon");
  assert.equal(webgl().length, 4);
  assert.equal(terms.flatMap(term => term.addons).filter(addon => addon.constructor.name === "CanvasAddon").length, 4);
  assert.equal(f.probes(), 0);
  webgl()[0].loss();
  assert.equal(terms[0].addons.at(-1).constructor.name, "CanvasAddon");
  terms.push(await f.initialize(f.createHook()));
  assert.equal(webgl().length, 5);
  f.dispose(1);
  terms.push(await f.initialize(f.createHook()));
  assert.equal(webgl().length, 6);
});

test("disabling Ctrl+C protection sends once and older panels retain terminal defaults", async (t) => {
  const fixture = terminalFixture(t, { ...new TerminalSettings(), ctrlCProtection: false });
  const term = await fixture.initialize();
  term.input("\x03");
  assert.equal(fixture.sent.filter(item => item.event === "stream/write").length, 1);
  fixture.hook.state.value.status = 0;
  term.input("\x03");
  assert.equal(fixture.sent.filter(item => item.event === "stream/write").length, 1);
  const legacy = await terminalFixture(t).initialize();
  assert.equal(legacy.options.fontSize, 14);
  assert.equal(legacy.options.scrollback, 1000);
});
