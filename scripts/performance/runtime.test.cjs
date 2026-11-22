const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const { createLoader } = require("../tests/helpers.cjs");

const load = createLoader();

test("common: output forwarding visits subscribers of the requested instance only", () => {
  const Stream = load("core/common/src/instance_stream.ts").default;
  const stream = new Stream();
  let inspected = 0;
  let delivered = 0;
  const sockets = Array.from({ length: 2048 }, (_, id) => {
    const socket = Object.assign(new EventEmitter(), { id: String(id) });
    return Object.defineProperty(socket, "connected", {
      get() {
        inspected++;
        return true;
      }
    });
  });
  for (const socket of sockets) stream.requestForward(socket, `instance-${socket.id}`);
  for (const socket of sockets.slice(0, 64)) stream.requestForward(socket, "active");
  inspected = 0;
  for (let i = 0; i < 100; i++) {
    stream.forwardViaCallback("active", () => {
      delivered++;
    });
  }
  assert.equal(delivered, 6400);
  assert.equal(inspected, 6400, "unrelated instances must not add forwarding work");
  for (const socket of sockets) stream.cannelForward(socket, `instance-${socket.id}`);
  for (const socket of sockets.slice(0, 64)) socket.emit("disconnect");
  assert.equal(stream.listenMap.size, 0);
  assert.ok(sockets.every((socket) => socket.listenerCount("disconnect") === 0));
});

for (const size of [256, 4096]) {
  test(`panel: filtering ${size * 2} tasks and ${size} assignments stays linear`, () => {
    const { visibleTasks } = load("plugins/node/panel/src/backend/task_stream.ts");
    let reads = 0;
    const instances = Array.from({ length: size }, (_, id) => ({
      get daemonId() {
        reads++;
        return "node";
      },
      get instanceUuid() {
        reads++;
        return String(id);
      }
    }));
    const tasks = Array.from({ length: size * 2 }, (_, id) => ({
      id: String(id),
      get instanceUuid() {
        reads++;
        return String(id);
      }
    }));
    const visible = visibleTasks("node", tasks, { permission: 1, instances });
    assert.equal(visible.length, size);
    assert.equal(visible[0].id, "0");
    assert.equal(visible.at(-1).id, String(size - 1));
    assert.ok(
      reads <= 3 * (instances.length + tasks.length),
      `${reads} property reads exceed the linear budget`
    );
  });
}

test("daemon: sustained terminal output keeps bounded storage and constant insertion work", () => {
  const { CircularBuffer } = load("plugins/instance/daemon/src/backend/common/string_cache.ts");
  const buffer = new CircularBuffer(512);
  let reads = 0;
  let writes = 0;
  buffer.buffer = new Proxy(buffer.buffer, {
    get(target, key, receiver) {
      if (/^\d+$/.test(String(key))) reads++;
      return Reflect.get(target, key, receiver);
    },
    set(target, key, value, receiver) {
      if (/^\d+$/.test(String(key))) writes++;
      return Reflect.set(target, key, value, receiver);
    }
  });
  for (let i = 0; i < 100_000; i++) buffer.push(i);
  assert.equal(buffer.buffer.length, 512);
  assert.equal(writes, 100_000);
  assert.equal(reads, 0, "inserting output must not move or scan buffered entries");
  const cache = buffer.getCache();
  assert.equal(reads, 512);
  assert.deepEqual(
    cache.items,
    Array.from({ length: 512 }, (_, i) => 99_488 + i)
  );
  assert.equal(cache.wasDeleted, true);
  assert.deepEqual(buffer.getCache(), { items: [], wasDeleted: false });
});
