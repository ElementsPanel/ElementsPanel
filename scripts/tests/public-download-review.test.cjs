const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const Module = require("node:module");
const { test } = require("node:test");

const root = path.resolve(__dirname, "../..");
const daemonRequire = Module.createRequire(path.join(root, "daemon/package.json"));
const ts = daemonRequire("typescript");
const directory = "daemon/plugins/runtime/src/backend/service/";

function load(relative, overrides = {}) {
  const filename = path.join(root, relative);
  const mod = new Module(filename, module);
  mod.require = (id) => Object.hasOwn(overrides, id) ? overrides[id] : daemonRequire(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }, fileName: filename
  }).outputText, filename);
  return mod.exports;
}

function policy(t, records = [{ address: "8.8.8.8", family: 4 }]) {
  const lookups = [];
  const resolver = { records };
  const safe = load(directory + "public_download.ts", {
    "node:dns": {
      lookup(host, options, callback) {
        lookups.push({ host, options });
        process.nextTick(() => callback(null, resolver.records));
      }
    }
  });
  const options = safe.publicDownloadRequestOptions("https://downloads.example/server.jar");
  t.after(() => { options.httpAgent.destroy(); options.httpsAgent.destroy(); });
  return { ...safe, options, resolver, lookups };
}

function lookup(policy, options = {}) {
  return new Promise((resolve, reject) => {
    policy.lookupPublicAddress("downloads.example", options, (error, address, family) => {
      if (error) reject(error);
      else resolve({ address, family });
    });
  });
}

test("public download addresses accept public IPv4/IPv6 and reject non-public or embedded private IPs", (t) => {
  const { isPublicAddress } = policy(t);
  for (const address of [
    "8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111",
    "2001:4860:4860::8888", "::ffff:8.8.8.8", "64:ff9b::808:808"
  ]) assert.equal(isPublicAddress(address), true, address);
  for (const address of [
    "0.0.0.0", "10.0.0.1", "100.100.100.200", "127.0.0.1", "169.254.169.254",
    "172.16.1.1", "192.168.1.1", "198.18.0.1", "192.0.2.1", "224.0.0.1", "255.255.255.255",
    "168.63.129.16", "::", "::1", "fc00::1", "fe80::1", "fe80::1%eth0", "ff02::1",
    "2001:db8::1", "2002:7f00:1::", "::ffff:127.0.0.1", "::ffff:7f00:1",
    "::ffff:192.168.1.1", "64:ff9b::a00:1", "64:ff9b::7f00:1", "64:ff9b:1::1", "invalid"
  ]) assert.equal(isPublicAddress(address), false, address);
});

test("initial URLs reject credentials, local names and private literals that bypass socket lookup", (t) => {
  const { assertPublicDownloadUrl } = policy(t);
  for (const url of [
    "file:///etc/passwd", "ftp://downloads.example/file", "https://user:pass@downloads.example/file",
    "http://localhost/file", "http://localhost./file", "http://server.local/file",
    "http://server.localhost/file", "http://127.0.0.1/", "http://2130706433/",
    "http://0x7f000001/", "http://[::1]/", "http://[::ffff:127.0.0.1]/"
  ]) assert.throws(() => assertPublicDownloadUrl(url), /public HTTP\(S\)/, url);
  for (const url of [
    "https://downloads.example/file", "https://8.8.8.8/file", "https://[2606:4700:4700::1111]/file"
  ]) assert.equal(assertPublicDownloadUrl(url).href, url);
});

test("the socket lookup returns the same checked records and preserves public IPv6 answers", async (t) => {
  const p = policy(t, [
    { address: "2606:4700:4700::1111", family: 6 }, { address: "8.8.8.8", family: 4 }
  ]);
  assert.deepEqual(await lookup(p, { all: true, hints: 0 }), {
    address: p.resolver.records, family: undefined
  });
  assert.equal(p.lookups.length, 1);
  assert.equal(p.lookups[0].options.all, true);
  assert.deepEqual(await lookup(p), { address: "2606:4700:4700::1111", family: 6 });
  assert.equal(p.lookups.length, 2, "one resolution per actual connection, no second lookup");

  p.resolver.records = [{ address: "10.0.0.1", family: 4 }];
  await assert.rejects(lookup(p), { code: "ERR_UNSAFE_DOWNLOAD_URL" });
  assert.equal(p.lookups.length, 3, "a later DNS rebind is checked again");
});

