import fs from "node:fs";
import path from "node:path";

/** Resolve plugin-local packages normally; use host packages only as a fallback. */
export function frontendDependencyFallback(frontendRoot) {
  const manifest = path.join(frontendRoot, "package.json");
  const dependencies = new Set(
    Object.keys(JSON.parse(fs.readFileSync(manifest, "utf8")).dependencies || {})
  );
  return {
    name: "elements-frontend-dependency-fallback",
    enforce: "post",
    resolveId(source, _importer, options) {
      const name = source.startsWith("@")
        ? source.split("/").slice(0, 2).join("/")
        : source.split("/")[0];
      if (!dependencies.has(name)) return null;
      // Vite's normal resolver has already tried the importing package's own
      // node_modules. Keep browser/exports conditions and avoid resolving twice
      // through this fallback when the host also lacks the requested subpath.
      return this.resolve(source, manifest, { ...options, skipSelf: true });
    }
  };
}
