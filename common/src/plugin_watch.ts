import fs from "node:fs";
import path from "node:path";
import {
  npmPluginRoots,
  listNpmPlugins,
  npmPluginOperationPending,
  type NpmPluginSide
} from "./plugin_npm";

/** Poll package boundaries, allowing npm to finish replacing files before reconciliation. */
export function watchNpmPlugins(
  ctx: {
    setInterval(callback: () => void, delay: number): unknown;
    logger: { warn(...args: unknown[]): void };
  },
  side: NpmPluginSide,
  reload: () => Promise<unknown>,
  changed?: () => void
) {
  const stamp = () => {
    const { packageRoot, projectRoot } = npmPluginRoots();
    if (!fs.existsSync(path.join(packageRoot, "package.json"))) return "";
    const files: string[] = [];
    for (const root of [packageRoot, projectRoot])
      for (const name of [
        "package.json",
        "package-lock.json",
        "npm-shrinkwrap.json",
        "node_modules/.package-lock.json"
      ])
        files.push(path.join(root, name));
    for (const plugin of listNpmPlugins(side, { skipInvalid: true }))
      files.push(
        path.join(plugin.packageRoot, "package.json"),
        path.join(plugin.directory, "plugin.json")
      );
    return JSON.stringify(
      files.map((filename) => {
        try {
          const stat = fs.statSync(filename);
          return [filename, stat.size, stat.mtimeMs, stat.ctimeMs];
        } catch {
          return [filename, null];
        }
      })
    );
  };
  let applied = stamp();
  let candidate = applied;
  let busy = false;
  ctx.setInterval(() => {
    if (busy || npmPluginOperationPending()) return;
    try {
      const next = stamp();
      if (next === applied) {
        candidate = next;
        return;
      }
      if (next !== candidate) {
        candidate = next;
        return;
      }
      busy = true;
      void reload()
        .then(() => {
          applied = next;
          candidate = next;
          changed?.();
        })
        .catch((error) => ctx.logger.warn("Failed to synchronize npm plugins", error))
        .finally(() => {
          busy = false;
        });
    } catch (error) {
      ctx.logger.warn("Failed to inspect npm plugins", error);
    }
  }, 2000);
}
