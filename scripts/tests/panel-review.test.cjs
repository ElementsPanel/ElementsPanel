const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const panelRequire = Module.createRequire(path.join(root, "panel/package.json"));
const ts = panelRequire("typescript");
const compose = panelRequire("koa-compose");
const transpile = (filename) =>
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
require.extensions[".ts"] = (mod, filename) => mod._compile(transpile(filename), filename);

function load(relative, overrides = {}) {
  const filename = path.join(root, relative);
  const mod = new Module(filename, module);
  const localRequire = Module.createRequire(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod.require = (id) => (Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id));
  mod._compile(transpile(filename), filename);
  return mod.exports;
}

const validator = load("panel/plugins/runtime/src/backend/middleware/validator.ts").default;
const role = { USER: 1, ADMIN: 10, GUEST: 0, BAN: -1 };
const logger = { info() {}, warn() {}, error() {} };
const pass = () => async (_ctx, next) => next();
const tick = () => new Promise((resolve) => setImmediate(resolve));

function userFixture() {
  const writes = [];
  let failWrites = false;
  const runtime = {
    $t: (key) => key,
    ROLE: () => role,
    logger: () => logger,
    storage: () => ({
      getStorage: () => ({
        async store(category, uuid, data) {
          if (failWrites) throw new Error("disk full");
          writes.push({ category, uuid, data: structuredClone(data) });
        }
      })
    })
  };
  const module = load("panel/plugins/user/src/backend/service/user_service.ts", {
    "../runtime": runtime,
    "mcsmanager-common": {},
    md5: (password) => `hash:${password}`
  });
  const users = module.default;
  const user = {
    uuid: "alice",
    userName: "alice",
    permission: 1,
    passWord: "hash:correct",
    passWordType: 0,
    instances: [{ daemonId: "node", instanceUuid: "owned" }],
    secret: "",
    open2FA: false
  };
  users.objects.set(user.uuid, user);
  return {
    ...module,
    users,
    user,
    runtime,
    writes,
    failWrites: () => {
      failWrites = true;
    }
  };
}

test("validator rejects structured scalars and non-finite numbers without catching downstream errors", async () => {
  for (const [type, value] of [
    [Number, "Infinity"],
    [Number, []],
    [Number, " "],
    [String, {}],
    [Object, []]
  ]) {
    const ctx = { request: { body: { value } } };
    let reached = false;
    await validator({ body: { value: type } })(ctx, () => {
      reached = true;
    });
    assert.equal(ctx.status, 400);
    assert.equal(reached, false);
  }
  const forbidden = Object.assign(new Error("forbidden"), { status: 403 });
  await assert.rejects(
    validator({})({}, () => {
      throw forbidden;
    }),
    (error) => error === forbidden
  );
});

test("HTTP protocol preserves error status and valid false results", async () => {
  const { protocol } = load("panel/plugins/server/src/backend/protocol.ts");
  const middleware = protocol({ settings: { config: {} }, globals: { get: () => "test" } });
  for (const status of [400, 403, 413, 503]) {
    const ctx = { query: {}, path: "/api/example", response: { set() {} }, status: 200 };
    await middleware(ctx, () => {
      throw Object.assign(new Error("failure"), { status });
    });
    assert.equal(ctx.status, status);
    assert.equal(JSON.parse(ctx.body).status, status);
  }
  const ctx = { query: {}, path: "/api/example", response: { set() {} }, status: 200, body: false };
  await middleware(ctx, async () => {});
  assert.equal(ctx.status, 200);
  assert.equal(JSON.parse(ctx.body).data, false);
});

test("credentials fail for missing/disabled accounts and check password before 2FA", () => {
  const { users, user, TwoFactorError } = userFixture();
  assert.throws(() => users.checkUser({ userName: "missing", passWord: "correct" }));
  user.permission = -1;
  assert.throws(() => users.checkUser({ userName: "alice", passWord: "correct" }));
  user.permission = 1;
  user.open2FA = true;
  user.secret = "";
  assert.throws(
    () => users.checkUser({ userName: "alice", passWord: "wrong" }),
    (error) => !(error instanceof TwoFactorError)
  );
  assert.throws(() => users.checkUser({ userName: "alice", passWord: "correct" }), TwoFactorError);
});

