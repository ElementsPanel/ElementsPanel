const path = require("node:path");
const { createRequire } = require("node:module");
const { installPluginResolution } = require("./plugin-resolution.cjs");
const { installInstanceProcessClient } = require("./instance-client.cjs");

// This file is copied to <package>/runtime. Resolve assets from the real package,
// independently of the directory in which npm start was invoked.
const packageRoot = path.resolve(__dirname, "..");
process.env.EPANEL_PACKAGE_ROOT = packageRoot;
process.env.NODE_ENV = process.env.EPANEL_DEV === "1" ? "development" : "production";

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  // IPC also permits graceful shutdown on Windows, where child.kill() would
  // otherwise terminate the process before the instance shutdown hooks run.
  if (process.listenerCount("SIGTERM")) process.emit("SIGTERM", "SIGTERM");
  else process.exit(0);
}
process.on("message", (message) => {
  if (message?.type === "elementspanel:stop") stop();
});
process.on("disconnect", stop);

installPluginResolution(packageRoot, process.cwd());
installInstanceProcessClient();

async function main() {
  if (process.env.EPANEL_DEV === "1") {
    const projectRequire = createRequire(
      path.join(process.env.EPANEL_PROJECT_ROOT, "package.json")
    );
    let development;
    try {
      development = projectRequire("@elementspanel/init/development.cjs");
    } catch (cause) {
      throw new Error(
        "Development mode requires @elementspanel/init. Run npm install in the project directory.",
        { cause }
      );
    }
    await development.installDevelopmentRuntime({ packageRoot });
  }
  require(path.join(packageRoot, "app.js"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
