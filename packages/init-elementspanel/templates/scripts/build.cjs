async function buildPluginPackage() {
  const fs = require("node:fs");
  const path = require("node:path");
  const esbuild = require("esbuild");
  const root = path.resolve(__dirname, "..");
  const packageFile = path.join(root, "package.json");
  const metadata = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  const write = (filename, value) =>
    fs.writeFileSync(filename, JSON.stringify(value, null, 2) + "\n");
  const findSource = (directory, candidates) =>
    candidates
      .map((candidate) => path.join(directory, "src", candidate))
      .find((filename) => fs.existsSync(filename));
  const compiledStyles = (directory) => {
    const files = [];
    const visit = (current) => {
      for (const item of fs.readdirSync(current, { withFileTypes: true })) {
        const filename = path.join(current, item.name);
        if (item.isDirectory()) visit(filename);
        else if (item.name.toLowerCase().endsWith(".css")) files.push(filename);
      }
    };
    if (fs.existsSync(directory)) visit(directory);
    return files
      .sort()
      .map((filename) =>
        path.relative(path.dirname(directory), filename).split(path.sep).join("/")
      );
  };
  const sides = ["panel", "daemon"].filter((side) => metadata.elementspanel?.[side]);
  if (!sides.length)
    throw new Error("Plugin package has no panel or daemon side: " + metadata.name);
  if (sides.length === 2 && metadata.elementspanel.dual === undefined)
    metadata.elementspanel.dual = true;
  for (const side of sides) {
    const definition = metadata.elementspanel[side];
    const directory = path.join(root, definition.directory);
    const backend = findSource(directory, [
      "backend/index.ts",
      "backend/index.js",
      "index.ts",
      "index.js"
    ]);
    const frontend =
      side === "panel"
        ? findSource(directory, [
            "frontend.ts",
            "frontend.tsx",
            "frontend.jsx",
            "frontend.js",
            "index.ts",
            "index.tsx",
            "index.jsx",
            "index.js"
          ])
        : undefined;
    if (!backend) throw new Error("Missing backend source for " + metadata.name + "/" + side);
    if (side === "panel" && !frontend)
      throw new Error("Missing frontend source for " + metadata.name + "/panel");
    const pluginFile = path.join(directory, "plugin.json");
    const previous = fs.existsSync(pluginFile)
      ? JSON.parse(fs.readFileSync(pluginFile, "utf8"))
      : {};
    for (const [key, value] of Object.entries(previous)) {
      if (
        [
          "id",
          "version",
          "dual",
          "backend",
          "frontend",
          "panel",
          "daemon",
          "main",
          "entry",
          "ui"
        ].includes(key)
      )
        continue;
      const field = key === "name" ? "displayName" : key;
      if (
        definition[field] === undefined &&
        metadata[field] === undefined &&
        metadata.elementspanel[field] === undefined
      )
        definition[field] = value;
    }
    const manifest = { backend: "backend/index.cjs" };
    const output = path.join(directory, "backend", "index.cjs");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    await esbuild.build({
      entryPoints: [backend],
      outfile: output,
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node22",
      packages: "external",
      sourcemap: false,
      logLevel: "warning"
    });
    if (side === "panel") {
      const { build } = await import("vite");
      const vuePlugin = require("@vitejs/plugin-vue");
      const vueJsxPlugin = require("@vitejs/plugin-vue-jsx");
      const frontendOutput = path.join(directory, "frontend");
      const shared = [
        "vue",
        "vue-router",
        "pinia",
        "vue-i18n",
        "cordis",
        "cosmokit",
        "@vueuse/core",
        "@vueuse/shared",
        "vuetify",
        "vuetify/components",
        "vuetify/iconsets/mdi",
        "@elements-panel/sdk"
      ];
      const imports = new Set();
      await build({
        configFile: false,
        root: directory,
        base: "./",
        publicDir: false,
        plugins: [
          vuePlugin(),
          vueJsxPlugin(),
          {
            name: "elementspanel-public-imports",
            generateBundle(_options, bundle) {
              for (const output of Object.values(bundle)) {
                if (output.type !== "chunk") continue;
                for (const id of [...output.imports, ...output.dynamicImports]) {
                  if (!Object.hasOwn(bundle, id)) imports.add(id);
                }
              }
            }
          }
        ],
        build: {
          outDir: frontendOutput,
          emptyOutDir: true,
          sourcemap: false,
          rollupOptions: {
            input: frontend,
            preserveEntrySignatures: "strict",
            external: (id) => {
              if (shared.includes(id) || id.startsWith("@elementspanel/epanel-plugin-"))
                return true;
              if (id !== "vuetify/styles" && shared.some((name) => id.startsWith(name + "/")))
                throw new Error("Unmapped shared frontend module: " + id);
              return false;
            },
            output: {
              format: "es",
              entryFileNames: "index.js",
              chunkFileNames: "[name]-[hash].js",
              assetFileNames: "assets/[name]-[hash][extname]"
            }
          }
        }
      });
      definition.frontendApi = 1;
      definition.frontendImports = [...imports].sort();
      manifest.frontend = "frontend/index.js";
      const styles = compiledStyles(frontendOutput);
      if (styles.length) definition.styles = styles;
      else delete definition.styles;
    }
    write(pluginFile, manifest);
  }
  write(packageFile, metadata);
  console.log("Built " + metadata.name + "@" + metadata.version);
}

buildPluginPackage().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
