const path = require("node:path");
const { installPluginResolution } = require("./plugin-resolution.cjs");

// This file is copied to <package>/runtime. Resolve assets from the real package,
// independently of the directory in which npm start was invoked.
const packageRoot = path.resolve(__dirname, "..");
process.env.EPANEL_PACKAGE_ROOT = packageRoot;
process.env.NODE_ENV = "production";

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
require(path.join(packageRoot, "app.js"));
