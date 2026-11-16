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
const settingsModule = load("plugins/terminal/shared/settings.ts");
const { TerminalSettings } = settingsModule;

test("terminal global settings survive reloads and failed saves leave the active settings unchanged", async () => {
  const { registerTerminalSettings } = load("plugins/terminal/panel/src/backend/settings.ts");
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
  const { registerTerminalRoutes } = load("plugins/terminal/panel/src/backend/terminal_router.ts", {
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
  const { registerTerminalSettings } = load("plugins/terminal/panel/src/backend/settings.ts");
  ctx.plugin({ name: "terminal", inject: ["storage", "i18n"], apply: registerTerminalSettings });
  await ctx.start();
  const { SettingsFormService } = load("plugins/config/panel/src/backend/settings.ts", {
    "mcsmanager-common": load("core/common/src/plugin_contract.ts")
  });
  ctx.plugin({ name: "config", inject: ["plugins"], apply: scope => { scope.plugin(SettingsFormService); } });
  await ctx.events.flush();
  assert.deepEqual(ctx.settingsForm.declared(), ["terminal"]);
  const schema = await ctx.settingsForm.read("terminal");
  assert.equal(schema.values.fontSize, 19);
  assert.equal(schema.fields.find(field => field.key === "ctrlCIntervalMs").visibleWhen, "ctrlCProtection");
  const result = await ctx.settingsForm.write("terminal", { ...schema.values, fontSize: 22 });
  assert.deepEqual(result, { saved: true, application: "applied" });
  assert.equal((await ctx.settingsForm.read("terminal")).values.fontSize, 22);
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
  const { readOutputLogTail } = load("plugins/terminal/daemon/src/backend/output_log.ts", {
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

function terminalFixture(t, settings) {
  const vue = from("frontend")("vue");
  let dispose;
  let time = 1000;
  const sent = [];
  class Terminal {
    constructor(options) { this.options = options; this.cols = 81; this.rows = 25; }
    loadAddon() {}
    open() {}
    attachCustomKeyEventHandler() {}
    onData(callback) { this.input = callback; }
    write() {}
    dispose() {}
  }
  const { useTerminal } = load("plugins/terminal/panel/src/hooks/useTerminal.ts", {
    vue: { ...vue, onMounted() {}, onUnmounted: callback => { dispose = callback; } },
    "./useCommandHistory": { useCommandHistory: () => ({ setHistory() {} }) },
    "@elementspanel/epanel-plugin-console/config/const": { GLOBAL_INSTANCE_NAME: "global" },
    "@elementspanel/epanel-plugin-i18n": { t: key => key },
    "../api": { setUpTerminalStreamChannel: () => ({ execute: async () => ({ value: { addr: "node", terminalSettings: settings } }) }) },
    "@elementspanel/epanel-plugin-console/stores/useAppConfigStore": { useAppConfigStore: () => ({ hasBgImage: vue.ref(false) }) },
    "@elementspanel/epanel-plugin-console/tools/protocol": { parseForwardAddress: addr => addr },
    "@elementspanel/epanel-plugin-console/types/const": { INSTANCE_STATUS_CODE: { STOPPED: 0 } },
    "@xterm/addon-canvas": { CanvasAddon: class {} },
    "@xterm/addon-fit": { FitAddon: class { fit() {} } },
    "@xterm/addon-webgl": {},
    "@xterm/xterm": { Terminal },
    "@elementspanel/epanel-plugin-console/hooks/useSocketIo": {
      makeSocketIo: () => ({ on() {}, connect() {}, disconnect() {}, removeAllListeners() {}, emit: (event, data) => sent.push({ event, data }) })
    }
  }, {
    document: { createElement: () => ({ getContext: () => null }) },
    Date: { now: () => time },
    setInterval: () => 1,
    clearInterval() {}
  });
  const hook = useTerminal();
  t.after(() => dispose());
  return {
    hook,
    sent,
    setTime: value => { time = value; },
    async initialize() {
      await hook.execute({ instanceId: "instance", daemonId: "node" });
      hook.state.value = { status: 3, config: { terminalOption: { pty: true } } };
      return hook.initTerminalWindow({ addEventListener() {}, removeEventListener() {} });
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
