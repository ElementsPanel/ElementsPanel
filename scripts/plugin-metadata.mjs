import fs from "node:fs";
import path from "node:path";

const manifestFields = [
  "id",
  "version",
  "dual",
  "backend",
  "frontend",
  "panel",
  "daemon",
  "main",
  "entry",
  "ui"
];
const packageFields = [
  "displayName",
  "description",
  "author",
  "contributors",
  "license",
  "repository",
  "homepage",
  "keywords",
  "changelog"
];

function readJson(filename) {
  if (!fs.existsSync(filename)) return null;
  if (!fs.lstatSync(filename).isFile())
    throw new Error(`Plugin metadata must be a regular file: ${filename}`);
  const value = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Plugin metadata must be an object: ${filename}`);
  return value;
}

/** Stage metadata separately from identity/entries, including legacy source manifests. */
export function readPluginMetadata(directory) {
  const packageMetadata = readJson(path.join(directory, "package.json")) ?? {};
  const original =
    readJson(path.join(directory, "plugin.json")) ??
    readJson(path.join(directory, "manifest.json")) ??
    packageMetadata;
  if (!Object.keys(original).length) throw new Error(`Missing plugin metadata: ${directory}`);
  if (packageMetadata.version && original.version && packageMetadata.version !== original.version)
    throw new Error(`Plugin package and manifest versions differ: ${directory}`);
  const manifest = {};
  const metadata = {};
  const elementspanel = {};
  for (const [key, value] of Object.entries(original)) {
    if (manifestFields.includes(key)) manifest[key] = value;
    else if (packageFields.includes(key)) metadata[key] = value;
    else if (key === "name" && original !== packageMetadata) metadata.displayName = value;
    else if (original !== packageMetadata) elementspanel[key] = value;
  }
  return {
    manifest,
    packageMetadata: {
      name: `@elementspanel/epanel-plugin-${manifest.id ?? path.basename(directory)}`,
      ...metadata,
      ...packageMetadata,
      ...(manifest.version === undefined ? {} : { version: manifest.version }),
      elementspanel: { ...elementspanel, ...packageMetadata.elementspanel }
    }
  };
}

export function writePluginMetadata(directory, manifest, packageMetadata) {
  for (const [filename, value] of [
    ["plugin.json", manifest],
    ["package.json", packageMetadata]
  ]) {
    fs.writeFileSync(path.join(directory, filename), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
}
