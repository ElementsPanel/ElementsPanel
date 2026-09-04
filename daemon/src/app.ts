import { ctx as daemon } from "./plugin/context";
import { loadDaemonFoundationPlugin, loadDaemonPlugins } from "./plugin/loader";
import logger from "./service/log";

async function main() {
  // Translation and runtime are foundations. The executable itself only
  // orchestrates plugin loading and container lifecycle.
  await loadDaemonFoundationPlugin("i18n");
  await loadDaemonFoundationPlugin("runtime");
  await loadDaemonPlugins();

  process.on("uncaughtException", (err) => {
    logger.error("Error: UncaughtException:", err);
  });

  process.on("unhandledRejection", (reason, p) => {
    logger.error("Error: UnhandledRejection:", reason, p);
  });

  await daemon.start();

  let isExiting = false;
  async function listenExitSig(signal: string, isForce = true) {
    const translate = daemon.get("i18n")?.$t;
    if (isExiting && !isForce) {
      logger.warn(translate?.("TXT_CODE_6f862823") ?? "Shutdown already in progress.");
      return;
    }

    try {
      if (isExiting) {
        logger.warn(translate?.("TXT_CODE_4ffdc91d", { signal }) ?? signal);
        logger.info(translate?.("TXT_CODE_app.forcedShutdown") ?? "Forced shutdown.");
        logger.info(translate?.("TXT_CODE_dff680b7") ?? "Shutdown complete.");
        process.exit(0);
      } else {
        logger.warn(translate?.("TXT_CODE_4ffdc91d", { signal }) ?? signal);
        isExiting = true;
        await daemon.stop();
        logger.info(translate?.("TXT_CODE_dff680b7") ?? "Shutdown complete.");
        process.exit(0);
      }
    } catch (err) {
      logger.error(err);
      process.exit(-1);
    }
  }

  ["SIGTERM", "SIGINT", "SIGQUIT"].forEach((signal) => {
    process.on(signal, async () => {
      await listenExitSig(signal, false);
    });
  });

  process.stdin.on("data", (value) => {
    const command = value.toString().replace("\n", "").replace("\r", "").trim().toLowerCase();
    if (command === "exit") void listenExitSig("exit", false);
  });
}

main().catch(async (err) => {
  await daemon.stop();
  logger.error("main() error:", err);
  process.exit(1);
});
