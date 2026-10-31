const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");
const { registerHooks } = require("node:module");
const { promisify } = require("node:util");
const metadata = require("./package.json");
const { createTranslator, normalizeLanguage } = require("./i18n.cjs");
const { selectMenu, textPrompt } = require("./select.cjs");

const modes = ["full", "panel", "daemon"];
const defaultPorts = { panel: 23333, daemon: 24444 };
const execFileAsync = promisify(execFile);

function parsePort(value, side, language) {
  const t = createTranslator(language);
  const port = /^\d+$/.test(String(value)) ? Number(value) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(t("portInvalid", { side }));
  return port;
}

function parseArgs(argv) {
  const languageIndex = argv.lastIndexOf("--language");
  const language = languageIndex < 0 ? undefined : normalizeLanguage(argv[languageIndex + 1]);
  const t = createTranslator(language);
  if (languageIndex >= 0 && !language) throw new Error(t("languageInvalid"));
  const options = {
    language,
    mode: undefined,
    directory: undefined,
    panelPort: undefined,
    daemonPort: undefined,
    install: undefined,
    yes: false,
    help: false
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (["--help", "-h"].includes(argument)) options.help = true;
    else if (["--yes", "-y"].includes(argument)) options.yes = true;
    else if (argument === "--language") {
      options.language = normalizeLanguage(argv[++index]);
      if (!options.language) throw new Error(t("languageInvalid"));
    } else if (argument === "--install") options.install = true;
    else if (argument === "--no-install") options.install = false;
    else if (["--panel-port", "--daemon-port"].includes(argument)) {
      const side = argument === "--panel-port" ? "panel" : "daemon";
      options[`${side}Port`] = parsePort(argv[++index], side, language);
    } else if (argument === "--template") {
      options.mode = argv[++index];
      if (!modes.includes(options.mode)) throw new Error(t("templateInvalid"));
    } else if (argument.startsWith("-")) throw new Error(t("optionUnknown", { argument }));
    else if (options.directory !== undefined) throw new Error(t("singleDirectory"));
    else options.directory = argument;
  }
  return options;
}

function detectSystemLanguage() {
  const languages = {
    en: "en_us",
    ja: "ja_jp",
    es: "es_es",
    fr: "fr_fr",
    ru: "ru_ru",
    ko: "ko_kr",
    de: "de_de",
    pt: "pt_br",
    th: "th_th",
    tr: "tr_tr"
  };
  const candidates = [
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
    process.env.LANG,
    process.env.LANGUAGE
  ];
  try {
    candidates.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // Keep the English fallback when the system locale cannot be resolved.
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const locale of candidate.split(":")) {
      const parts = locale.trim().split(/[.:@]/, 1)[0].replace(/-/g, "_").toLowerCase().split("_");
      if (parts[0] === "zh")
        return parts.some((part) => ["tw", "hk", "mo", "hant"].includes(part)) ? "zh_tw" : "zh_cn";
      if (Object.hasOwn(languages, parts[0])) return languages[parts[0]];
    }
  }
  return "en_us";
}

async function validateDestination(directory, language) {
  const t = createTranslator(language);
  const destination = path.resolve(directory);
  // Never replace an existing installation, its data, or a non-empty project.
  let entries;
  try {
    const stat = await fs.lstat(destination);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(t("directoryInvalid"));
    entries = await fs.readdir(destination);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    entries = [];
  }
  if (entries.some((entry) => entry !== ".git"))
    throw new Error(t("directoryNotEmpty", { directory: destination }));
  return destination;
}

function validatePorts(mode, panelPort, daemonPort, language) {
  const t = createTranslator(language);
  const ports = {
    panel: parsePort(panelPort ?? defaultPorts.panel, "panel", language),
    daemon: parsePort(daemonPort ?? defaultPorts.daemon, "daemon", language)
  };
  if (mode === "full" && ports.panel === ports.daemon) throw new Error(t("portsConflict"));
  return ports;
}

function modeChoices(t) {
  return [
    { value: "full", label: t("modeFull") },
    { value: "panel", label: t("modePanel") },
    { value: "daemon", label: t("modeDaemon") }
  ];
}

