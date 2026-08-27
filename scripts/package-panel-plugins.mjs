import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "panel", "plugins");
const buildRoot = path.join(root, "frontend", "dist", "plugins");
const outputRoot = path.join(root, "production-code", "web", "plugins");

const metadataFiles = ["plugin.json", "manifest.json", "package.json"];
const backendFields = ["panel", "backend", "main", "entry"];

function readMetadata(directory) {
  for (const file of metadataFiles) {
    const filePath = path.join(directory, file);
    if (!fs.existsSync(filePath)) continue;
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }
  return null;
}

function copyDirectory(source, target) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function toPosix(value) {
  return value.replaceAll(path.sep, "/").replace(/^\.\//, "");
}

function packageFrontendStyles(styles, pluginName) {
  const packagedStyles = [];
  for (const style of styles) {
    if (typeof style !== "string") continue;
    const normalized = toPosix(style);
    const prefix = `${pluginName}/`;
    const relativeStyle = normalized.startsWith(prefix)
      ? normalized.slice(prefix.length)
      : normalized;
    const packagedStyle = relativeStyle.startsWith("frontend/")
      ? relativeStyle
      : path.posix.join("frontend", relativeStyle);
    const sourceCandidates = normalized.startsWith(prefix)
      ? [
          path.join(buildRoot, normalized),
          path.join(buildRoot, pluginName, relativeStyle)
        ]
      : [path.join(root, "frontend", "dist", normalized)];
    const source = sourceCandidates.find((candidate) => fs.existsSync(candidate));
    if (!source) continue;
    const packagedStylePath = path.join(outputRoot, pluginName, packagedStyle);
    if (!path.resolve(source).startsWith(`${path.resolve(outputRoot, pluginName)}${path.sep}`)) {
      fs.mkdirSync(path.dirname(packagedStylePath), { recursive: true });
      fs.copyFileSync(source, packagedStylePath);
    }
    packagedStyles.push(packagedStyle);
  }
  return packagedStyles;
}

function removeSourceMaps(directory) {
  if (!fs.existsSync(directory)) return;
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, item.name);
    if (item.isDirectory()) removeSourceMaps(target);
    else if (item.name.endsWith(".map")) fs.rmSync(target, { force: true });
    else if (item.name.endsWith(".js") || item.name.endsWith(".mjs")) {
      const source = fs.readFileSync(target, "utf8");
      fs.writeFileSync(
        target,
        source.replace(/\n?\/\/[#@] sourceMappingURL=.*$/gm, ""),
        "utf8"
      );
    }
  }
}

if (!fs.existsSync(sourceRoot)) process.exit(0);
fs.mkdirSync(outputRoot, { recursive: true });

const frontendManifestPath = path.join(buildRoot, "manifest.json");
const frontendManifest = fs.existsSync(frontendManifestPath)
  ? JSON.parse(fs.readFileSync(frontendManifestPath, "utf8"))
  : [];

for (const item of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
  if (!item.isDirectory()) continue;
  const sourceDirectory = path.join(sourceRoot, item.name);
  const metadata = readMetadata(sourceDirectory);
  if (!metadata) continue;

  const outputDirectory = path.join(outputRoot, item.name);
  fs.rmSync(outputDirectory, { recursive: true, force: true });
  fs.mkdirSync(outputDirectory, { recursive: true });
  const packagedMetadata = { ...metadata };

  const backendField = backendFields.find(
    (field) => typeof metadata[field] === "string" && metadata[field].length > 0
  );
  if (backendField) {
    const backendEntry = path.resolve(sourceDirectory, metadata[backendField]);
    const sourceDirectoryRoot = path.resolve(sourceDirectory);
    if (
      backendEntry.startsWith(`${sourceDirectoryRoot}${path.sep}`) &&
      fs.existsSync(backendEntry)
    ) {
      copyDirectory(path.dirname(backendEntry), path.join(outputDirectory, "backend"));
      packagedMetadata.backend = path.posix.join("backend", path.basename(backendEntry));
      delete packagedMetadata.panel;
      delete packagedMetadata.main;
      delete packagedMetadata.entry;
    }
  }

  const manifestEntry = Array.isArray(frontendManifest)
    ? frontendManifest.find((entry) => entry?.assetDirectory === item.name)
    : null;
  const builtPluginDirectory = path.join(buildRoot, item.name);
  if (manifestEntry?.entry && fs.existsSync(builtPluginDirectory)) {
    copyDirectory(builtPluginDirectory, outputDirectory);
    const entryPath = toPosix(manifestEntry.entry);
    const pluginPrefix = `${item.name}/`;
    packagedMetadata.frontend = entryPath.startsWith(pluginPrefix)
      ? entryPath.slice(pluginPrefix.length)
      : entryPath;
    delete packagedMetadata.ui;
    packagedMetadata.styles = packageFrontendStyles(
      Array.isArray(manifestEntry.styles) ? manifestEntry.styles : [],
      item.name
    );
  } else {
    delete packagedMetadata.frontend;
    delete packagedMetadata.ui;
    delete packagedMetadata.styles;
  }

  removeSourceMaps(outputDirectory);

  fs.writeFileSync(
    path.join(outputDirectory, "plugin.json"),
    `${JSON.stringify(packagedMetadata, null, 2)}\n`,
    "utf8"
  );
}