test("mixed DNS results and IPv4-mapped private addresses are rejected before connection", async (t) => {
  const p = policy(t);
  for (const records of [
    [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }],
    [{ address: "::ffff:127.0.0.1", family: 6 }],
    [{ address: "8.8.8.8", family: 0 }], []
  ]) {
    p.resolver.records = records;
    await assert.rejects(lookup(p, { all: true }), { code: "ERR_UNSAFE_DOWNLOAD_URL" });
  }
});

test("HTTP agent invokes the checked DNS lookup rather than connecting to a private answer", async (t) => {
  const p = policy(t, [{ address: "127.0.0.1", family: 4 }]);
  await assert.rejects(new Promise((resolve, reject) => {
    const request = http.get("http://downloads.example:1/file", { agent: p.options.httpAgent }, resolve);
    request.on("error", reject);
  }), { code: "ERR_UNSAFE_DOWNLOAD_URL" });
  assert.equal(p.lookups.length, 1);
});

test("redirects recheck literal destinations and retain DNS checks for redirected domains", async (t) => {
  const p = policy(t);
  const redirect = (url) => {
    const parsed = new URL(url);
    return { href: url, hostname: parsed.hostname.replace(/^\[|\]$/g, ""), protocol: parsed.protocol };
  };
  for (const url of [
    "http://127.0.0.1/file", "http://169.254.169.254/latest/meta-data/",
    "http://[::ffff:127.0.0.1]/file", "https://user:pass@downloads.example/file", "ftp://downloads.example/file"
  ]) assert.throws(() => p.options.beforeRedirect(redirect(url)), /public HTTP\(S\)/);
  assert.doesNotThrow(() => p.options.beforeRedirect(redirect("https://cdn.example/file")));
  assert.doesNotThrow(() => p.options.beforeRedirect(redirect("https://[2606:4700:4700::1111]/file")));
  assert.throws(() => p.options.beforeRedirect({
    ...redirect("https://cdn.example/file"), hostname: "127.0.0.1"
  }), /public HTTP\(S\)/);
  p.resolver.records = [{ address: "192.168.0.1", family: 4 }];
  await assert.rejects(lookup(p), { code: "ERR_UNSAFE_DOWNLOAD_URL" });
});

test("download transport disables environment proxies and keeps retry and cancellation behavior", async (t) => {
  const p = policy(t);
  const requests = [];
  let attempts = 0;
  let retries = 0;
  let destroyed = 0;
  const response = { data: {}, headers: {} };
  const manager = load(directory + "download_manager.ts", {
    axios: async (config) => {
      requests.push(config);
      if (++attempts === 1) throw { response: { status: 503, data: { destroy() { destroyed++; } } } };
      return response;
    },
    "./public_download": p,
    "../entity/config": { globalConfiguration: { config: {} } },
    "../common/network": { getCommonHeaders: () => ({}) },
    "timers/promises": { setTimeout: async () => { retries++; } }
  }).default;
  assert.equal(await manager.requestWithRetry("https://downloads.example/file", new AbortController()), response);
  assert.equal(retries, 1);
  assert.equal(destroyed, 1);
  for (const request of requests) {
    assert.equal(request.proxy, false);
    assert.equal(request.adapter, "http");
    assert.equal(request.httpAgent.options.lookup, p.lookupPublicAddress);
    assert.equal(request.httpsAgent.options.lookup, p.lookupPublicAddress);
    assert.equal(request.maxRedirects, 10);
  }
  await assert.rejects(manager.requestWithRetry("http://127.0.0.1/file", new AbortController()), {
    code: "ERR_UNSAFE_DOWNLOAD_URL"
  });
  assert.equal(requests.length, 2);

  const aborted = new AbortController();
  aborted.abort();
  attempts = 0;
  await assert.rejects(manager.requestWithRetry("https://downloads.example/file", aborted));
  assert.equal(retries, 1, "an aborted request does not retry");
});
