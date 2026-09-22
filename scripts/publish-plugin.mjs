#!/usr/bin/env node

// Publishes one plugin workspace to the plugin market.
//
//   npm run publish-plugin -- <workspace-folder> [--market <url>] [--version <x.y.z>]
//                             [--changelog <text>] [--yes] [--compile-only]
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
// approves. The token it gets back is stored under `data/`, which is git-ignored.
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

const DEFAULT_MARKET_URL = "http://localhost:4500";
const CONNECT_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;
const MAX_PNG_BYTES = 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function printUsage() {
  console.error(
    "Usage: npm run publish-plugin -- <workspace-folder> [--market <url>] [--version <x.y.z>] [--changelog <text>] [--compile-only]"
  );
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

function normalizeMarketUrl(value) {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
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
  const panelManifest = await readJson(path.join(EXTERNAL_ROOT, folder, "panel", "plugin.json"));
  const daemonManifest = await readJson(path.join(EXTERNAL_ROOT, folder, "daemon", "plugin.json"));
  const manifest = panelManifest ?? daemonManifest;
  if (!manifest) {
    throw new Error(`No plugin.json in external/${folder}/panel or external/${folder}/daemon.`);
  }

  const id = String(manifest.id ?? folder);
  const description = typeof manifest.description === "string" ? manifest.description : "";
  return {
    name: id,
    displayName: String(manifest.displayName ?? manifest.name ?? id),
    version: String(manifest.version ?? "0.1.0"),
    summary: String(manifest.summary ?? description),
    description,
    category: String(manifest.category ?? ""),
    changelog: String(manifest.changelog ?? "")
  };
}

async function loadConnection() {
  return (await readJson(TOKEN_FILE)) ?? { marketUrl: DEFAULT_MARKET_URL, token: "" };
}

async function saveConnection(connection) {
  await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
  await fs.writeFile(TOKEN_FILE, `${JSON.stringify(connection, null, 2)}\n`, {
    mode: 0o600
  });
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
async function connect(connection) {
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
          await saveConnection(connection);
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
    throw new Error(
      `The market refused the request (HTTP ${response.status}${detail ? `): ${detail}` : ")"}`
    );
  }

  return await response.json();
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

// The market only accepts the extensions a real plugin package can contain.
// Checking here means a stray build artifact is reported before the round trip.
const ALLOWED_EXTENSIONS = new Set([
  ".json",
  ".js",
  ".cjs",
  ".mjs",
  ".ts",
  ".vue",
  ".css",
  ".scss",
  ".md",
  ".txt",
  // The plugin's own icon, picked up from the workspace root.
  ".png"
]);

async function validatePackageFile(filename, relativeFile) {
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`The compiled package contains a non-regular file: ${relativeFile}`);
  }
  if (!relativeFile.toLowerCase().endsWith(".png")) return;
  if (stat.size > MAX_PNG_BYTES) {
    throw new Error(`PNG files must be no larger than ${MAX_PNG_BYTES} bytes: ${relativeFile}`);
  }
  const file = await fs.open(filename, "r");
  try {
    const header = Buffer.alloc(PNG_SIGNATURE.length);
    await file.read(header, 0, header.length, 0);
    if (!header.equals(PNG_SIGNATURE)) {
      throw new Error(`PNG file has an invalid signature: ${relativeFile}`);
    }
  } finally {
    await file.close();
  }
}

/**
 * 市场从包里自己的 plugin.json 读插件信息，所以 `--version` / `--changelog` 要写进
 * 编译产物里的那份。工作区的 plugin.json 保持不动：覆盖只针对这一次上传。
 */
async function applyOverrides(outDir, files, manifest) {
  for (const relativeFile of files.filter((file) => file.endsWith("plugin.json"))) {
    const filePath = path.join(outDir, relativeFile);
    const packaged = JSON.parse(await fs.readFile(filePath, "utf8"));
    packaged.version = manifest.version;
    packaged.changelog = manifest.changelog;
    await fs.writeFile(filePath, `${JSON.stringify(packaged, null, 2)}\n`, "utf8");
  }
}

async function upload(connection, outDir, files) {
  const rejected = files.filter(
    (relativeFile) => !ALLOWED_EXTENSIONS.has(path.extname(relativeFile).toLowerCase())
  );
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

  const connection = await loadConnection();
  if (flags.market) connection.marketUrl = normalizeMarketUrl(flags.market);
  if (!connection.token) await connect(connection);

  const result = await upload(connection, outDir, compiled.files);
  console.log(`\nSubmitted for review: ${manifest.displayName} v${manifest.version}`);
  await reportSubmissions(connection, String(result?.pluginId ?? "")).catch(() => undefined);
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