async function promptOptions(options, prompt) {
  const useMenu = typeof prompt.select === "function";
  options.language = options.language ?? (detectSystemLanguage().startsWith("zh") ? "zh" : "en");
  const t = createTranslator(options.language);
  if (options.directory !== undefined)
    await validateDestination(options.directory, options.language);
  while (options.directory === undefined) {
    const input = useMenu
      ? await prompt.text({ title: t("directoryTitle"), placeholder: "my-panel" })
      : undefined;
    const answer = (input ? input.value : await prompt.question(t("directoryPrompt"))).trim();
    try {
      options.directory = await validateDestination(answer || "my-panel", options.language);
      input?.mark("done", options.directory);
    } catch (error) {
      input?.mark("error", answer || "my-panel");
      console.error(error.message);
    }
  }
  const choices = {
    1: "full",
    2: "panel",
    3: "daemon",
    full: "full",
    panel: "panel",
    daemon: "daemon"
  };
  if (useMenu && !options.mode) {
    const t = createTranslator(options.language);
    options.mode = await prompt.select({
      title: t("modeTitle"),
      options: modeChoices(t),
      hint: t("selectHint"),
      defaultIndex: 0
    });
  }
  while (!options.mode) {
    const answer = (await prompt.question(t("modePrompt"))).trim().toLowerCase() || "1";
    options.mode = Object.hasOwn(choices, answer) ? choices[answer] : undefined;
    if (!options.mode) console.error(t("modeInvalid"));
  }
  for (const side of ["panel", "daemon"]) {
    if (options.mode !== "full" && options.mode !== side) continue;
    const key = `${side}Port`;
    while (options[key] === undefined) {
      const input = useMenu
        ? await prompt.text({
            title: t("portTitle", { side, port: defaultPorts[side] }),
            placeholder: String(defaultPorts[side])
          })
        : undefined;
      const answer = (
        input
          ? input.value
          : await prompt.question(t("portPrompt", { side, port: defaultPorts[side] }))
      ).trim();
      try {
        const port = parsePort(answer || defaultPorts[side], side, options.language);
        const otherSide = side === "panel" ? "daemon" : "panel";
        if (options.mode === "full" && port === options[`${otherSide}Port`])
          throw new Error(t("portsConflict"));
        options[key] = port;
        input?.mark("done", String(port));
      } catch (error) {
        input?.mark("error", answer || String(defaultPorts[side]));
        console.error(error.message);
      }
    }
  }
  validatePorts(options.mode, options.panelPort, options.daemonPort, options.language);
  if (useMenu && options.install === undefined) {
    const t = createTranslator(options.language);
    options.install = await prompt.select({
      title: t("installTitle"),
      options: [
        { value: true, label: t("installYes") },
        { value: false, label: t("installNo") }
      ],
      hint: t("selectHint"),
      defaultIndex: 0
    });
  }
  while (options.install === undefined) {
    const answer = (await prompt.question(t("installPrompt"))).trim().toLowerCase();
    if (["", "y", "yes", "是"].includes(answer)) options.install = true;
    else if (["n", "no", "否"].includes(answer)) options.install = false;
    else console.error(t("confirmInvalid"));
  }
  return options;
}

function projectManifest(directory, mode, versions, language) {
  const t = createTranslator(language);
  if (!modes.includes(mode)) throw new Error(t("modeUnknown", { mode }));
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

function npmCommand(args) {
  const npmCLI = process.env.npm_execpath;
  return npmCLI && /npm(?:-cli)?\.(?:c?js|mjs)$/.test(npmCLI)
    ? { executable: process.execPath, args: [npmCLI, ...args] }
    : process.platform === "win32"
    ? { executable: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", "npm", ...args] }
    : { executable: "npm", args };
}

async function latestRuntimeVersion(side, language) {
  const name = `@elementspanel/${side}`;
  const command = npmCommand(["view", `${name}@latest`, "version", "--json", "--prefer-online"]);
  try {
    const { stdout } = await execFileAsync(command.executable, command.args, {
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true
    });
    const version = JSON.parse(stdout);
    if (
      typeof version !== "string" ||
      !/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/i.test(version)
    )
      throw new Error("npm returned an invalid version.");
    return version;
  } catch (cause) {
    throw new Error(createTranslator(language)("versionLookupFailed", { name }), { cause });
  }
}

function installDependencies(directory, language) {
  const t = createTranslator(language);
  return new Promise((resolve, reject) => {
    const command = npmCommand(["install", "--no-fund", "--no-audit"]);
    const child = spawn(command.executable, command.args, {
      cwd: directory,
      stdio: "inherit",
      shell: false
    });
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(t("installFailed", { status: signal || code, directory })))
    );
  });
}

