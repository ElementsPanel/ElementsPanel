import fs from "fs-extra";
import { GOLANG_ZIP_PATH, LOCAL_PRESET_LANG_PATH, PTY_PATH } from "./const";
import { globalConfiguration } from "./entity/config";
import { $t, i18next } from "./i18n";
import "./service/async_task_service";
import { checkDependencies } from "./service/dependencies";
import * as koa from "./service/http";
import logger from "./service/log";
import { ctx as daemon } from "./plugin/context";
import { installDaemonPluginServices } from "./plugin/install";
import { loadDaemonPlugins } from "./plugin/loader";
import * as protocol from "./service/protocol";
import * as router from "./service/router";
import { getVersion, initVersionManager } from "./service/version";
import versionAdapter from "./service/version_adapter";

initVersionManager();
const VERSION = getVersion();

console.log(`                                                     
 _____ _                   _       _____             _ 
|   __| |___ _____ ___ ___| |_ ___|  _  |___ ___ ___| |
|   __| | -_|     | -_|   |  _|_ -|   __| .'|   | -_| |
|_____|_|___|_|_|_|___|_|_|_| |___|__|  |__,|_|_|___|_|

 + Copyright ${new Date().getFullYear()} ElementsPanel
 + Based on MCSManager
 + Version ${VERSION}
`);

// Initialize the global configuration service
globalConfiguration.load();
const config = globalConfiguration.config;

// Detect whether the configuration file is from an older version and update it if so.
versionAdapter.detectConfig();

checkDependencies();

// Set language
if (fs.existsSync(LOCAL_PRESET_LANG_PATH)) {
  i18next.changeLanguage(fs.readFileSync(LOCAL_PRESET_LANG_PATH, "utf-8"));
} else {
  const lang = config.language || "en_us";
  logger.info(`LANGUAGE: ${lang}`);
  i18next.changeLanguage(lang);
}
logger.info($t("TXT_CODE_app.welcome"));

async function main() {
  // The plugin container owns everything past this point: services first, so
  // that a plugin can use them, then the plugins themselves. The daemon's
  // network layer — the Koa application, its base middleware, the listener and
  // the Socket.io server — is the "server" plugin, and it is what provides
  // `ctx.koa` and `ctx.websocket`.
  installDaemonPluginServices();
  router.registerCoreRoutes();
  await loadDaemonPlugins();

  // The core's own HTTP router goes on last, after every plugin's middleware and
  // routers — the order the daemon had before any of this was disposable.
  daemon.inject(["koa"], (scoped) => {
    koa.mountCoreRouter(scoped.koa.app);
  });

  // The daemon's real API is Socket.io, and this is where the core claims it:
  // the server plugin owns the transport, the core owns what a connection means.
  // Registered before anything listens, so no client can arrive unrouted.
  daemon.inject(["websocket"], (scoped) => {
    scoped.websocket.io.on("connection", (socket) => {
      protocol.addGlobalSocket(socket);
      router.navigation(socket);

      socket.on("error", (err) => {
        logger.error("Connection(): Socket.io Error:", err);
      });

      socket.on("disconnect", () => {
        protocol.delGlobalSocket(socket);
        for (const name of socket.eventNames()) socket.removeAllListeners(name);
      });
    });
  });

  (function initCompressModule() {
    try {
      fs.chmodSync(GOLANG_ZIP_PATH, 0o755);
      fs.chmodSync(PTY_PATH, 0o755);
    } catch (error: any) {
      logger.error(error?.message);
      logger.error($t("TXT_CODE_a8b245fa"));
    }
  })();

  process.on("uncaughtException", function (err) {
    logger.error(`Error: UncaughtException:`, err);
  });

  process.on("unhandledRejection", (reason, p) => {
    logger.error(`Error: UnhandledRejection:`, reason, p);
  });

  // Starts the container, which is what makes the server plugin bind its
  // listener and print where the daemon can be reached.
  await daemon.start();

  let isExiting = false;
  async function listenExitSig(signal: string, isForce = true) {
    if (isExiting && !isForce) {
      logger.warn($t("TXT_CODE_6f862823"));
      return;
    }

    try {
      if (isExiting) {
        // User interrupted the process, now force exit
        logger.warn($t("TXT_CODE_4ffdc91d", { signal }));
        logger.info($t("TXT_CODE_app.forcedShutdown"));
        logger.info($t("TXT_CODE_dff680b7"));
        process.exit(0);
      } else {
        logger.warn($t("TXT_CODE_4ffdc91d", { signal }));
        isExiting = true;
        await daemon.stop();

        logger.info($t("TXT_CODE_dff680b7"));
        process.exit(0);
      }
    } catch (err) {
      logger.error(err);
      process.exit(-1);
    }
  }

  // Listen for close process signals
  ["SIGTERM", "SIGINT", "SIGQUIT"].forEach(function (sig) {
    process.on(sig, async () => {
      await listenExitSig(sig, false); // Use soft exit by default
    });
  });

  process.stdin.on("data", (v) => {
    const command = v.toString().replace("\n", "").replace("\r", "").trim().toLowerCase();
    if (command === "exit") listenExitSig("exit", false); // Use soft exit
  });
}

main().catch(async (err) => {
  await daemon.stop();
  logger.error("main() error:", err);
  process.exit(1);
});
