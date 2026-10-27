import fs from "node:fs";
import path from "node:path";

// Use the same checks while staging plugins and copying final package assets.
// In particular, never follow links while stripping a staged plugin's source maps.
export function copyTree(source, target) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`Packages must not contain symlinks: ${source}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      if (
        [
          "node_modules",
          "src",
          "data",
          "logs",
          ".market-install.json",
          "plugin-overrides.json"
        ].includes(entry)
      ) {
        throw new Error(
          `Unexpected runtime data or source in a release asset: ${path.join(source, entry)}`
        );
      }
      copyTree(path.join(source, entry), path.join(target, entry));
    }
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    fs.chmodSync(target, stat.mode & 0o777);
  } else throw new Error(`Unsupported release asset: ${source}`);
}
