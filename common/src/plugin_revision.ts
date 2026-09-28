import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const cache = new Map<string, { signature: string; revision: string }>();

/** One revision addresses the complete module graph, including CSS and nested chunks. */
export function pluginDirectoryRevision(directory: string): string {
  const files: Array<{ relative: string; absolute: string; stat: fs.Stats }> = [];
  const walk = (root: string) => {
    if (!fs.existsSync(root)) return;
    for (const item of fs
      .readdirSync(root, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(root, item.name);
      if (item.isDirectory()) walk(absolute);
      else if (item.isFile())
        files.push({
          relative: path.relative(directory, absolute),
          absolute,
          stat: fs.statSync(absolute)
        });
    }
  };
  walk(directory);
  const signature = JSON.stringify(
    files.map(({ relative, stat }) => [relative, stat.size, stat.mtimeMs, stat.ctimeMs])
  );
  const previous = cache.get(directory);
  if (previous?.signature === signature) return previous.revision;
  const hash = createHash("sha256");
  for (const file of files)
    hash
      .update(file.relative)
      .update("\0")
      .update(new Uint8Array(fs.readFileSync(file.absolute)))
      .update("\0");
  const revision = hash.digest("hex").slice(0, 24);
  if (cache.size > 1024) cache.clear();
  cache.set(directory, { signature, revision });
  return revision;
}
