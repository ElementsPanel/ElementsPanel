#!/usr/bin/env node

// Publishes one plugin workspace to the plugin market.
//
//   npm run publish-plugin -- <workspace-folder> [--market <url>] [--version <x.y.z>]
//                             [--changelog <text>] [--compile-only]
//   npm run publish-plugin -- --disconnect [--market <url>]
//
// The plugin's details are read from the workspace's `plugin.json` — that is where
// a plugin is described. This compiles the workspace with the project's own
// compilers (scripts/compile-plugin.mjs) and uploads the result; the market reads
// the details from the packaged `plugin.json`, so nothing describes a plugin twice.
// The market puts every upload in its review queue; nothing appears on the market's
// front page until an administrator approves it.
//
// The market account is linked the first time it is needed: this script makes up a
// state, opens the market's connect page in the browser, and polls until the user
// approves. The token it gets back is stored under `data/`, which is git-ignored,
// keyed by the market's address — a token is only ever sent to the market that
// issued it. When the market stops accepting a token (revoked on the market's
// account page, or its user removed) the account is linked again. `--disconnect`
// revokes this machine's token on the market and forgets it here.
// No password ever passes through here, and the market never redirects back, so
// there is no callback URL to expose.

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const EXTERNAL_ROOT = path.join(PROJECT_ROOT, "external");
const TOKEN_FILE = path.join(PROJECT_ROOT, "data", "epanel-market.json");

const DEFAULT_MARKET_URL = "https://market.elementspanel.top";
const CONNECT_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;
const MAX_PNG_BYTES = 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// The market publishes a plugin under its `id`: a lowercase slug that starts with a
// letter, and also the directory the plugin is installed into, where Windows device
// names cannot be used. The market's upload applies the same rule.
const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

function printUsage() {
  console.error(
    "Usage: npm run publish-plugin -- <workspace-folder> [--market <url>] [--version <x.y.z>] [--changelog <text>] [--compile-only]"
  );
  console.error("       npm run publish-plugin -- --disconnect [--market <url>]");
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      positional.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      index++;
    }
  }
  return { flags, positional };
}

/**
 * A market address, as both a request base and the key a token is stored under.
 * Two spellings of one market would be two keys, so the address is reduced to
 * exactly what is used to build a request: scheme, host and path.
 */
