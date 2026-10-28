const fs = require("node:fs");
const path = require("node:path");
const { createRequire, registerHooks } = require("node:module");
const { resolveNpmPlugins } = require("./npm-plugins.cjs");
const { fork } = require("node:child_process");

function parseArgs(argv, side) {
  const options = { command: "start", withDaemon: false, open: false };
  if (argv[0] && !argv[0].startsWith("-")) options.command = argv.shift();
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (["--help", "-h"].includes(argument)) options.command = "help";
    else if (["--version", "-v"].includes(argument)) options.command = "version";
    else if (argument === "--with-daemon") options.withDaemon = true;
    else if (argument === "--open") options.open = true;
    else if (["--cwd", "--panel-dir", "--daemon-dir"].includes(argument)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}.`);
      options[argument.slice(2)] = value;
    } else throw new Error(`Unknown option: ${argument}`);
  }
  if (!["start", "help", "version"].includes(options.command))
    throw new Error(`Unknown command: ${options.command}`);
  if (side === "daemon" && (options.withDaemon || options.open || options["panel-dir"])) {
    throw new Error("--with-daemon, --open and --panel-dir belong to the panel command.");
  }
  return options;
}

function help(side) {
  return `Usage: ${side === "panel" ? "epanel" : "epanel-daemon"} start [options]

  --cwd <directory>         Project directory (default: current directory)
  --${side}-dir <directory>  Existing runtime directory (default: ./${side})
${
  side === "panel"
    ? "  --with-daemon            Start the local daemon before the panel\n  --daemon-dir <directory>  Local daemon directory (default: ./daemon)\n  --open                   Open the panel in a browser on Windows\n"
    : ""
}  --help                   Show this help
  --version                Show the installed package version
`;
}

function runtimeDirectory(project, override, side) {
  return path.resolve(project, override || side);
}

/** Prefix worker output without breaking lines split across child-process chunks. */
function pipeWorkerOutput(stream, target, side) {
  let pending = "";
  const prefix = `[${side}] `;
  const write = (chunk) => {
    pending += chunk.toString();
    const lines = pending.split("\n");
    pending = lines.pop() || "";
    for (const line of lines) target.write(`${prefix}${line.replace(/\r$/, "")}\n`);
  };
  const flush = () => {
    if (!pending) return;
    target.write(`${prefix}${pending.replace(/\r$/, "")}\n`);
    pending = "";
  };
  stream.on("data", write);
  stream.once("end", flush);
  return flush;
}

function validateRuntime(packageRoot, side) {
  for (const item of ["app.js", "runtime/worker.cjs"]) {
    if (!fs.existsSync(path.join(packageRoot, item)))
      throw new Error(`Incomplete ${side} package: missing ${item}.`);
  }
  const plugins = resolveNpmPlugins(packageRoot, side, { skipInvalid: true });
  for (const id of [
    "i18n",
    "storage",
    "runtime",
    "server",
    ...(side === "panel" ? ["console"] : [])
  ]) {
    if (!plugins.some((plugin) => plugin.id === id))
      throw new Error(`Incomplete ${side} installation: missing npm plugin ${id}.`);
  }
  if (side === "panel" && !fs.existsSync(path.join(packageRoot, "public/index.html"))) {
    throw new Error("Incomplete panel package: missing public/index.html.");
  }
  if (side === "daemon") {
    const suffix = process.platform === "win32" ? ".exe" : "";
    for (const name of ["file_zip", "pty", "7z"]) {
      const filename = `${name}_${process.platform}_${process.arch}${suffix}`;
      const alternate =
        name === "file_zip" && process.platform === "darwin" && process.arch === "x64"
          ? "file_zip_darwin_amd64"
          : filename;
      if (
        ![filename, alternate].some((file) => fs.existsSync(path.join(packageRoot, "lib", file)))
      ) {
        throw new Error(
          `The daemon package has no ${name} tool for ${process.platform}/${process.arch}.`
        );
      }
    }
  }
}

function planWorkers(side, packageRoot, options) {
  const project = path.resolve(options.cwd || process.cwd());
  const panelDirectory = runtimeDirectory(project, options["panel-dir"], "panel");
  const daemonDirectory = runtimeDirectory(project, options["daemon-dir"], "daemon");
  const workers = [];
  if (side === "panel" && options.withDaemon) {
    let daemonRoot;
    try {
      const projectRequire = createRequire(path.join(project, "package.json"));
      daemonRoot = path.dirname(projectRequire.resolve("@elementspanel/daemon/package.json"));
    } catch {
      throw new Error(
        "The project needs @elementspanel/daemon. Run npm install @elementspanel/daemon or start without --with-daemon."
      );
    }
    if (panelDirectory === daemonDirectory)
      throw new Error("Panel and daemon need different runtime directories.");
    workers.push({ side: "daemon", packageRoot: daemonRoot, directory: daemonDirectory });
  }
  workers.push({
    side,
    packageRoot,
    directory: side === "panel" ? panelDirectory : daemonDirectory
  });
  for (const worker of workers) validateRuntime(worker.packageRoot, worker.side);
  return {
    workers,
    project,
    localDaemonConfig: options.withDaemon
      ? path.join(daemonDirectory, "data/Config/global.json")
      : undefined
  };
}

/** Supervise foreground workers. No shells, detached children or background servers. */
async function startWorkers(plan, options = {}) {
  if (!plan.workers.length) throw new Error("No runtime was selected.");
  const startupTimeout = options.startupTimeout ?? 120_000;
  const shutdownTimeout = options.shutdownTimeout ?? 90_000;
  const children = new Set();
  let stopping = false;
  let exitCode = 0;
  let forceTimer;
  let done;
  const finished = new Promise((resolve) => {
    done = resolve;
  });
  const finish = () => {
    if (!stopping || children.size) return;
    clearTimeout(forceTimer);
    done(exitCode);
  };
  const forceStop = () => {
    for (const child of children) child.kill("SIGKILL");
  };
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    exitCode = code;
    for (const child of children) {
      if (child.connected)
        child.send({ type: "elementspanel:stop" }, (error) => {
          if (error && children.has(child)) child.kill("SIGTERM");
        });
      else child.kill("SIGTERM");
    }
    forceTimer = setTimeout(forceStop, shutdownTimeout);
    forceTimer.unref();
    finish();
  };
  const onSignal = () => (stopping ? forceStop() : stop(0));
  const onInput = (data) => {
    if (data.toString().trim().toLowerCase() === "exit") stop(0);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  process.stdin.on("data", onInput);
  process.stdin.resume();

  try {
    for (const worker of plan.workers) {
      if (stopping) break;
      fs.mkdirSync(worker.directory, { recursive: true });
      const environment = { ...process.env, EPANEL_PROJECT_ROOT: plan.project };
      delete environment.EPANEL_PACKAGE_ROOT;
      delete environment.EPANEL_LOCAL_DAEMON_CONFIG;
      if (worker.side === "panel" && plan.localDaemonConfig)
        environment.EPANEL_LOCAL_DAEMON_CONFIG = plan.localDaemonConfig;
      const child = fork(
        path.join(worker.packageRoot, "runtime/worker.cjs"),
        options.open && worker.side === "panel" ? ["--open"] : [],
        {
          cwd: worker.directory,
          env: environment,
          execArgv: ["--enable-source-maps"],
          stdio: ["ignore", "pipe", "pipe", "ipc"]
        }
      );
      const flushOutput = [
        pipeWorkerOutput(child.stdout, process.stdout, worker.side),
        pipeWorkerOutput(child.stderr, process.stderr, worker.side)
      ];
      children.add(child);
      let rejectReady;
      child.on("error", (error) => {
        if (!stopping) console.error(error.message);
        rejectReady?.(error);
        stop(1);
      });
      child.once("close", (code, signal) => {
        flushOutput.forEach((flush) => flush());
        children.delete(child);
        const starting = Boolean(rejectReady);
        const error = new Error(`${worker.side} exited before becoming ready (${signal || code}).`);
        if (starting && !stopping) console.error(error.message);
        rejectReady?.(error);
        if (!stopping) stop(starting || code !== 0 ? 1 : 0);
        finish();
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () =>
            settle(
              new Error(
                `${worker.side} did not become ready within ${startupTimeout / 1000} seconds.`
              )
            ),
          startupTimeout
        );
        const onMessage = (message) => {
          if (message?.type === "elementspanel:ready") settle();
        };
        const settle = (error) => {
          clearTimeout(timer);
          child.off("message", onMessage);
          rejectReady = undefined;
          if (error) reject(error);
          else resolve();
        };
        rejectReady = settle;
        child.on("message", onMessage);
      });
    }
  } catch (error) {
    if (!stopping) {
      console.error(error.message);
      stop(1);
    }
  }
  try {
    return await finished;
  } finally {
    clearTimeout(forceTimer);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.stdin.off("data", onInput);
    process.stdin.pause();
  }
}

async function run(side, packageRoot, argv = process.argv.slice(2)) {
  try {
    const options = parseArgs([...argv], side);
    if (options.command === "help") return void console.log(help(side));
    const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    if (options.command === "version") return void console.log(metadata.version);
    if (typeof registerHooks !== "function")
      throw new Error("ElementsPanel requires Node.js 22.15 or newer.");
    process.exitCode = await startWorkers(planWorkers(side, packageRoot, options), options);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, planWorkers, startWorkers, pipeWorkerOutput, run };
