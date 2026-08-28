import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Turns every source daemon plugin into a distributable directory under
// production-code/daemon/plugins/<plugin-folder>/, the same way
// package-panel-plugins.mjs does for the panel. Only the executable entry
// directory and the rewritten plugin.json are copied; `src/` is not, so
// TypeScript sources stay out of the build output.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "daemon", "plugins");
const outputRoot = path.join(root, "production-code", "daemon", "plugins");

const metadataFiles = ["plugin.json", "manifest.json", "package.json"];
const entryFields = ["daemon", "backend", "main", "entry"];
const entryCandidates = [
  "backend/index.cjs",
  "src/index.js",
  "src/index.cjs",
  "src/index.mjs",
  "src/daemon.js",
  "src/daemon.cjs",
  "src/daemon.mjs"
];

function readMetadata(directory) {
  for (const file of metadataFiles) {
    const filePath = path.join(directory, file);
    if (!fs.existsSync(filePath)) continue;
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }
  return null;
}

function resolveEntry(directory, metadata) {
  const configured = entryFields
    .map((field) => metadata[field])
    .find((entry) => typeof entry === "string" && entry.length > 0);
  const candidates = configured ? [configured] : entryCandidates;
  for (const candidate of candidates) {
    const entry = path.resolve(directory, candidate);
    if (entry.startsWith(`${path.resolve(directory)}${path.sep}`) && fs.existsSync(entry)) {
      return entry;
    }
  }
  return null;
}

function removeSourceMaps(directory) {
  if (!fs.existsSync(directory)) return;
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, item.name);
    if (item.isDirectory()) removeSourceMaps(target);
    else if (item.name.endsWith(".map")) fs.rmSync(target, { force: true });
    else if (item.name.endsWith(".js") || item.name.endsWith(".cjs") || item.name.endsWith(".mjs")) {
      const source = fs.readFileSync(target, "utf8");
      fs.writeFileSync(target, source.replace(/\n?\/\/[#@] sourceMappingURL=.*$/gm, ""), "utf8");
    }
  }
}

if (!fs.existsSync(sourceRoot)) process.exit(0);
fs.mkdirSync(outputRoot, { recursive: true });

for (const item of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
  if (!item.isDirectory()) continue;
  const sourceDirectory = path.join(sourceRoot, item.name);
  const metadata = readMetadata(sourceDirectory);
  if (!metadata) continue;

  const entry = resolveEntry(sourceDirectory, metadata);
  if (!entry) {
    console.warn(`Daemon plugin "${item.name}" has no entry module, skipping.`);
    continue;
  }

  const outputDirectory = path.join(outputRoot, item.name);
  fs.rmSync(outputDirectory, { recursive: true, force: true });
  fs.mkdirSync(outputDirectory, { recursive: true });

  const entryOutputDirectory = path.join(outputDirectory, "backend");
  fs.cpSync(path.dirname(entry), entryOutputDirectory, { recursive: true });
  removeSourceMaps(entryOutputDirectory);

  const packagedMetadata = { ...metadata };
  for (const field of entryFields) delete packagedMetadata[field];
  packagedMetadata.daemon = path.posix.join("backend", path.basename(entry));

  fs.writeFileSync(
    path.join(outputDirectory, "plugin.json"),
    `${JSON.stringify(packagedMetadata, null, 2)}\n`,
    "utf8"
  );
}
