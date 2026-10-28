const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline/promises");
const { registerHooks } = require("node:module");
const metadata = require("./package.json");

const modes = ["full", "panel", "daemon"];

function parseArgs(argv) {
  const options = { mode: undefined, directory: undefined, install: true, yes: false, help: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (["--help", "-h"].includes(argument)) options.help = true;
    else if (["--yes", "-y"].includes(argument)) options.yes = true;
    else if (argument === "--no-install") options.install = false;
    else if (argument === "--template") {
      options.mode = argv[++index];
      if (!modes.includes(options.mode))
        throw new Error("--template must be full, panel or daemon.");
    } else if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    else if (options.directory !== undefined)
      throw new Error("Specify only one project directory.");
    else options.directory = argument;
  }
  return options;
}

function projectManifest(
  directory,
  mode,
  versions = metadata.runtimeVersions || { panel: metadata.version, daemon: metadata.version }
) {
  if (!modes.includes(mode)) throw new Error(`Unknown installation mode: ${mode}`);
  const dependencies = {};
  if (mode !== "daemon") dependencies["@elementspanel/panel"] = versions.panel;
  if (mode !== "panel") dependencies["@elementspanel/daemon"] = versions.daemon;
  const scripts = {
    start:
      mode === "full"
        ? "epanel start --with-daemon"
        : mode === "panel"
        ? "epanel start"
        : "epanel-daemon start"
  };
  if (mode === "full") {
    scripts["start:panel"] = "epanel start";
    scripts["start:daemon"] = "epanel-daemon start";
  }
  return {
    name:
      path
        .basename(directory)
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^[._-]+/, "") || "elementspanel-instance",
    private: true,
    workspaces: ["external/*"],
    scripts: {
      ...scripts,
      setup: "epanel-workspace setup",
      build: "epanel-workspace build",
      pub: "epanel-workspace publish"
    },
    engines: metadata.engines,
    dependencies,
    devDependencies: { [metadata.name]: metadata.version }
  };
}

function installDependencies(directory) {
  return new Promise((resolve, reject) => {
    const npmCLI = process.env.npm_execpath;
    const command =
      npmCLI && /npm(?:-cli)?\.(?:c?js|mjs)$/.test(npmCLI)
        ? { executable: process.execPath, args: [npmCLI, "install", "--no-fund", "--no-audit"] }
        : process.platform === "win32"
        ? {
            executable: process.env.ComSpec || "cmd.exe",
            args: ["/d", "/s", "/c", "npm install --no-fund --no-audit"]
          }
        : { executable: "npm", args: ["install", "--no-fund", "--no-audit"] };
    const child = spawn(command.executable, command.args, {
      cwd: directory,
      stdio: "inherit",
      shell: false
    });
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `npm install failed (${
                signal || code
              }). The project is intact; run npm install in ${directory} to retry.`
            )
          )
    );
  });
}

async function initialize({
  directory,
  mode = "full",
  install = true,
  versions,
  installer = installDependencies
}) {
  const destination = path.resolve(directory);
  // Never replace an existing installation, its data, or a non-empty project.
  let entries;
  try {
    const stat = await fs.lstat(destination);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("The destination must be a regular directory.");
    entries = await fs.readdir(destination);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    entries = [];
  }
  if (entries.some((entry) => entry !== ".git"))
    throw new Error(`The destination is not empty: ${destination}`);
  const manifest = projectManifest(destination, mode, versions);
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(
    path.join(destination, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: "wx" }
  );
  await fs.writeFile(
    path.join(destination, ".gitignore"),
    "node_modules/\npanel/\ndaemon/\nexternal/*/panel/backend/\nexternal/*/panel/frontend/\nexternal/*/daemon/backend/\nexternal/*/daemon/frontend/\n*.log\n",
    { flag: "wx" }
  );
  await fs.writeFile(
    path.join(destination, "README.md"),
    "# ElementsPanel\n",
    { flag: "wx" }
  );
  for (const side of ["panel", "daemon"]) {
    if (mode === "full" || mode === side)
      await fs.mkdir(path.join(destination, side), { recursive: true });
  }
  if (install) await installer(destination);
  return { directory: destination, manifest };
}

async function run(argv = process.argv.slice(2)) {
  let prompt;
  try {
    const options = parseArgs(argv);
    if (options.help) {
      console.log(
        `Usage: npx init-elementspanel@latest [directory] [-- --template full|panel|daemon]\n\n  --yes, -y      Use defaults (my-panel, full installation)\n  --no-install   Generate the project without installing dependencies\n\nUse . as the directory to initialize the current empty folder.\n`
      );
      return;
    }
    if (typeof registerHooks !== "function")
      throw new Error("ElementsPanel requires Node.js 22.15 or newer.");
    const interactive = process.stdin.isTTY && process.stdout.isTTY && !options.yes;
    if (interactive) {
      prompt = createInterface({ input: process.stdin, output: process.stdout });
      if (!options.directory)
        options.directory =
          (await prompt.question("Project directory (my-panel): ")).trim() || "my-panel";
      while (!options.mode) {
        const answer =
          (
            await prompt.question(
              "Installation: 1) panel + daemon  2) panel only  3) daemon only (1): "
            )
          ).trim() || "1";
        options.mode = {
          1: "full",
          2: "panel",
          3: "daemon",
          full: "full",
          panel: "panel",
          daemon: "daemon"
        }[answer];
      }
      prompt.close();
      prompt = undefined;
    }
    const result = await initialize({
      ...options,
      directory: options.directory || "my-panel",
      mode: options.mode || "full"
    });
    console.log(`\nCreated ElementsPanel in ${result.directory}`);
    console.log(
      options.install
        ? "Run npm start in that directory."
        : "Run npm install, then npm start in that directory."
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    prompt?.close();
  }
}

module.exports = { parseArgs, projectManifest, initialize, run };
