import fs from "node:fs";
import path from "node:path";
import { copyTree } from "./npm-assets.mjs";

// Stage compiled built-in plugins for the daemon npm package. Source directories
// and plugins installed into a development workspace are never published.

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
    if (!fs.lstatSync(filePath).isFile())
      throw new Error(`Plugin metadata must be a regular file: ${filePath}`);
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
    else if (
      item.name.endsWith(".js") ||
      item.name.endsWith(".cjs") ||
      item.name.endsWith(".mjs")
    ) {
      const source = fs.readFileSync(target, "utf8");
      fs.writeFileSync(target, source.replace(/\n?\/\/[#@] sourceMappingURL=.*$/gm, ""), "utf8");
    }
  }
}

export function packageDaemonPlugins({ sourceRoot, outputRoot, pluginNames }) {
  fs.mkdirSync(outputRoot, { recursive: true });

  for (const pluginName of pluginNames) {
    const sourceDirectory = path.join(sourceRoot, pluginName);
    const metadata = readMetadata(sourceDirectory);
    if (!metadata) throw new Error(`Missing plugin metadata: ${sourceDirectory}`);

    const entry = resolveEntry(sourceDirectory, metadata);
    if (!entry) {
      throw new Error(`Missing compiled entry for daemon plugin ${pluginName}`);
    }

    const outputDirectory = path.join(outputRoot, pluginName);
    fs.rmSync(outputDirectory, { recursive: true, force: true });
    fs.mkdirSync(outputDirectory, { recursive: true });

    const entryOutputDirectory = path.join(outputDirectory, "backend");
    copyTree(path.dirname(entry), entryOutputDirectory);
    removeSourceMaps(entryOutputDirectory);

    const packagedMetadata = { ...metadata };
    for (const field of entryFields) delete packagedMetadata[field];
    packagedMetadata.backend = path.posix.join("backend", path.basename(entry));

    fs.writeFileSync(
      path.join(outputDirectory, "plugin.json"),
      `${JSON.stringify(packagedMetadata, null, 2)}\n`,
      "utf8"
    );
  }
}
