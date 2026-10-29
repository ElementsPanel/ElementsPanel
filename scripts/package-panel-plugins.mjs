import fs from "node:fs";
import path from "node:path";
import { copyTree } from "./npm-assets.mjs";
import { readPluginMetadata, writePluginMetadata } from "./plugin-metadata.mjs";

const backendFields = ["panel", "backend", "main", "entry"];

function copyDirectory(source, target) {
  if (!fs.existsSync(source)) return;
  copyTree(source, target);
}

function toPosix(value) {
  return value.replaceAll(path.sep, "/").replace(/^\.\//, "");
}

function packageFrontendStyles(styles, pluginName, buildRoot, outputRoot) {
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
      ? [path.join(buildRoot, normalized), path.join(buildRoot, pluginName, relativeStyle)]
      : [path.join(path.dirname(buildRoot), normalized)];
    const source = sourceCandidates.find((candidate) => fs.existsSync(candidate));
    if (!source) throw new Error(`Missing compiled style for plugin ${pluginName}: ${style}`);
    const packagedStylePath = path.join(outputRoot, pluginName, packagedStyle);
    if (!path.resolve(source).startsWith(`${path.resolve(outputRoot, pluginName)}${path.sep}`)) {
      copyTree(source, packagedStylePath);
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

export function packagePanelPlugins({ sourceRoot, buildRoot, outputRoot, pluginNames }) {
  fs.mkdirSync(outputRoot, { recursive: true });

  const frontendManifestPath = path.join(buildRoot, "manifest.json");
  const frontendManifest = fs.existsSync(frontendManifestPath)
    ? JSON.parse(fs.readFileSync(frontendManifestPath, "utf8"))
    : [];

  for (const pluginName of pluginNames) {
    const sourceDirectory = path.join(sourceRoot, pluginName);
    const { manifest: metadata, packageMetadata } = readPluginMetadata(sourceDirectory);

    const outputDirectory = path.join(outputRoot, pluginName);
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
      ? frontendManifest.find((entry) => entry?.assetDirectory === pluginName)
      : null;
    const builtPluginDirectory = path.join(buildRoot, pluginName);
    const entryPath = typeof manifestEntry?.entry === "string" ? toPosix(manifestEntry.entry) : "";
    const builtEntry = path.resolve(buildRoot, entryPath);
    const resolvedBuildRoot = path.resolve(buildRoot);
    const entryParts = entryPath.split("/").filter(Boolean);
    const entryOwner = entryParts.shift();
    const packagedEntry = entryParts.join("/");
    const validBuiltEntry =
      entryOwner &&
      packagedEntry &&
      builtEntry.startsWith(`${resolvedBuildRoot}${path.sep}`) &&
      fs.existsSync(builtEntry) &&
      fs.statSync(builtEntry).isFile();
    if (validBuiltEntry) {
      // Normally the entry owner equals the plugin folder. Copying the actual
      // owner as a fallback also keeps packages valid when a bundler factors an
      // entry into another plugin-owned directory.
      copyDirectory(path.join(buildRoot, entryOwner), outputDirectory);
      if (entryOwner !== pluginName) copyDirectory(builtPluginDirectory, outputDirectory);
      packagedMetadata.frontend = packagedEntry;
      delete packagedMetadata.ui;
      packageMetadata.elementspanel.styles = packageFrontendStyles(
        Array.isArray(manifestEntry.styles) ? manifestEntry.styles : [],
        pluginName,
        buildRoot,
        outputRoot
      );
    } else {
      delete packagedMetadata.frontend;
      delete packagedMetadata.ui;
      delete packageMetadata.elementspanel.styles;
    }

    removeSourceMaps(outputDirectory);

    writePluginMetadata(outputDirectory, packagedMetadata, packageMetadata);
  }
}
