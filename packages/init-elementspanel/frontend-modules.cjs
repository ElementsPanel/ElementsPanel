const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");

/** Stable frontend API compatibility; hash inventories are only used for legacy packages. */
function frontendCompatibilityError(host, plugin, { requireMetadata = false, resolvePlugin } = {}) {
  const runtime = host?.elementspanel;
  const frontend = plugin?.elementspanel?.panel;
  if (frontend?.frontendApi !== undefined) {
    if (frontend.frontendApi !== 1 || runtime?.frontendApi !== frontend.frontendApi)
      return "Unsupported frontend module API.";
    if (!strings(frontend.frontendImports) || !strings(runtime.frontendModules))
      return "Missing frontend module declarations.";
    for (const id of frontend.frontendImports) {
      if (runtime.frontendModules.includes(id)) continue;
      const match = id.match(/^(@elementspanel\/epanel-plugin-[a-z0-9_-]+)(?:\/(.+))?$/);
      if (!match) return `Unsupported frontend module: ${id}`;
      if (resolvePlugin) {
        const provider = resolvePlugin(match[1]);
        const definition = provider?.elementspanel?.panel;
        if (provider?.elementspanel?.id !== match[1].slice("@elementspanel/epanel-plugin-".length) ||
            definition?.frontendApi !== frontend.frontendApi ||
            typeof definition.frontendExports?.[match[2] || "."] !== "string" ||
            !definition.frontendExports[match[2] || "."])
          return `Missing public frontend module: ${id}`;
      }
    }
    return;
  }
  const expected = frontend?.frontendAssets;
  if (expected === undefined && !requireMetadata) return;
  if (!strings(expected) || !strings(runtime?.frontendAssets) ||
      expected.some((file) => !runtime.frontendAssets.includes(file)))
    return "Legacy frontend assets do not match this panel.";
}

module.exports = { frontendCompatibilityError };
