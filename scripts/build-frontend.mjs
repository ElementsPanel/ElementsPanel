import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import layout from "./workspace-layout.cjs";
import { builtinPluginConfig } from "../core/frontend/plugin-build.config.mjs";
import { readPluginMetadata } from "./plugin-metadata.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = path.join(repository, "core/frontend");
const require = createRequire(path.join(frontendRoot, "package.json"));
const vite = await import(require.resolve("vite"));
const build = vite.build || vite.default.build;

// Keep plugin compilation out of the host graph. Changes to one plugin cannot
// rename files in the host or in another plugin's output directory.
await build({ root: frontendRoot, configFile: path.join(frontendRoot, "vite.config.ts") });
const outputRoot = path.join(frontendRoot, "dist/plugins");
const manifest = [];
for (const plugin of layout.sourcePlugins("panel", repository)) {
  const config = builtinPluginConfig(plugin, outputRoot);
  if (!config) continue;
  await build(config);
  const result = JSON.parse(await fs.readFile(path.join(outputRoot, plugin.folder, "manifest.json"), "utf8"));
  const toPath = (filename) => `./${plugin.folder}/${filename}`;
  const { packageMetadata } = readPluginMetadata(plugin.directory);
  manifest.push({
    metadata: {
      id: plugin.id,
      version: packageMetadata.version,
      ...Object.fromEntries(["elements", "priority", "frontendInject", "frontendImmediate", "frontendRequired"]
        .filter((key) => packageMetadata.elementspanel[key] !== undefined)
        .map((key) => [key, packageMetadata.elementspanel[key]])),
      frontendApi: result.frontendApi,
      frontendImports: result.imports
    },
    directory: plugin.id,
    assetDirectory: plugin.folder,
    entry: toPath(result.entry),
    styles: result.styles.map(toPath),
    exports: Object.fromEntries(Object.entries(result.exports).map(([name, entry]) => [name, toPath(entry)])),
    imports: result.imports,
    frontendApi: result.frontendApi
  });
}
await fs.mkdir(outputRoot, { recursive: true });
await fs.writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