test("user edits persist zero permissions and removed instance grants; failed writes keep live state", async () => {
  const fixture = userFixture();
  await fixture.users.edit("alice", { permission: 0 });
  assert.equal(fixture.users.getInstance("alice").permission, 0);
  await fixture.users.deleteUserInstances(
    null,
    [{ daemonId: "node", instanceUuid: "owned" }],
    true
  );
  assert.deepEqual(fixture.writes.at(-1).data.instances, []);
  fixture.failWrites();
  await assert.rejects(fixture.users.edit("alice", { userName: "changed" }), /disk full/);
  assert.equal(fixture.users.getInstance("alice").userName, "alice");
});

test("concurrent user edits preserve both changes and an SSO identity binds to only one account", async () => {
  const { users, user } = userFixture();
  await Promise.all([
    users.edit("alice", { permission: 10 }),
    users.edit("alice", { apiKey: "new-key" })
  ]);
  assert.equal(users.getInstance("alice").permission, 10);
  assert.equal(users.getInstance("alice").apiKey, "new-key");
  users.objects.set("bob", { ...user, uuid: "bob", userName: "bob" });
  const results = await Promise.allSettled([
    users.bindSso("alice", "same-identity"),
    users.bindSso("bob", "same-identity")
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(
    [...users.objects.values()].filter((entry) => entry.ssoSub === "same-identity").length,
    1
  );
});

test("concurrent grant cleanup cannot resurrect another deleted instance", async () => {
  const { users, user } = userFixture();
  user.instances.push({ daemonId: "node", instanceUuid: "second" });
  await Promise.all([
    users.deleteUserInstances(null, [{ daemonId: "node", instanceUuid: "owned" }], true),
    users.deleteUserInstances(null, [{ daemonId: "node", instanceUuid: "second" }], true)
  ]);
  assert.deepEqual(users.getInstance("alice").instances, []);
});

test("2FA cannot be disabled with an invalid code or overwritten by requesting another QR", async () => {
  const fixture = userFixture();
  fixture.user.open2FA = true;
  const passport = load("panel/plugins/user/src/backend/service/passport_service.ts", {
    "../runtime": fixture.runtime,
    "./user_service": { default: fixture.users, __esModule: true },
    "./auth_settings": { authSettings: () => ({}) }
  });
  await assert.rejects(
    passport.bind2FA({
      query: {},
      request: { header: {} },
      session: { login: true, token: "token", uuid: "alice" }
    })
  );
  assert.equal(fixture.writes.length, 0);
  let confirmed = false;
  const { default: createRouter } = load(
    "panel/plugins/user/src/backend/routers/general_user_router.ts",
    {
      "../runtime": {
        ...fixture.runtime,
        core: () => ({ middleware: { validator }, instances: {} })
      },
      "mcsmanager-common": { toBoolean: Boolean },
      "../middleware/permission": { default: pass, __esModule: true },
      "../service/passport_service": {
        getUserFromCtx: () => fixture.user,
        getUserUuid: () => "alice",
        confirm2FaQRCode: () => {
          confirmed = true;
        }
      },
      "../service/user_service": { default: { check2FA: () => false }, __esModule: true },
      "../service/permission_service": {}
    }
  );
  const route = createRouter().stack.find((entry) => entry.path === "/auth/confirm2fa");
  const ctx = {
    request: { body: { enable: false, TOTPCode: "000000" } },
    throw(status, message) {
      throw Object.assign(new Error(message), { status });
    }
  };
  await assert.rejects(compose(route.stack)(ctx), { status: 400 });
  assert.equal(confirmed, false);
});

test("missing login code returns NEED_2FA instead of submitting the literal undefined", async () => {
  class TwoFactorError extends Error {}
  let submittedCode;
  const { default: createRouter } = load("panel/plugins/user/src/backend/routers/login_router.ts", {
    "../runtime": {
      core: () => ({ middleware: { validator } }),
      operationLogger: () => logger,
      $t: (key) => key
    },
    "../middleware/permission": { default: pass, __esModule: true },
    "../service/auth_settings": { authSettings: () => ({}) },
    "../service/user_service": { TwoFactorError },
    "../service/passport_service": {
      check: () => false,
      checkBanIp: () => true,
      login: (_ctx, _name, _password, code) => {
        submittedCode = code;
        throw new TwoFactorError();
      }
    }
  });
  const route = createRouter().stack.find((entry) => entry.path === "/auth/login");
  const ctx = { request: { body: { username: "alice", password: "correct" } } };
  await compose(route.stack)(ctx);
  assert.equal(submittedCode, "");
  assert.equal(ctx.body, "NEED_2FA");
});

test("mod writes authorize the body target even when the query names an owned instance", async () => {
  let guard;
  let checked;
  const router = {
    use(fn) {
      guard = fn;
    },
    get() {},
    post() {}
  };
  const { registerModManagerRoutes } = load("panel/plugins/mod/src/backend/router.ts", {
    "./url": {}
  });
  registerModManagerRoutes(
    {
      koa: { router: () => router },
      roles: role,
      middleware: {
        permission: pass,
        validator,
        speedLimit: pass,
        requestConcurrencyLimiter: pass
      },
      identity: {
        accessPolicy: { canFileManager: true },
        of: () => ({ elevated: false }),
        canAccessInstance: (_ctx, daemonId, uuid) => {
          checked = { daemonId, uuid };
          return uuid === "owned";
        }
      },
      i18n: { $t: (key) => key }
    },
    {}
  );
  const ctx = {
    method: "POST",
    query: { daemonId: "node", uuid: "owned" },
    request: { body: { daemonId: "other-node", uuid: "victim" } }
  };
  let forwarded = false;
  await guard(ctx, () => {
    forwarded = true;
  });
  assert.deepEqual(checked, { daemonId: "other-node", uuid: "victim" });
  assert.equal(ctx.status, 403);
  assert.equal(forwarded, false);
});

test("per-ID mutex stays registered until queued requests finish", async () => {
  const { execWithMutexId, mutexIdMap } = load("panel/plugins/runtime/src/backend/utils/sync.ts");
  const order = [];
  let releaseFirst;
  let releaseSecond;
  const first = execWithMutexId("same", async () => {
    order.push("first");
    await new Promise((resolve) => {
      releaseFirst = resolve;
    });
  });
  await tick();
  const second = execWithMutexId("same", async () => {
    order.push("second");
    await new Promise((resolve) => {
      releaseSecond = resolve;
    });
  });
  releaseFirst();
  await first;
  await tick();
  const third = execWithMutexId("same", async () => {
    order.push("third");
  });
  await tick();
  assert.deepEqual(order, ["first", "second"]);
  releaseSecond();
  await Promise.all([second, third]);
  assert.deepEqual(order, ["first", "second", "third"]);
  assert.equal(mutexIdMap.size, 0);
});

test("memory cache returns values and honors expiry before periodic cleanup", (t) => {
  const { SingletonMemoryRedis, singletonMemoryRedis } = load(
    "panel/plugins/runtime/src/backend/service/mini_redis.ts"
  );
  singletonMemoryRedis.dispose();
  const cache = new SingletonMemoryRedis();
  t.after(() => cache.dispose());
  const now = Date.now;
  let clock = now();
  Date.now = () => clock;
  try {
    cache.set("forever", false);
    cache.set("short", "value", 0.1);
    assert.equal(cache.get("short"), "value");
    clock += 101;
    assert.equal(cache.get("short"), undefined);
    assert.equal(cache.get("forever"), false);
  } finally {
    Date.now = now;
  }
});

test("node RPC rejects null errors and disconnects and cleans the socket that accepted the request", async () => {
  const { default: RemoteRequest } = load("panel/plugins/node/src/backend/remote_command.ts", {
    "./remote_entity": { default: { STATUS_OK: 200 }, __esModule: true },
    "./runtime": { $t: (key) => key }
  });
  class Socket extends EventEmitter {
    connected = true;
    emit(event, packet) {
      if (packet?.uuid && !Object.hasOwn(packet, "status")) {
        this.packet = packet;
        return true;
      }
      return super.emit(event, packet);
    }
  }
  const socket = new Socket();
  const service = {
    socket,
    available: true,
    pendingRequests: new Set(),
    config: { ip: "localhost" }
  };
  const pending = new RemoteRequest(service).request("test");
  const rejection = assert.rejects(pending, /Remote request failed/);
  socket.emit("test", { uuid: socket.packet.uuid, status: 500, data: null });
  await rejection;
  assert.equal(socket.listenerCount("test"), 0);
  assert.equal(service.pendingRequests.size, 0);
  const disconnected = new RemoteRequest(service).request("test", null, 0);
  const disconnectRejection = assert.rejects(disconnected);
  service.socket = new Socket();
  socket.emit("disconnect");
  await disconnectRejection;
  assert.equal(socket.listenerCount("test"), 0);
  assert.equal(service.pendingRequests.size, 0);
});

test("failed auth settings validation preserves the live config and existing SSO bindings", async () => {
  const settings = {
    ssoType: "oauth2",
    ssoEnabled: false,
    ssoClientId: "",
    ssoClientSecret: "",
    loginInfo: "old"
  };
  let saved = false;
  let unbound = false;
  const { applyAuthSettings } = load(
    "panel/plugins/user/src/backend/routers/auth_settings_router.ts",
    {
      "../runtime": {},
      "../middleware/permission": {},
      "../service/auth_settings": {
        authSettings: () => settings,
        saveAuthSettings: () => {
          saved = true;
        }
      },
      "../service/sso_service": {},
      "../service/user_service": {
        __esModule: true,
        default: {
          unbindAllSso: () => {
            unbound = true;
          }
        }
      }
    }
  );
  await assert.rejects(
    applyAuthSettings({
      loginInfo: "changed",
      ssoUserinfoUrl: "https://new.example/user",
      ssoCallbackUrl: "file:///bad"
    })
  );
  assert.equal(settings.loginInfo, "old");
  assert.equal(saved, false);
  assert.equal(unbound, false);
});

test("configured Redis failure never silently switches account persistence to local files", async (t) => {
  let client;
  let fileWrites = 0;
  let disposed;
  const storagePlugin = load("panel/plugins/storage/src/backend/index.ts", {
    "mcsmanager-common": {
      StorageSubsystem: class {
        store() {
          fileWrites++;
        }
      }
    },
    redis: {
      createClient: () => {
        client = new EventEmitter();
        client.isOpen = false;
        client.isReady = false;
        client.connect = async () => {
          client.isOpen = true;
          client.isReady = true;
        };
        client.disconnect = async () => {
          client.isOpen = false;
          client.isReady = false;
        };
        client.set = async () => {};
        return client;
      }
    }
  });
  let storage;
  storagePlugin.apply({
    logger,
    set(_name, value) {
      storage = value;
    },
    on(_event, fn) {
      disposed = fn;
    }
  });
  t.after(() => disposed());
  await storage.initialize("redis://example");
  const selected = storage.getStorage();
  client.isReady = false;
  client.emit("error", new Error("connection lost"));
  assert.equal(storage.getStorage(), selected);
  await assert.rejects(selected.store("User", "alice", {}), /unavailable/);
  assert.equal(fileWrites, 0);
  await selected.store("SystemConfig", "config", { redisUrl: "redis://example" });
  assert.equal(fileWrites, 1);
});

test("batch instance forwarding awaits daemon completion, deduplicates IDs and surfaces failure", async () => {
  const { multiOperationForwarding } = load(
    "panel/plugins/instance/src/backend/service/instance_service.ts",
    {
      "mcsmanager-common": {},
      "../runtime": {}
    }
  );
  let resolveRequest;
  let completed = false;
  const instances = [
    { daemonId: "node", instanceUuid: "one" },
    { daemonId: "node", instanceUuid: "one" }
  ];
  const pending = multiOperationForwarding(instances, (daemonId, ids) => {
    assert.equal(daemonId, "node");
    assert.deepEqual(ids, ["one"]);
    return new Promise((resolve) => {
      resolveRequest = resolve;
    });
  }).then(() => {
    completed = true;
  });
  await tick();
  assert.equal(completed, false);
  resolveRequest();
  await pending;
  await assert.rejects(
    multiOperationForwarding(instances, async () => {
      throw new Error("daemon offline");
    }),
    /daemon offline/
  );
});

test("market paths stay under the running panel directory and cannot overwrite built-ins or traverse", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elements-panel-market-review-"));
  const previous = process.cwd();
  fs.mkdirSync(path.join(directory, "web"));
  process.chdir(path.join(directory, "web"));
  t.after(() => {
    process.chdir(previous);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const market = load("panel/plugins/market/src/backend/service/plugin_market.ts", {
    "mcsmanager-common": load("common/src/plugin_package.ts")
  });
  assert.equal(market.installRoot("panel"), path.join(directory, "web", "data", "plugins"));
  for (const name of ["../escape", "..\\escape", "C:drive", "/absolute"]) {
    assert.throws(() => market.installDirectory("panel", name), /BAD_PATH/);
  }
  const existing = market.installDirectory("panel", "built-in");
  fs.mkdirSync(existing, { recursive: true });
  await assert.rejects(
    market.writePlugin("panel", { pluginId: "other", name: "built-in" }, []),
    /DIR_TAKEN/
  );
  await assert.rejects(
    market.writePlugin("panel", { pluginId: "safe", name: "safe" }, [
      { relative: "good.txt", content: Buffer.from("safe") },
      { relative: "../outside.txt", content: Buffer.from("bad") }
    ]),
    /BAD_PATH/
  );
  assert.equal(
    fs.existsSync(path.join(market.installDirectory("panel", "safe"), "good.txt")),
    false
  );
});

test("enabled user plugin failure denies requests/uploads until its guard returns; explicit removal stays supported", async (t) => {
  const cache = load("panel/plugins/runtime/src/backend/service/mini_redis.ts");
  t.after(() => cache.singletonMemoryRedis.dispose());
  const { apply } = load("panel/plugins/runtime/src/backend/index.ts", {
    "./service/log": { setupLogging() {} },
    "./lifecycle": { setupProcessLifecycle() {} },
    "mcsmanager-common": { GlobalVariable: {} },
    "./setting": {
      initSystemConfig: async () => {},
      systemConfig: {},
      saveSystemConfig: async () => {}
    },
    "./version": { initVersionManager() {}, getVersion: () => "test" },
    "./service/mini_redis": cache
  });
  const registry = new Map([["plugins", { loaded: [{ manifest: { id: "user" } }] }]]);
  const ctx = {
    on() {},
    get: (key) => registry.get(key),
    set: (key, value) => registry.set(key, value)
  };
  await apply(ctx);
  const permission = registry.get("middleware").permission({ level: 10 });
  const { preCheck } = load("panel/plugins/server/src/backend/precheck.ts");
  const uploadCheck = preCheck(ctx);
  const request = () => ({
    request: { headers: { "content-type": "multipart/form-data" } },
    throw(status) {
      throw Object.assign(new Error("denied"), { status });
    }
  });
  let reached = 0;
  const unavailable = request();
  await permission(unavailable, () => {
    reached++;
  });
  assert.equal(unavailable.status, 503);
  assert.equal(registry.get("identity").of(unavailable).elevated, false);
  await assert.rejects(
    uploadCheck(unavailable, async () => {}),
    { status: 403 }
  );
  const guard = {
    guardRoute: () => async (_ctx, next) => next(),
    identify: () => ({ uuid: "admin", elevated: true }),
    canUpload: () => true
  };
  registry.set("guard", guard);
  await permission(request(), () => {
    reached++;
  });
  await uploadCheck(request(), async () => {
    reached++;
  });
  registry.delete("guard");
  const failedAgain = request();
  await permission(failedAgain, () => {
    reached++;
  });
  assert.equal(failedAgain.status, 503);
  assert.equal(reached, 2);
  registry.get("plugins").loaded = [];
  await permission(request(), () => {
    reached++;
  });
  assert.equal(reached, 3);
});
