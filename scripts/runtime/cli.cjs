const fs = require("node:fs");
const path = require("node:path");
const { createRequire, registerHooks } = require("node:module");
const { resolveNpmPlugins } = require("./npm-plugins.cjs");
const { ensureRuntimeTools } = require("./daemon-tools.cjs");
const { fork } = require("node:child_process");
const { InstanceProcessHost } = require("./instance-host.cjs");
const { randomUUID } = require("node:crypto");

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
  if (!["start", "dev", "help", "version"].includes(options.command))
    throw new Error(`Unknown command: ${options.command}`);
  if (side === "daemon" && (options.withDaemon || options.open || options["panel-dir"])) {
    throw new Error("--with-daemon, --open and --panel-dir belong to the panel command.");
  }
  return options;
}

function help(side) {
  return `Usage: ${side === "panel" ? "epanel" : "epanel-daemon"} <start|dev> [options]

  start                    Load compiled npm plugins
  dev                      Load external plugin workspace sources

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

function workerEnvironment(plan, worker) {
  const environment = {
    ...process.env,
    EPANEL_PROJECT_ROOT: plan.project,
    EPANEL_RUNTIME_ROOT: worker.directory,
    EPANEL_DEV: plan.development ? "1" : "0",
    EPANEL_SUPERVISED: "1"
  };
  delete environment.EPANEL_PACKAGE_ROOT;
  delete environment.EPANEL_LOCAL_DAEMON_CONFIG;
  if (worker.side === "panel" && plan.localDaemonConfig)
    environment.EPANEL_LOCAL_DAEMON_CONFIG = plan.localDaemonConfig;

  // fork() pipes worker output so the parent can add a side prefix. That makes
  // supports-color think stdout is not a terminal, even when npm start is
  // running in one. Preserve explicit color settings and otherwise propagate
  // the parent's terminal capability to the worker.
  if (
    environment.FORCE_COLOR === undefined &&
    environment.NO_COLOR === undefined &&
    (process.stdout.isTTY || process.stderr.isTTY)
  ) {
    environment.FORCE_COLOR = "3";
  }
  return environment;
}

function workerPrefix(side, target) {
  const color = side === "daemon" ? "\u001b[36m" : "\u001b[32m";
  const forceColor = process.env.FORCE_COLOR;
  const colored =
    process.env.NO_COLOR === undefined &&
    (target.isTTY || (forceColor !== undefined && forceColor !== "0" && forceColor !== "false"));
  return colored ? `${color}[${side}]\u001b[39m ` : `[${side}] `;
}

/** Prefix worker output without breaking lines split across child-process chunks. */
function pipeWorkerOutput(stream, target, side) {
  let pending = "";
  const prefix = workerPrefix(side, target);
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

function validateRuntime(packageRoot, side, project, directory) {
  for (const item of ["app.js", "runtime/worker.cjs"]) {
    if (!fs.existsSync(path.join(packageRoot, item)))
      throw new Error(`Incomplete ${side} package: missing ${item}.`);
  }
  const plugins = resolveNpmPlugins(packageRoot, side, {
    skipInvalid: true,
    development: false,
    projectRoot: project,
    runtimeDirectory: directory
  });
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
  for (const worker of workers)
    validateRuntime(worker.packageRoot, worker.side, project, worker.directory);
  return {
    workers,
    project,
    development: options.command === "dev",
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
  const instanceHosts = new Map();
  const workerEnvironments = new Map();
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
    for (const host of instanceHosts.values()) host.stop();
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

  const startWorker = async (worker, restarted = false) => {
    if (restarted) {
      const name = `@elementspanel/${worker.side}`;
      const manifest = JSON.parse(fs.readFileSync(path.join(plan.project, "package.json"), "utf8"));
      if (manifest.dependencies?.[name]) {
        const projectRequire = createRequire(path.join(plan.project, "package.json"));
        // npm can move the runtime between nested and hoisted node_modules.
        // Inspect paths afresh instead of reusing Node's cached resolution.
        const filename = projectRequire.resolve
          .paths(name)
          .map((directory) => path.join(directory, name, "package.json"))
          .find((filename) => fs.existsSync(filename));
        if (!filename) throw new Error(`Missing updated runtime package: ${name}.`);
        worker.packageRoot = path.dirname(fs.realpathSync(filename));
        validateRuntime(worker.packageRoot, worker.side, plan.project, worker.directory);
      }
    }
    const host = instanceHosts.get(worker);
    let environment = workerEnvironments.get(worker);
    if (!environment) {
      environment = workerEnvironment(plan, worker);
      if (worker.side === "panel") {
        environment.EPANEL_SESSION_SECRET = randomUUID();
        environment.EPANEL_SESSION_COOKIE = randomUUID();
      }
      workerEnvironments.set(worker, environment);
    }
    const child = fork(
      path.join(worker.packageRoot, "runtime/worker.cjs"),
      options.open && worker.side === "panel" ? ["--open"] : [],
      {
        cwd: worker.directory,
        env: { ...environment, EPANEL_RESTARTED: restarted ? "1" : "0" },
        execArgv: ["--enable-source-maps"],
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        serialization: "advanced"
      }
    );
    const flushOutput = [
      pipeWorkerOutput(child.stdout, process.stdout, worker.side),
      pipeWorkerOutput(child.stderr, process.stderr, worker.side)
    ];
    children.add(child);
    let rejectReady;
    let restarting = false;
    let restartTimer;
    child.on("message", (message) => {
      host?.handle(child, message);
      if (stopping) return;
      if (message?.type === "elementspanel:prepare-restart") {
        host?.detach(child, true);
        restartTimer ??= setTimeout(() => {
          console.error(`${worker.side} timed out while preparing to restart.`);
          stop(1);
        }, shutdownTimeout);
      } else if (message?.type === "elementspanel:restart") {
        restarting = true;
      }
    });
    child.on("error", (error) => {
      if (!stopping) console.error(error.message);
      rejectReady?.(error);
      stop(1);
    });
    child.once("close", (code, signal) => {
      clearTimeout(restartTimer);
      flushOutput.forEach((flush) => flush());
      children.delete(child);
      host?.detach(child);
      const starting = Boolean(rejectReady);
      const error = new Error(`${worker.side} exited before becoming ready (${signal || code}).`);
      if (starting && !stopping) console.error(error.message);
      rejectReady?.(error);
      if (!stopping && restarting && !starting && code === 0) {
        console.log(`${workerPrefix(worker.side, process.stdout)}Restarting...`);
        void startWorker(worker, true).catch((error) => {
          console.error(error.message);
          stop(1);
        });
      } else if (!stopping) stop(starting || code !== 0 ? 1 : 0);
      finish();
    });
    return new Promise((resolve, reject) => {
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
  };
  try {
    for (const worker of plan.workers) {
      if (stopping) break;
      fs.mkdirSync(worker.directory, { recursive: true });
      if (worker.side === "daemon") {
        instanceHosts.set(worker, new InstanceProcessHost());
        await ensureRuntimeTools(worker.directory, {
          onDownload: (spec) =>
            console.log(`${workerPrefix("daemon", process.stdout)}Downloading ${spec.filename}...`)
        });
      }
      await startWorker(worker);
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
    for (const host of instanceHosts.values()) host.stop();
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

module.exports = {
  parseArgs,
  planWorkers,
  startWorkers,
  pipeWorkerOutput,
  workerEnvironment,
  run
};
