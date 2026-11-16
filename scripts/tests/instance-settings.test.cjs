const { createLoader } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { test } = require("node:test");

const base = "plugins/instance/daemon/src/backend/";
const load = createLoader({ host: "daemon" });

test("instance settings validate atomically, survive save failures and supply legacy defaults", () => {
  const { Config } = load("plugins/runtime/daemon/src/backend/entity/config.ts");
  const config = new Config();
  const settings = load(base + "instance_settings.ts", {
    "./entity/config": { globalConfiguration: { config } }
  });
  for (const [key, range] of Object.entries(settings.INSTANCE_NUMBER_SETTINGS))
    assert.equal(config[key], range.default);
  let declaration;
  let failSave = false;
  const ctx = {
    settings: {
      config,
      save() {
        if (failSave) throw new Error("disk full");
      }
    },
    i18n: { $t: (key) => key },
    inject(_keys, register) {
      register({
        settingsForm: {
          declare(form) {
            declaration = form;
          }
        }
      });
    }
  };
  load(base + "settings.ts", { "./instance_settings": settings }).registerSettings(ctx);
  declaration.write({ instanceAutoRestartResetSeconds: 0, instanceStopTimeoutSeconds: 20 });
  const before = { ...config };
  for (const value of [null, "45", -1, 0.5, Infinity, 3601]) {
    assert.throws(() =>
      declaration.write({ instanceStopTimeoutSeconds: 30, instanceDiskCheckIntervalSeconds: value })
    );
    assert.deepEqual({ ...config }, before);
  }
  assert.throws(() => declaration.write({ instanceStopForceKill: "false" }));
  failSave = true;
  assert.throws(
    () => declaration.write({ instanceStopForceKill: true, instanceLogMaxSizeKB: 4096 }),
    /disk full/
  );
  assert.deepEqual({ ...config }, before);
  delete config.instanceDiskCheckIntervalSeconds;
  assert.equal(declaration.read().instanceDiskCheckIntervalSeconds, 45);
});

test("saved logs retain recent context, honor byte limits and preserve UTF-8", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "elements-instance-logs-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "instance.log");
  const { appendInstanceLog } = load(base + "service/instance_log.ts");
  await appendInstanceLog(filename, "old\n".repeat(50) + "RECENT\n", 256);
  await appendInstanceLog(filename, "最新🙂\n".repeat(5), 256);
  let result = await fs.readFile(filename, "utf8");
  assert.ok(result.includes("RECENT\n"));
  assert.ok(result.endsWith("最新🙂\n"));
  assert.ok(Buffer.byteLength(result) <= 256);
  await appendInstanceLog(filename, "你🙂".repeat(500) + "END\n", 255);
  result = await fs.readFile(filename, "utf8");
  assert.ok(Buffer.byteLength(result) <= 255);
  assert.ok(!result.includes("�"));
  assert.ok(result.endsWith("END\n"));
  await appendInstanceLog(filename, "disabled", 0);
  assert.equal(await fs.readFile(filename, "utf8"), result);
});

test("configured schedule limits constrain new changes while persisted jobs remain restorable", (t) => {
  const config = { instanceScheduleMaxTasks: 1, instanceScheduleMaxActions: 2 };
  const settings = load(base + "instance_settings.ts", {
    "./entity/config": { globalConfiguration: { config } }
  });
  const scheduler = load(base + "service/system_instance_control.ts", {
    "../instance_settings": settings,
    "node-schedule": {},
    "../common/system_storage": { list: () => [], store() {}, delete() {} },
    "../entity/instance/instance": {},
    "../i18n": { $t: (key, options) => key + ":" + options?.limit },
    "../utils/sleep": { sleep: async () => {} },
    "./file_access": { fileSubsystem: () => ({ FileManager: { checkFileName: () => true } }) },
    "./log": { info() {}, error() {} },
    "../plugin/context": { ctx: { schedules: new Map() } },
    "./system_instance": {}
  }).default;
  t.after(() => scheduler.dispose());
  const task = {
    instanceUuid: "instance",
    name: "one",
    type: 1,
    count: -1,
    time: "3600",
    actions: [{ type: "command", payload: "say hi" }]
  };
  scheduler.registerScheduleJob(task);
  assert.throws(() => scheduler.registerScheduleJob({ ...task, name: "two" }), /TASK_LIMIT:1/);
  assert.throws(
    () =>
      scheduler.registerScheduleJob(
        { ...task, actions: Array(3).fill(task.actions[0]) },
        true,
        "one"
      ),
    /ACTION_LIMIT:2/
  );
  scheduler.registerScheduleJob(
    { ...task, name: "old", actions: Array(3).fill(task.actions[0]) },
    false
  );
  assert.equal(scheduler.listScheduleJob("instance").length, 2);
  scheduler.registerScheduleJob({ ...task, count: 2 }, true, "one");
  assert.equal(scheduler.listScheduleJob("instance")[0].count, 2);
});