function normalizeMarketUrl(value) {
  const raw = String(value ?? "").trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Not a market address: ${raw || "(empty)"}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`The market address must be http(s): ${raw}`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`The market address must not carry a query or fragment: ${raw}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`The market address must not carry credentials: ${raw}`);
  }
  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Everything the market is told about a plugin comes from the workspace's own
 * `plugin.json`, so a plugin is described where it is written. The panel half is
 * the one that describes the package; a daemon-only workspace still publishes
 * from its own manifest.
 *
 * `name` must come from `id`, not from `name`: the market uses it as a slug, while
 * a plugin's `name` is a human-readable label such as "hello panel plugin".
 */
async function readWorkspaceManifest(folder) {
  const panelFile = path.join(EXTERNAL_ROOT, folder, "panel", "plugin.json");
  const daemonFile = path.join(EXTERNAL_ROOT, folder, "daemon", "plugin.json");
  const panelManifest = await readJson(panelFile);
  // A two-sided plugin is described exclusively by its panel manifest. Only a
  // daemon-only workspace falls back to the daemon manifest, whose runtime-only
  // shape is otherwise deliberately ignored here.
  const daemonManifest = panelManifest ? null : await readJson(daemonFile);
  const manifest = panelManifest ?? daemonManifest;
  if (!manifest) {
    throw new Error(`No plugin.json in external/${folder}/panel or external/${folder}/daemon.`);
  }

  // The loader can fall back to the directory name, but the market cannot: a
  // package is published under the `id` its own plugin.json declares.
  const source = path.relative(PROJECT_ROOT, panelManifest ? panelFile : daemonFile);
  const id = typeof manifest.id === "string" ? manifest.id.trim() : "";
  if (!id) throw new Error(`${source} has no "id": the market publishes a plugin under its id.`);
  if (!PLUGIN_ID_PATTERN.test(id) || RESERVED_NAMES.test(id)) {
    throw new Error(
      `The id "${id}" in ${source} cannot be published: use 2-64 lowercase letters, digits, "_" or "-", starting with a letter, and not a Windows device name.`
    );
  }
  const description = typeof manifest.description === "string" ? manifest.description : "";
  return {
    name: id,
    displayName: String(manifest.displayName ?? manifest.name ?? id),
    version: String(manifest.version ?? "0.1.0"),
    description,
    category: String(manifest.category ?? ""),
    changelog: String(manifest.changelog ?? "")
  };
}

/**
 * The saved market links, one per market address, so a token is only ever sent
 * to the market that issued it:
 *
 *   { "marketUrl": "<last used>", "connections": { "<url>": { "token", "userId", … } } }
 *
 * The file used to hold a single link at its top level; that is read as the link
 * for its own `marketUrl`.
 */
async function loadConnections() {
  const stored = (await readJson(TOKEN_FILE)) ?? {};
  const connections =
    stored.connections && typeof stored.connections === "object" ? { ...stored.connections } : {};
  let lastUrl = DEFAULT_MARKET_URL;
  try {
    if (stored.marketUrl) lastUrl = normalizeMarketUrl(stored.marketUrl);
  } catch {
    // An unreadable address is simply not remembered.
  }
  if (typeof stored.token === "string" && stored.token && !connections[lastUrl]) {
    connections[lastUrl] = {
      token: stored.token,
      userId: String(stored.userId ?? ""),
      email: String(stored.email ?? ""),
      displayName: String(stored.displayName ?? "")
    };
  }
  return { marketUrl: lastUrl, connections };
}

async function saveConnections(store) {
  await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
  await fs.writeFile(
    TOKEN_FILE,
    `${JSON.stringify({ marketUrl: store.marketUrl, connections: store.connections }, null, 2)}\n`,
    { mode: 0o600 }
  );
  // `mode` only applies when the file is created, and this file holds tokens, so an
  // existing one is narrowed too. A no-op on Windows, where ACLs are not this bit.
  await fs.chmod(TOKEN_FILE, 0o600).catch(() => undefined);
}

function openBrowser(url) {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  const child = spawn(command, [url], {
    stdio: "ignore",
    detached: true,
    shell: process.platform === "win32"
  });
  child.on("error", () => undefined);
  child.unref();
}

/**
 * Links this machine to a market account. The browser does the logging in; all
 * this does is wait for the market to say the state has been granted.
 */
async function connect(store, connection) {
  const state = randomBytes(24).toString("base64url");
  const connectUrl = `${connection.marketUrl}/connect?state=${state}`;

  console.log("\nAuthorize this machine to publish as your market account:");
  console.log(`  ${connectUrl}\n`);
  openBrowser(connectUrl);

  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  process.stdout.write("Waiting for authorization");
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    try {
      const response = await fetch(
        `${connection.marketUrl}/api/oauth/token?state=${encodeURIComponent(state)}`
      );
      if (response.ok) {
        const body = await response.json();
        const token = String(body?.token ?? "");
        if (token) {
          process.stdout.write(" done\n");
          connection.token = token;
          const me = await fetchMarket(connection, "/api/oauth/me");
          connection.userId = String(me?.user?.id ?? "");
          connection.email = String(me?.user?.email ?? "");
          connection.displayName = String(me?.user?.displayName ?? "");
          store.marketUrl = connection.marketUrl;
          store.connections[connection.marketUrl] = {
            token: connection.token,
            userId: connection.userId,
            email: connection.email,
            displayName: connection.displayName
          };
          await saveConnections(store);
          console.log(`Connected as ${connection.displayName || connection.email}`);
          return connection;
        }
      }
    } catch {
      // The market may simply be slow to start; keep waiting.
    }
    process.stdout.write(".");
  }

  throw new Error("Timed out waiting for authorization. Run the command again.");
}

/** A refusal from the market, keeping its status so a revoked token can be told apart. */
class MarketRequestError extends Error {
  constructor(status, detail) {
    super(`The market refused the request (HTTP ${status}${detail ? `): ${detail}` : ")"}`);
    this.status = status;
  }
}

async function fetchMarket(connection, url, options = {}) {
  const response = await fetch(`${connection.marketUrl}${url}`, {
    ...options,
    headers: { Authorization: `Bearer ${connection.token}`, ...(options.headers ?? {}) }
  });

  if (!response.ok) {
    // h3 puts the readable Chinese reason in `data.message`; the top-level
    // `message` is just the ASCII error code, which tells nobody anything.
    let detail = "";
    try {
      const body = await response.json();
      detail = String(body?.data?.message ?? body?.message ?? "");
    } catch {
      // A non-JSON error body still has its status code to report.
    }
    throw new MarketRequestError(response.status, detail);
  }

  return await response.json();
}

/**
 * Runs a request as the linked account, linking it first when there is no token.
 * A token the market refuses — revoked, or its user removed — is dropped and the
 * account linked again, once.
 */
async function withConnection(store, connection, request) {
  if (!connection.token) await connect(store, connection);
  try {
    return await request();
  } catch (error) {
    if (!(error instanceof MarketRequestError) || error.status !== 401) throw error;
    console.log("\nThe market no longer accepts the saved token; linking the account again.");
    delete store.connections[connection.marketUrl];
    connection.token = "";
    await saveConnections(store);
    await connect(store, connection);
    return await request();
  }
}

/** Revokes this machine's token on the market, then forgets it here. */
async function disconnect(store, connection) {
  if (!connection.token) {
    console.log(`Not connected to ${connection.marketUrl}.`);
    return;
  }
  try {
    await fetchMarket(connection, "/api/oauth/token", { method: "DELETE" });
  } catch (error) {
    // A token the market already refuses is as good as revoked. Anything else is
    // reported, and the local copy kept so the command can be run again.
    if (!(error instanceof MarketRequestError) || error.status !== 401) throw error;
  }
  delete store.connections[connection.marketUrl];
  await saveConnections(store);
  console.log(`Disconnected from ${connection.marketUrl}.`);
}

/** Runs the shared compile script and streams its progress. */
function compile(folder, workspace, outDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(SCRIPT_DIR, "compile-plugin.mjs"), "--workspace", workspace, "--out", outDir],
      { cwd: PROJECT_ROOT }
    );

    let stdout = "";
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Compiling ${folder} failed.`));
        return;
      }
      const line = stdout
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean)
        .pop();
      if (!line) {
        reject(new Error("The compiler produced no result."));
        return;
      }
      try {
        resolve(JSON.parse(line));
      } catch {
        reject(new Error(`The compiler produced an unreadable result: ${line}`));
      }
    });
  });
}

