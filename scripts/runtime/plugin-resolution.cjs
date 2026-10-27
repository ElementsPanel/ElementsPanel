const fs = require("node:fs");
const path = require("node:path");
const { createRequire, isBuiltin, registerHooks } = require("node:module");
const { fileURLToPath, pathToFileURL } = require("node:url");
const { sharedModules, createSharedResolver } = require("./shared-dependencies.cjs");
const { resolveNpmPlugins } = require("./npm-plugins.cjs");

const shared = new Set(sharedModules);

function resolveFile(filename, context, nextResolve) {
  return nextResolve(
    context.conditions.includes("require") ? filename : pathToFileURL(filename).href,
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
  const npmPlugins = resolveNpmPlugins(packageRoot);
  const roots = [
    path.join(workRoot, "data", "plugins"),
    path.join(workRoot, "plugins"),
    path.join(workRoot, "market_plugins")
  ];
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        isBuiltin(specifier) ||
        /^(?:[./\\]|[a-zA-Z][\w+.-]*:)/.test(specifier) ||
        !context.parentURL?.startsWith("file:")
      ) {
        return nextResolve(specifier, context);
      }
      const parent = fileURLToPath(context.parentURL);
      const npmPlugin = npmPlugins.find((plugin) => within(plugin.packageRoot, parent));
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
        if (context.conditions.includes("import"))
          return nextResolve(specifier, { ...context, parentURL: hostURL });
        return resolveFile(hostRequire.resolve(specifier), context, nextResolve);
      }
      if (failure) throw failure;
      return resolved;
    }
  });
}

module.exports = { installPluginResolution };
