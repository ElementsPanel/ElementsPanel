import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharedDependencies from "./runtime/shared-dependencies.cjs";
import { pluginEntryFields, readPluginMetadata } from "./plugin-metadata.mjs";
import layout from "./workspace-layout.cjs";
import { copyTree } from "./npm-assets.mjs";
import { packagePanelPlugins } from "./package-panel-plugins.mjs";
import { packageDaemonPlugins } from "./package-daemon-plugins.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (filename) => JSON.parse(await fs.readFile(filename, "utf8"));
const exists = async (filename) =>
  fs.lstat(filename).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  );

export function runtimeManifest(side, source) {
  const metadata = {};
  for (const key of [
    "version",
    "description",
    "homepage",
    "author",
    "contributors",
    "license",
    "repository",
    "daemonVersion"
  ]) {
    if (source[key] !== undefined) metadata[key] = source[key];
  }
  metadata.name = `@elementspanel/${side}`;
  metadata.bin = { [side === "panel" ? "epanel" : "epanel-daemon"]: `bin/${side}.cjs` };
  metadata.files = ["app.js", "app.js.map", "bin/", "runtime/", "README.md", "LICENSE"];
  if (side === "daemon") metadata.files.splice(4, 0, "licenses/");
  if (side === "panel") metadata.files.splice(4, 0, "public/");
  metadata.engines = { node: ">=22.15.0" };
  metadata.publishConfig = { access: "public" };
  metadata.dependencies = { ...source.dependencies };
  for (const [name, version] of Object.entries(metadata.dependencies)) {
    if (/^(?:file:|link:|workspace:)/.test(version))
      throw new Error(`Runtime dependency ${name} is not publishable: ${version}`);
  }
  return metadata;
}

async function verifyPlugin(directory) {
  const manifest = await readJson(path.join(directory, "plugin.json"));
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    Object.keys(manifest).some((key) => !pluginEntryFields.includes(key))
  )
    throw new Error(`Plugin manifest must contain only execution entries: ${directory}`);
  for (const key of pluginEntryFields) {
    const entry = manifest[key];
    if (entry === undefined) continue;
    if (typeof entry !== "string" || !entry.trim())
      throw new Error(`Invalid published plugin entry: ${directory}/${key}`);
    const resolved = path.resolve(directory, entry);
    const relative = path.relative(directory, resolved);
    if (
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative) ||
      /\.[cm]?tsx?$/.test(entry)
    ) {
      throw new Error(`Invalid published plugin entry: ${resolved}`);
    }
    if (!(await fs.stat(resolved)).isFile())
      throw new Error(`Missing compiled plugin entry: ${resolved}`);
  }
  return manifest;
}

