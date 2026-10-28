import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(repository, "npm-packages");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function usage() {
  console.log(`Usage: npm run publish:npm -- [options]

Publishes the prepared packages in npm-packages/ without building the workspace.

Options:
  --dry-run                 Pack each package without publishing it
  --skip-existing           Skip versions already published in the registry
  --skip-version-check      Do not check the registry for existing versions
  --otp <code>              Pass a one-time password to npm publish
  --tag <tag>               Publish with an npm dist-tag (default: latest)
  --registry <url>          Use a different npm registry
`);
}

function parseArgs(argv) {
  const options = { dryRun: false, skipExisting: false, skipVersionCheck: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      usage();
      process.exit(0);
    }
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--skip-existing") options.skipExisting = true;
    else if (argument === "--skip-version-check") options.skipVersionCheck = true;
    else if (["--otp", "--tag", "--registry"].includes(argument)) {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} requires a value.`);
      options[argument.slice(2).replace("-", "")] = value;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (options.skipExisting && options.skipVersionCheck)
    throw new Error("--skip-existing cannot be combined with --skip-version-check.");
  return options;
}

function runNpm(args, { stdio = "inherit", encoding } = {}) {
  const result = spawnSync(npmCommand, args, {
    cwd: repository,
    stdio,
    encoding
  });
  if (result.error) throw result.error;
  return result;
}

async function readPackages() {
  let entries;
  try {
    entries = await fs.readdir(outputRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error("npm-packages/ does not exist. Run npm run package:npm first.");
    throw error;
  }

  const pluginDirectories = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("epanel-plugin-"))
    .map((entry) => entry.name)
    .sort();
  const directories = [...pluginDirectories, "daemon", "panel", "init-elementspanel"];
  const packages = [];
  for (const directory of directories) {
    const packageDirectory = path.join(outputRoot, directory);
    const manifestPath = path.join(packageDirectory, "package.json");
    let manifest;
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    } catch (error) {
      throw new Error(`Cannot read ${manifestPath}: ${error.message}`);
    }
    if (typeof manifest.name !== "string" || typeof manifest.version !== "string")
      throw new Error(`Invalid package metadata in ${manifestPath}.`);
    const expectedName =
      directory.startsWith("epanel-plugin-")
        ? `@elementspanel/${directory}`
        : directory === "init-elementspanel"
        ? "@elementspanel/init"
        : `@elementspanel/${directory}`;
    if (manifest.name !== expectedName) {
      throw new Error(
        `${directory} contains ${manifest.name}@${manifest.version}; expected ${expectedName}. Run npm run package:npm first.`
      );
    }
    packages.push({ directory: packageDirectory, name: manifest.name, version: manifest.version });
  }
  return packages;
}

function registryArgs(options) {
  return options.registry ? ["--registry", options.registry] : [];
}

function isVersionPublished(packageInfo, options) {
  const result = runNpm(
    ["view", `${packageInfo.name}@${packageInfo.version}`, "version", "--json", ...registryArgs(options)],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }
  );
  if (result.status === 0) return true;
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (!/(?:E404|404 Not Found|No match found|is not in this registry)/i.test(output))
    throw new Error(`Could not verify ${packageInfo.name}@${packageInfo.version}: ${output.trim()}`);
  return false;
}

function selectPackagesForPublication(packages, options) {
  const pending = [];
  for (const packageInfo of packages) {
    if (!isVersionPublished(packageInfo, options)) {
      pending.push(packageInfo);
      continue;
    }
    if (!options.skipExisting)
      throw new Error(`${packageInfo.name}@${packageInfo.version} already exists in the registry.`);
    console.log(`Skipping ${packageInfo.name}@${packageInfo.version} (already published).`);
  }
  return pending;
}

function publish(packageInfo, options) {
  const args = ["publish", packageInfo.directory, "--access", "public", ...registryArgs(options)];
  if (options.dryRun) args.push("--dry-run");
  if (options.otp) args.push("--otp", options.otp);
  if (options.tag) args.push("--tag", options.tag);
  console.log(`${options.dryRun ? "Checking" : "Publishing"} ${packageInfo.name}@${packageInfo.version}`);
  const result = runNpm(args);
  if (result.status !== 0) process.exit(result.status || 1);
}

try {
  const options = parseArgs(process.argv.slice(2));
  const packages = await readPackages();
  if (!packages.length) throw new Error("No npm packages found in npm-packages/.");
  if (!options.dryRun) {
    const whoami = runNpm(["whoami", ...registryArgs(options)]);
    if (whoami.status !== 0) process.exit(whoami.status || 1);
  }
  const pending =
    !options.skipVersionCheck && (!options.dryRun || options.skipExisting)
      ? selectPackagesForPublication(packages, options)
      : packages;
  if (!pending.length) console.log("All prepared package versions are already published.");
  for (const packageInfo of pending) publish(packageInfo, options);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
