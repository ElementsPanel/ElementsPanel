const fs = require("node:fs");
const path = require("node:path");
const { createRequire, isBuiltin, registerHooks } = require("node:module");
const { fileURLToPath, pathToFileURL } = require("node:url");
const { sharedModules, createSharedResolver } = require("./shared-dependencies.cjs");
const { resolveNpmPlugins, projectManifestFile } = require("./npm-plugins.cjs");

const shared = new Set(sharedModules);

/**
 * The plugin market installs dependencies into the project while the process is
 * running. Caching the npm plugin list by the project manifest's mtime lets a
 * freshly installed package be resolved without restarting the process.
 */
let npmPluginSnapshot = { key: "", records: [], expires: 0 };

function fileStamp(filename) {
  try {
    const stat = fs.statSync(filename);
    return `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  } catch {
    return "-";
  }
}

function npmPlugins(packageRoot) {
  const files = [];
  const projectFile = projectManifestFile(packageRoot);
  for (const root of [packageRoot, ...(projectFile ? [path.dirname(projectFile)] : [])]) {
    for (const filename of [
      "package.json",
      "package-lock.json",
      "npm-shrinkwrap.json",
      "node_modules/.package-lock.json",
      "node_modules"
    ])
      files.push(path.join(root, filename));
  }
  // Paths are part of the key: two fixtures created within the same millisecond
  // must not share a cached plugin list.
  const key = files.map((file) => `${file}:${fileStamp(file)}`).join("|");
  if (key !== npmPluginSnapshot.key || Date.now() >= npmPluginSnapshot.expires) {
    npmPluginSnapshot = {
      key,
      expires: Date.now() + 2000,
      records: resolveNpmPlugins(packageRoot, undefined, { skipInvalid: true })
    };
  }
  return npmPluginSnapshot.records;
}

function resolveFile(filename, context, nextResolve) {
  // Node.js versions expose hook conditions as either an array or a Set.
  return nextResolve(
    Array.from(context.conditions).includes("require") ? filename : pathToFileURL(filename).href,
    context
  );
}

function within(root, filename) {
  const relative = path.relative(root, filename);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

/** Apply to CJS and ESM plugins, without relying on hoisting or changing NODE_PATH. */
function installPluginResolution(packageRoot, workRoot) {
  const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  const hostPackages = new Set(Object.keys(metadata.dependencies || {}));
  const hostURL = pathToFileURL(path.join(packageRoot, "app.js")).href;
  const hostRequire = createRequire(hostURL);
  const resolveShared = createSharedResolver(packageRoot);
  // Development checkouts load unified source packages from <project>/plugins; a
  // published runtime loads npm plugins only and has no source root.
  const roots = process.env.EPANEL_PACKAGE_ROOT
    ? []
    : [
        path.basename(path.dirname(packageRoot)) === "core"
          ? path.resolve(packageRoot, "../../plugins")
          : path.join(workRoot, "plugins")
      ];
  // Node 24 routes require.resolve() calls made by this hook back through the
  // hook itself. Without this guard, resolving plugin metadata recurses forever.
  let resolving = false;
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        isBuiltin(specifier) ||
        /^(?:[./\\]|[a-zA-Z][\w+.-]*:)/.test(specifier) ||
        !context.parentURL?.startsWith("file:") ||
        resolving
      ) {
        return nextResolve(specifier, context);
      }
      resolving = true;
      try {
        const parent = fileURLToPath(context.parentURL);
        const plugins = npmPlugins(packageRoot);
        const npmPlugin = plugins.find((plugin) => within(plugin.packageRoot, parent));
        const root = roots.find((directory) => within(directory, parent));
        if (!npmPlugin && !root) return nextResolve(specifier, context);
        const plugin =
          npmPlugin?.packageRoot || path.join(root, path.relative(root, parent).split(path.sep)[0]);
        const name = specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2).join("/")
          : specifier.split("/")[0];
        // Explicit CJS filenames keep ESM plugins on the same Context/Service
        // classes as the CJS host, instead of selecting the second "import" build.
        if (shared.has(name)) return resolveFile(resolveShared(specifier), context, nextResolve);

        let resolved;
        let failure;
        try {
          resolved = nextResolve(specifier, context);
        } catch (error) {
          if (!["MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND"].includes(error.code)) throw error;
          failure = error;
        }
        // A plugin's private dependencies take precedence over ordinary host dependencies.
        if (
          resolved?.url.startsWith("file:") &&
          (within(plugin, fileURLToPath(resolved.url)) || npmPlugin?.dependencies.includes(name))
        )
          return resolved;
        if (hostPackages.has(name)) {
          if (Array.from(context.conditions).includes("import"))
            return nextResolve(specifier, { ...context, parentURL: hostURL });
          return resolveFile(hostRequire.resolve(specifier), context, nextResolve);
        }
        if (failure) throw failure;
        return resolved;
      } finally {
        resolving = false;
      }
    }
  });
}

module.exports = { installPluginResolution };