async function packageBuiltinPlugins(sourceRoot, outputRoot, stagingRoot) {
  const plugins = new Map();
  const hosts = {};
  for (const side of ["panel", "daemon"]) {
    hosts[side] = await readJson(path.join(layout.coreDirectory(side), "package.json"));
    const sources = layout.sourcePlugins(side);
    const pluginNames = sources.map((plugin) => plugin.folder);
    const pluginDirectories = Object.fromEntries(
      sources.map((plugin) => [
        plugin.folder,
        path.join(sourceRoot, path.relative(repository, plugin.directory))
      ])
    );
    const pluginOutput = path.join(stagingRoot, side);
    const packagePlugins = side === "panel" ? packagePanelPlugins : packageDaemonPlugins;
    packagePlugins({
      buildRoot: path.join(sourceRoot, "core/frontend/dist/plugins"),
      outputRoot: pluginOutput,
      pluginNames,
      pluginDirectories
    });
    for (const folder of pluginNames) {
      const directory = path.join(pluginOutput, folder);
      const manifest = await verifyPlugin(directory);
      const packageMetadata = await readJson(path.join(directory, "package.json"));
      const source = sources.find((plugin) => plugin.folder === folder);
      const { manifest: expected, packageMetadata: expectedPackage } = readPluginMetadata(
        source.directory
      );
      const id = packageMetadata.elementspanel.id;
      const version = packageMetadata.version;
      if (id !== expectedPackage.elementspanel.id || version !== expectedPackage.version)
        throw new Error(`Unexpected plugin identity or version: ${directory}`);
      if (!/^[a-z][a-z0-9_-]{1,63}$/.test(id) || typeof version !== "string")
        throw new Error(`Invalid npm plugin metadata: ${directory}`);
      for (const field of ["backend", "frontend"]) {
        if (typeof expected[field] === "string" && typeof manifest[field] !== "string")
          throw new Error(`Missing compiled ${field} for plugin ${id}`);
      }
      let plugin = plugins.get(id);
      if (!plugin) {
        plugin = {
          id,
          name: packageMetadata.name,
          version,
          metadata: packageMetadata,
          description: packageMetadata.description || `ElementsPanel ${id} plugin`,
          sides: {}
        };
        plugins.set(id, plugin);
      }
      if (plugin.version !== version || plugin.name !== packageMetadata.name)
        throw new Error(
          `Both sides of npm plugin ${id} must have the same package name and version.`
        );
      if (plugin.sides[side]) throw new Error(`Duplicate ${side} plugin id: ${id}`);
      plugin.sides[side] = { directory, folder, metadata: packageMetadata };
    }
  }
  const result = [];
  for (const plugin of [...plugins.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const directory = path.join(outputRoot, `epanel-plugin-${plugin.id}`);
    const sides = Object.keys(plugin.sides);
    const owner = hosts[sides[0]];
    const metadata = {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      license: owner.license,
      author: owner.author,
      repository: owner.repository,
      engines: { node: ">=22.15.0" },
      publishConfig: { access: "public" },
      files: [...sides.map((side) => `${side}/`), "README.md", "LICENSE"],
      exports: { "./package.json": "./package.json" },
      elementspanel: {
        ...Object.fromEntries(
          ["category", "changelog"]
            .filter((field) => plugin.metadata.elementspanel[field] !== undefined)
            .map((field) => [field, plugin.metadata.elementspanel[field]])
        ),
        id: plugin.id,
        ...(sides.length === 2 ? { dual: true } : {})
      },
      // Plugin bundles use the host's shared runtime imports. Optional peers
      // let a dual plugin be installed on a machine running only one side.
      peerDependencies: {},
      peerDependenciesMeta: {}
    };
    for (const field of [
      "description",
      "displayName",
      "homepage",
      "author",
      "contributors",
      "license",
      "repository",
      "keywords",
      "changelog"
    ]) {
      if (plugin.metadata[field] !== undefined) metadata[field] = plugin.metadata[field];
    }
    for (const side of sides) {
      const source = plugin.sides[side];
      copyTree(source.directory, path.join(directory, side));
      // One package.json describes the npm package and both halves. The side
      // plugin.json files contain only execution entry points.
      await fs.unlink(path.join(directory, side, "package.json"));
      const { id: _id, dual: _dual, ...sideMetadata } = source.metadata.elementspanel;
      metadata.elementspanel[side] = {
        ...sideMetadata,
        ...(source.metadata.displayName === undefined
          ? {}
          : { displayName: source.metadata.displayName }),
        ...(source.metadata.description === undefined
          ? {}
          : { description: source.metadata.description }),
        directory: side,
        folder: source.folder
      };
      metadata.exports[`./${side}/plugin.json`] = `./${side}/plugin.json`;
      metadata.peerDependencies[`@elementspanel/${side}`] = hosts[side].version;
      metadata.peerDependenciesMeta[`@elementspanel/${side}`] = { optional: true };
    }
    await fs.writeFile(
      path.join(directory, "package.json"),
      `${JSON.stringify(metadata, null, 2)}\n`
    );
    copyTree(path.join(repository, "LICENSE"), path.join(directory, "LICENSE"));
    await fs.writeFile(path.join(directory, "README.md"), `# epanel-plugin-${plugin.id}\n`);
    result.push(metadata);
  }
  return result;
}

async function packageRuntime(side, sourceRoot, outputRoot, plugins) {
  const source = path.join(layout.coreDirectory(side, sourceRoot), "production");
  const output = path.join(outputRoot, side);
  const metadata = runtimeManifest(
    side,
    await readJson(path.join(layout.coreDirectory(side), "package.json"))
  );
  metadata.elementspanel = { side, plugins: {} };
  for (const plugin of plugins) {
    if (!plugin.elementspanel[side]) continue;
    metadata.dependencies[plugin.name] = plugin.version;
    metadata.elementspanel.plugins[plugin.elementspanel.id] = plugin.name;
  }
  const resolveShared = sharedDependencies.createSharedResolver(layout.coreDirectory(side));
  // Webpack leaves these imports external. Declare them directly, with the
  // versions from the same graph used to build the host, so npm need not hoist them.
  for (const name of sharedDependencies.sharedModules) {
    metadata.dependencies[name] = (await readJson(resolveShared(`${name}/package.json`))).version;
  }
  await fs.mkdir(output, { recursive: true });
  copyTree(path.join(source, "app.js"), path.join(output, "app.js"));
  if (await exists(path.join(source, "app.js.map")))
    copyTree(path.join(source, "app.js.map"), path.join(output, "app.js.map"));
  copyTree(path.join(repository, "scripts/runtime"), path.join(output, "runtime"));
  await fs.mkdir(path.join(output, "bin"));
  await fs.writeFile(
    path.join(output, `bin/${side}.cjs`),
    `#!/usr/bin/env node\nrequire('../runtime/cli.cjs').run('${side}', require('node:path').resolve(__dirname, '..'));\n`,
    { mode: 0o755 }
  );

  if (side === "panel") {
    const frontend = path.join(sourceRoot, "core/frontend/dist");
    await fs.stat(path.join(frontend, "index.html"));
    await fs.mkdir(path.join(output, "public"));
    for (const item of await fs.readdir(frontend)) {
      if (["plugins", "upload_files"].includes(item)) continue;
      copyTree(path.join(frontend, item), path.join(output, "public", item));
    }
  } else {
    const licenses = ["7z-extra-license.txt", "7z-unix-license.txt"];
    await fs.mkdir(path.join(output, "licenses"));
    for (const name of licenses)
      copyTree(
        path.join(repository, "scripts/licenses", name),
        path.join(output, "licenses", name)
      );
  }
  await fs.writeFile(path.join(output, "package.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  copyTree(path.join(repository, "LICENSE"), path.join(output, "LICENSE"));
  await fs.writeFile(
    path.join(output, "README.md"),
    `# ${
      metadata.name
    }\n\nRequires Node.js 22.15+.\n\nInitialize a project with \`npx @elementspanel/init@latest my-panel\`, then run \`npm start\`. For an existing npm project, run \`npx ${
      side === "panel" ? "epanel" : "epanel-daemon"
    } start\`. Runtime data is stored in \`./${side}\`. Use \`--cwd\` or \`--${side}-dir\` to select another location.\n\n${
      side === "panel"
        ? "Install @elementspanel/daemon and use --with-daemon to start a local daemon."
        : "PTY and archive tools are downloaded to ./daemon/lib on first start."
    }\n`
  );
  return metadata;
}

export async function packageNpm({
  sourceRoot = repository,
  outputRoot = path.join(repository, "npm-packages")
} = {}) {
  sourceRoot = path.resolve(sourceRoot);
  outputRoot = path.resolve(outputRoot);
  await fs.mkdir(path.dirname(outputRoot), { recursive: true });
  const temporary = await fs.mkdtemp(path.join(path.dirname(outputRoot), ".elementspanel-npm-"));
  try {
    const packages = path.join(temporary, "packages");
    const plugins = await packageBuiltinPlugins(
      sourceRoot,
      packages,
      path.join(temporary, "plugins")
    );
    const panel = await packageRuntime("panel", sourceRoot, packages, plugins);
    const daemon = await packageRuntime("daemon", sourceRoot, packages, plugins);
    const createSource = path.join(repository, "packages/init-elementspanel");
    const createOutput = path.join(packages, "init-elementspanel");
    await fs.mkdir(createOutput);
    const create = await readJson(path.join(createSource, "package.json"));
    create.runtimeVersions = { panel: panel.version, daemon: daemon.version };
    for (const filename of ["bin.cjs", "index.cjs", "i18n.cjs", "select.cjs", "workspace.cjs"])
      copyTree(path.join(createSource, filename), path.join(createOutput, filename));
    await fs.chmod(path.join(createOutput, "bin.cjs"), 0o755);
    await fs.chmod(path.join(createOutput, "workspace.cjs"), 0o755);
    copyTree(path.join(repository, "LICENSE"), path.join(createOutput, "LICENSE"));
    await fs.writeFile(
      path.join(createOutput, "package.json"),
      `${JSON.stringify(create, null, 2)}\n`
    );
    await fs.rm(outputRoot, { recursive: true, force: true });
    await fs.rename(packages, outputRoot);
    return { panel, daemon, create, plugins };
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    for (let index = 2; index < process.argv.length; index++) {
      const argument = process.argv[index];
      if (!["--source", "--out"].includes(argument) || !process.argv[index + 1])
        throw new Error(
          "Usage: node scripts/package-npm.mjs [--source workspace-directory] [--out npm-packages]"
        );
      options[argument === "--source" ? "sourceRoot" : "outputRoot"] = process.argv[++index];
    }
    await packageNpm(options);
    console.log(
      `npm packages prepared in ${path.resolve(
        options.outputRoot || path.join(repository, "npm-packages")
      )}`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