async function initialize({
  directory,
  language,
  mode = "full",
  panelPort,
  daemonPort,
  install = true,
  versions,
  installer = installDependencies
}) {
  const selectedLanguage = language === undefined ? undefined : normalizeLanguage(language);
  if (language !== undefined && !selectedLanguage)
    throw new Error(createTranslator()("languageInvalid"));
  if (!modes.includes(mode))
    throw new Error(createTranslator(selectedLanguage)("modeUnknown", { mode }));
  const serviceLanguage =
    selectedLanguage === undefined ? undefined : selectedLanguage === "zh" ? "zh_cn" : "en_us";
  const ports = validatePorts(mode, panelPort, daemonPort, selectedLanguage);
  const destination = await validateDestination(directory, selectedLanguage);
  if (versions === undefined) {
    versions = Object.fromEntries(
      await Promise.all(
        ["panel", "daemon"]
          .filter((side) => mode === "full" || mode === side)
          .map(async (side) => [side, await latestRuntimeVersion(side, selectedLanguage)])
      )
    );
  }
  const manifest = projectManifest(destination, mode, versions, selectedLanguage);
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
  await fs.writeFile(path.join(destination, "README.md"), "# ElementsPanel\n", { flag: "wx" });
  for (const side of ["panel", "daemon"]) {
    if (mode !== "full" && mode !== side) continue;
    const configFile = path.join(
      destination,
      side,
      side === "panel" ? "data/SystemConfig/config.json" : "data/Config/global.json"
    );
    await fs.mkdir(path.dirname(configFile), { recursive: true });
    // A prewritten panel config bypasses the runtime's first-run locale detection.
    const config =
      side === "panel"
        ? { httpPort: ports.panel, language: serviceLanguage || detectSystemLanguage() }
        : { port: ports.daemon, ...(serviceLanguage ? { language: serviceLanguage } : {}) };
    await fs.writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600
    });
  }
  if (install) await installer(destination, selectedLanguage);
  return { directory: destination, manifest };
}

function quoteDirectory(directory) {
  if (process.platform === "win32") return `"${directory}"`;
  return /^[a-zA-Z0-9_./:-]+$/.test(directory)
    ? directory
    : `'${directory.replace(/'/g, "'\\''")}'`;
}

function printNextSteps(result, installed, language) {
  const t = createTranslator(language);
  console.log(`\n${t("created", { directory: result.directory })}`);
  console.log(`\n${t("nextSteps")}`);
  if (result.directory !== path.resolve(process.cwd()))
    console.log(`  cd ${quoteDirectory(result.directory)}`);
  if (!installed) console.log("  npm install");
  console.log("  npm start");
}

function createInteractivePrompt() {
  return {
    select: (config) => selectMenu(config),
    text: (config) => textPrompt(config),
    close() {}
  };
}

async function run(argv = process.argv.slice(2)) {
  let prompt;
  try {
    const options = parseArgs(argv);
    const t = createTranslator(options.language);
    if (options.help) {
      console.log(t("help", { panelPort: defaultPorts.panel, daemonPort: defaultPorts.daemon }));
      return;
    }
    if (typeof registerHooks !== "function") throw new Error(t("nodeVersion"));
    const interactive = process.stdin.isTTY && process.stdout.isTTY && !options.yes;
    if (interactive) {
      prompt = createInteractivePrompt();
      await promptOptions(options, prompt);
      prompt = undefined;
    }
    const result = await initialize({
      ...options,
      directory: options.directory || "my-panel",
      mode: options.mode || "full"
    });
    printNextSteps(result, options.install !== false, options.language);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    prompt?.close();
  }
}

module.exports = { parseArgs, promptOptions, projectManifest, initialize, run };
