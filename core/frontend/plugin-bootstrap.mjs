/** Shared by the classic page bootstrap and later plugin refreshes. */
export function parseFrontendManifest(body, baseURI) {
  const manifest = Array.isArray(body) ? body : body?.data;
  if (!Array.isArray(manifest)) throw new Error("Invalid panel plugin manifest.");
  const manifestUrl = new URL("plugins/manifest.json", baseURI);
  const toUrl = (value) => new URL(value, manifestUrl).href;
  const result = [];
  const ids = new Set();
  for (const item of manifest) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const value = item.metadata || item;
    const id = typeof value.id === "string" ? value.id.trim() : "";
    const entry = typeof item.entry === "string" ? item.entry : "";
    if (!id || value.enabled === false || !entry || ids.has(id)) continue;
    ids.add(id);
    const entryUrl = toUrl(entry);
    const exports = {};
    const modulePrefix = `@elementspanel/epanel-plugin-${id}`;
    for (const [specifier, file] of Object.entries(item.exports || {})) {
      if (typeof file !== "string" ||
          (specifier !== modulePrefix && !specifier.startsWith(`${modulePrefix}/`)))
        throw new Error(`Invalid public module in plugin ${id}: ${specifier}`);
      const url = new URL(toUrl(file));
      const directory = new URL("./", entryUrl);
      if (url.origin !== directory.origin || !url.pathname.startsWith(directory.pathname))
        throw new Error(`Public module escapes plugin ${id}: ${specifier}`);
      exports[specifier] = url.href;
    }
    result.push({
      metadata: { ...value, id },
      directory: typeof item.directory === "string" ? item.directory : id,
      assetDirectory: typeof item.assetDirectory === "string" ? item.assetDirectory : id,
      entry: entryUrl,
      exports,
      revision: typeof item.revision === "string" ? item.revision : String(value.version || ""),
      styles: Array.isArray(item.styles)
        ? item.styles.filter((style) => typeof style === "string").map(toUrl)
        : []
    });
  }
  return result;
}

// Serialized into a classic inline script: this function and its parser must
// have no imports or closure dependencies. No ESM may start before it finishes.
async function bootstrapFrontend(hostImports, parseManifest) {
  try {
    const manifestUrl = new URL("plugins/manifest.json", document.baseURI);
    const response = await fetch(manifestUrl.href, { cache: "no-store" });
    if (!response.ok && response.status !== 404)
      throw new Error(`Failed to load panel plugin manifest: HTTP ${response.status}`);
    const manifest = response.status === 404 ? [] : await response.json();
    const plugins = parseManifest(manifest, document.baseURI);
    const imports = { ...hostImports };
    for (const plugin of plugins) Object.assign(imports, plugin.exports);

    // Use this exact discovery snapshot for the first plugin load. A second
    // request could select newer revisions than those recorded in the map.
    window.ElementsPanelBootstrap = { manifest, imports };
    const map = document.createElement("script");
    map.type = "importmap";
    map.textContent = JSON.stringify({ imports });
    document.head.appendChild(map);

    // Restore preloads and module scripts only after the one complete map has
    // been installed. This also works in browsers without multiple import maps.
    for (const link of document.querySelectorAll('link[rel="elementspanel-modulepreload"]'))
      link.rel = "modulepreload";
    for (const placeholder of document.querySelectorAll('script[type="text/elementspanel-module"]')) {
      const script = document.createElement("script");
      for (const attribute of placeholder.attributes) script.setAttribute(attribute.name, attribute.value);
      script.type = "module";
      script.async = false;
      script.textContent = placeholder.textContent;
      placeholder.replaceWith(script);
    }
  } catch (error) {
    console.error("Plugin startup failed:", error);
    window.setAppLoadingError?.(error instanceof Error ? error.message : String(error));
  }
}

/** Vite has already generated the HTML; keep its entries inert until discovery. */
export function renderFrontendBootstrap(html, imports) {
  const deferred = html
    .replace(/<script\b([^>]*)>/gi, (tag, attributes) =>
      /\btype\s*=\s*(["'])module\1/i.test(attributes)
        ? tag.replace(/\btype\s*=\s*(["'])module\1/i, 'type="text/elementspanel-module"')
        : tag)
    .replace(/<link\b([^>]*)>/gi, (tag, attributes) =>
      /\brel\s*=\s*(["'])modulepreload\1/i.test(attributes)
        ? tag.replace(/\brel\s*=\s*(["'])modulepreload\1/i, 'rel="elementspanel-modulepreload"')
        : tag);
  const payload = JSON.stringify(imports).replace(/</g, "\\u003c");
  const script = `<script>(${bootstrapFrontend.toString()})(${payload}, ${parseFrontendManifest.toString()});</script>`;
  // Run after the loading/error UI and every deferred module tag have parsed.
  return /<\/body\s*>/i.test(deferred)
    ? deferred.replace(/<\/body\s*>/i, () => `${script}\n</body>`)
    : `${deferred}\n${script}`;
}
