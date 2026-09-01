import RedisStorage from "./app/common/storage/redis_storage";
import Storage from "./app/common/storage/sys_storage";
import { $t } from "./app/i18n";
import { mountRouters } from "./app/index";
import { ctx as panel } from "./app/plugin/context";
import { installPanelPluginServices } from "./app/plugin/install";
import { loadPanelPlugins } from "./app/plugin/loader";
import { logger } from "./app/service/log";
import SystemRemoteService from "./app/service/remote_service";
import versionAdapter from "./app/service/version_adapter";
import { initSystemConfig, systemConfig } from "./app/setting";
import { checkBusinessMode, getVersion, initVersionManager } from "./app/version";

async function processExit() {
  try {
    await panel.stop();
    logger.warn($t("TXT_CODE_cea5dba1"));
    logger.warn($t("TXT_CODE_b0aa2db9"));
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
  // load global configuration file
  initSystemConfig();

  if (systemConfig && systemConfig?.redisUrl?.length != 0) {
    await RedisStorage.initialize(systemConfig.redisUrl);
    Storage.setStorageType(Storage.TYPE.REDIS);
  }

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

  // Detect whether the configuration file is from an older version and update it if so.
  versionAdapter.detectConfig();

  checkBusinessMode();

  // Initialize services. The user subsystem is initialized by the "user"
  // plugin, which owns it.
  await SystemRemoteService.initialize();

  // The plugin container owns everything past this point: services first, so
  // that a plugin can use them, then the plugins themselves. The web server —
  // the Koa application, its base middleware, the static assets and the
  // listener — is the "server" plugin, and it is what provides `ctx.koa`.
  installPanelPluginServices();
  await loadPanelPlugins();

  // The core's own routers go on last, after every plugin's middleware and
  // routers and after the static handlers — the order the panel had before any
  // of this was disposable. Reloading the web server hands us a new Koa
  // application, and this re-runs against it.
  panel.inject(["koa"], (scoped) => {
    mountRouters(scoped.koa.app);
  });

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
