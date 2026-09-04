import { ctx as panel } from "./app/plugin/context";
import { loadPanelFoundationPlugin, loadPanelPlugins } from "./app/plugin/loader";
import { logger } from "./app/service/log";

async function processExit() {
  try {
    const translate = panel.get("i18n")?.$t;
    await panel.stop();
    logger.warn(translate?.("TXT_CODE_cea5dba1") ?? "Panel has been stopped.");
    logger.warn(translate?.("TXT_CODE_b0aa2db9") ?? "Goodbye.");
  } catch (err) {
    logger.error(err);
  } finally {
    process.exit(0);
  }
}

["SIGTERM", "SIGINT", "SIGQUIT"].forEach(function (sig) {
  process.on(sig, () => {
    logger.warn(`${sig} close process signal detected.`);
    processExit();
  });
});

process.stdin.on("data", (v) => {
  const command = v.toString().replace("\n", "").replace("\r", "").trim().toLowerCase();
  if (command === "exit") processExit();
});

async function main() {
  // Configuration loading already translates messages and selects the active
  // locale, so translation must exist before the configuration is read.
  await loadPanelFoundationPlugin("i18n");

  // Runtime owns configuration, storage and shared middleware. It is loaded
  // before feature plugins so their dependencies are available through ctx.
  await loadPanelFoundationPlugin("runtime");

  // The plugin container owns everything past this point: services first, so
  // that a plugin can use them, then the plugins themselves. Two of the panel's
  // foundations are plugins now — the web server (`ctx.koa`, `plugins/server`)
  // and the daemon connections (`ctx.remote`, `plugins/node`) — and both are
  // established during this load, before anything can ask for them.
  await loadPanelPlugins();

  process.on("uncaughtException", function (err) {
    logger.error(`ERROR (uncaughtException):`, err);
  });

  process.on("unhandledRejection", (reason, p) => {
    logger.error(`ERROR (unhandledRejection):`, reason, p);
  });

  await panel.start();
}

main().catch(async (err) => {
  await panel.stop();
  logger.error("main() error:", err);
  process.exit(0);
});
