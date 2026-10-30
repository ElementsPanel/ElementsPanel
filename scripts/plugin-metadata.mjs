import fs from "node:fs";
import path from "node:path";

export const pluginEntryFields = ["backend", "frontend", "panel", "daemon", "main", "entry", "ui"];
const packageFields = [
  "version",
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

/** Move metadata into package.json and stage entry-only manifests, including legacy sources. */
export function readPluginMetadata(directory) {
  let packageMetadata = readJson(path.join(directory, "package.json"));
  if (!packageMetadata) {
    const parent = path.dirname(directory);
    const rootMetadata = readJson(path.join(parent, "package.json"));
    const { panel, daemon, ...shared } = rootMetadata?.elementspanel ?? {};
    const definition = [panel, daemon].find(
      (side) => side && path.resolve(parent, side.directory) === path.resolve(directory)
    );
    if (definition) {
      const { directory: _directory, folder: _folder, ...sideMetadata } = definition;
      packageMetadata = {
        ...rootMetadata,
        ...(sideMetadata.description === undefined
          ? {}
          : { description: sideMetadata.description }),
        ...(sideMetadata.displayName === undefined
          ? {}
          : { displayName: sideMetadata.displayName }),
        elementspanel: { ...shared, ...sideMetadata }
      };
    }
  }
  packageMetadata ??= {};
  const original =
    readJson(path.join(directory, "plugin.json")) ??
    readJson(path.join(directory, "manifest.json")) ??
    packageMetadata;
  if (!Object.keys(original).length) throw new Error(`Missing plugin metadata: ${directory}`);
  const id = packageMetadata.elementspanel?.id ?? original.id ?? path.basename(directory);
  const manifest = {};
  const metadata = {};
  const elementspanel = {};
  for (const [key, value] of Object.entries(original)) {
    if (pluginEntryFields.includes(key)) manifest[key] = value;
    else if (packageFields.includes(key)) metadata[key] = value;
    else if (key === "name" && original !== packageMetadata) metadata.displayName = value;
    else if (original !== packageMetadata) elementspanel[key] = value;
  }
  return {
    manifest,
    packageMetadata: {
      name: `@elementspanel/epanel-plugin-${id}`,
      ...metadata,
      ...packageMetadata,
      elementspanel: { ...elementspanel, ...packageMetadata.elementspanel, id }
    }
  };
}

export function writePluginMetadata(directory, manifest, packageMetadata) {
  for (const [filename, value] of [
    [
      "plugin.json",
      Object.fromEntries(
        Object.entries(manifest).filter(([key]) => pluginEntryFields.includes(key))
      )
    ],
    ["package.json", packageMetadata]
  ]) {
    fs.writeFileSync(path.join(directory, filename), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
}