// What a package may contain: a copy of PLUGIN_PACKAGE_EXTENSIONS in
// common/src/plugin_package.ts, which the daemon enforces when it installs a
// package and the market's upload applies too. Checking here means a stray build
// artifact is reported before the round trip.
const ALLOWED_EXTENSIONS = new Set([
  ".json",
  ".js",
  ".cjs",
  ".mjs",
  ".svg",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".wasm",
  ".css",
  ".scss",
  ".md",
  ".txt"
]);

/** The one PNG a package may carry: the plugin's icon, at the root of its side. */
const ICON_FILE = "icon.png";

function isPackageFileAllowed(relativeFile) {
  const segments = relativeFile.split("/");
  if (segments.length === 2 && segments[1] === ICON_FILE) return true;
  return ALLOWED_EXTENSIONS.has(path.extname(relativeFile).toLowerCase());
}

async function validatePackageFile(filename, relativeFile) {
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`The compiled package contains a non-regular file: ${relativeFile}`);
  }
  if (path.basename(relativeFile) !== ICON_FILE) return;
  if (stat.size > MAX_PNG_BYTES) {
    throw new Error(`icon.png must be no larger than ${MAX_PNG_BYTES} bytes: ${relativeFile}`);
  }
  const file = await fs.open(filename, "r");
  try {
    const header = Buffer.alloc(PNG_SIGNATURE.length);
    await file.read(header, 0, header.length, 0);
    if (!header.equals(PNG_SIGNATURE)) {
      throw new Error(`icon.png is not a PNG image: ${relativeFile}`);
    }
  } finally {
    await file.close();
  }
}

/**
 * 市场按 panel → daemon 的顺序取插件信息，所以 `--version` / `--changelog` 只写进
 * 实际描述整包的那份清单。双端插件的 daemon 清单保持为纯运行入口。
 * 工作区的 plugin.json 保持不动：覆盖只针对这一次上传。
 */
async function applyOverrides(outDir, files, manifest) {
  const relativeFile = files.includes("panel/plugin.json")
    ? "panel/plugin.json"
    : files.includes("daemon/plugin.json")
      ? "daemon/plugin.json"
      : null;
  if (!relativeFile) throw new Error("The compiled package has no plugin.json.");
  const filePath = path.join(outDir, relativeFile);
  const packaged = JSON.parse(await fs.readFile(filePath, "utf8"));
  packaged.version = manifest.version;
  packaged.changelog = manifest.changelog;
  await fs.writeFile(filePath, `${JSON.stringify(packaged, null, 2)}\n`, "utf8");
}

async function upload(connection, outDir, files) {
  const rejected = files.filter((relativeFile) => !isPackageFileAllowed(relativeFile));
  if (rejected.length) {
    throw new Error(
      `The compiled package contains files the market will not accept: ${rejected.join(", ")}`
    );
  }

  const form = new FormData();

  let totalBytes = 0;
  for (const relativeFile of files) {
    const filename = path.join(outDir, relativeFile);
    await validatePackageFile(filename, relativeFile);
    const data = await fs.readFile(filename);
    totalBytes += data.byteLength;
    form.append("file", new Blob([data]), relativeFile);
  }
  for (const relativeFile of files) console.log(`  ${relativeFile}`);
  console.log(`Uploading ${files.length} files (${(totalBytes / 1024).toFixed(1)} KB)…`);

  return await fetchMarket(connection, "/api/plugins/upload", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(5 * 60 * 1000)
  });
}

const STATUS_LABEL = { pending: "pending review", approved: "approved", rejected: "rejected" };

async function reportSubmissions(connection, pluginId) {
  const body = await fetchMarket(connection, "/api/publisher/plugins");
  const items = Array.isArray(body?.items) ? body.items : [];
  const plugin = items.find((item) => item.id === pluginId);
  if (!plugin) return;

  console.log(`\n${plugin.displayName} (${plugin.name})`);
  for (const version of plugin.versions ?? []) {
    const note = version.reviewNote ? ` — ${version.reviewNote}` : "";
    console.log(`  v${version.version}: ${STATUS_LABEL[version.status] ?? version.status}${note}`);
  }
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const store = await loadConnections();
  const marketUrl = flags.market ? normalizeMarketUrl(flags.market) : store.marketUrl;
  const connection = { ...(store.connections[marketUrl] ?? { token: "" }), marketUrl };
  // Remember which market was used, so a later run without `--market` goes to the
  // same one whether or not this run had to link the account.
  if (store.marketUrl !== marketUrl) {
    store.marketUrl = marketUrl;
    if (store.connections[marketUrl]) await saveConnections(store);
  }

  if (flags.disconnect === true) {
    await disconnect(store, connection);
    return;
  }

  const folder = positional[0];
  if (!folder) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const workspace = path.join(EXTERNAL_ROOT, folder);
  try {
    await fs.access(workspace);
  } catch {
    throw new Error(`No such plugin workspace: external/${folder}`);
  }

  const manifest = await readWorkspaceManifest(folder);
  // Only the version and the changelog are worth overriding on the command line:
  // they change with every upload, while the rest describes the plugin itself.
  if (flags.version) manifest.version = String(flags.version);
  if (flags.changelog) manifest.changelog = String(flags.changelog);
  console.log(`Publishing ${manifest.displayName} (${manifest.name}) v${manifest.version}`);

  const outDir = path.join(workspace, ".dist");
  const compiled = await compile(folder, workspace, outDir);
  if (!compiled.files?.length) throw new Error("Compiling produced no files.");
  console.log(
    `Compiled ${compiled.files.length} files into ${path.relative(PROJECT_ROOT, outDir)}`
  );

  // 市场不再收单独的 manifest 字段：它读包里自己的 plugin.json，所以覆盖值要写进去。
  await applyOverrides(outDir, compiled.files, manifest);

  if (flags["compile-only"] === true) return;

  const result = await withConnection(store, connection, () =>
    upload(connection, outDir, compiled.files)
  );
  console.log(`\nSubmitted for review: ${manifest.displayName} v${manifest.version}`);
  await reportSubmissions(connection, String(result?.pluginId ?? "")).catch(() => undefined);
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
