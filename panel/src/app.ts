import fs from "fs-extra";
import http from "http";
import https from "https";
import Koa from "koa";
import koaBody, { HttpMethodEnum } from "koa-body";
import koaMount from "koa-mount";
import session from "koa-session";
import koaStatic from "koa-static";
import { removeTrail } from "mcsmanager-common";
import open from "open";
import os from "os";
import path from "path";
import { v4 } from "uuid";
import RedisStorage from "./app/common/storage/redis_storage";
import Storage from "./app/common/storage/sys_storage";
import { $t } from "./app/i18n";
import { mountRouters } from "./app/index";
import { preCheckMiddleware } from "./app/middleware/precheck";
import { middleware as protocolMiddleware } from "./app/middleware/protocol";
import { ctx as panel } from "./app/plugin/context";
import { installPanelPluginServices } from "./app/plugin/install";
import { loadPanelPlugins } from "./app/plugin/loader";
import { logger } from "./app/service/log";
import SystemRemoteService from "./app/service/remote_service";
import versionAdapter from "./app/service/version_adapter";
import { initSystemConfig, systemConfig } from "./app/setting";
import { checkBusinessMode, getVersion, initVersionManager } from "./app/version";

function hasParams(name: string) {
  return process.argv.includes(name);
}

function setupHttp(
  koaApp: Koa,
  ssl: boolean,
  sslPemPath: string,
  sslKeyPath: string,
  port: number,
  host?: string
) {
  let httpServer: http.Server | https.Server;

  if (ssl) {
    const options = {
      cert: fs.readFileSync(path.join(sslPemPath)),
      key: fs.readFileSync(path.join(sslKeyPath))
    };
    httpServer = https.createServer(options, koaApp.callback());
  } else {
    httpServer = http.createServer(koaApp.callback());
  }

  httpServer.on("error", (err) => {
    logger.error($t("TXT_CODE_app.httpSetupError"));
    logger.error(err);
    process.exit(1);
  });

  httpServer.listen(port, host);
  logger.info("==================================");
  logger.info($t("TXT_CODE_app.panelStarted"));
  logger.info($t("TXT_CODE_app.reference"));
  let appHost = $t("TXT_CODE_app.host", { port });
  if (ssl) appHost = appHost.replace("http", "https");
  logger.info(appHost);
  logger.info($t("TXT_CODE_app.portTip", { port }));
  logger.info($t("TXT_CODE_app.exitTip", { port }));
  logger.info("==================================");

  if (os.platform() == "win32" && hasParams("--open")) {
    open(ssl ? `https://localhost:${port}/` : `http://localhost:${port}/`);
  }
}

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

  const app = new Koa({
    proxy: systemConfig?.reverseProxyMode || false,
    proxyIpHeader: systemConfig?.reverseProxyHeader || "X-Real-IP"
  });

  // Listen for Koa errors
  app.on("error", (error) => {
    // Block all Koa framework level events
    // When Koa is attacked by a short connection flood, it is easy for error messages to swipe the screen, which may indirectly affect the operation of some applications
  });

  app.use(preCheckMiddleware);
  app.use(
    koaBody({
      multipart: true,
      parsedMethods: [
        HttpMethodEnum.GET,
        HttpMethodEnum.PUT,
        HttpMethodEnum.POST,
        HttpMethodEnum.DELETE
      ],
      formidable: {
        maxFileSize: 1024 * 1024 * 500,
        maxFiles: 1
      },
      jsonLimit: "10mb",
      onError(err, ctx) {
        logger.error("koaBody Lib Error:", err);
      }
    })
  );

  app.keys = [v4()];
  app.use(
    session(
      {
        key: v4(),
        maxAge: 86400000,
        overwrite: true,
        httpOnly: true,
        signed: true,
        rolling: false,
        renew: false,
        secure: false
      },
      app
    )
  );

  app.use(async (ctx, next) => {
    const ignoreUrls = ["/api/overview", "/api/files/status"];
    for (const iterator of ignoreUrls) {
      if (ctx.URL.pathname.includes(iterator)) return await next();
    }
    await next();
  });

  if (systemConfig && systemConfig.prefix != "") {
    const prefix = systemConfig.prefix;
    app.use(async (ctx, next) => {
      if (ctx.url.startsWith(prefix)) {
        const orig = ctx.url;
        ctx.url = ctx.url.slice(prefix.length);
        if (!ctx.url.startsWith("/")) {
          ctx.url = "/" + ctx.url;
        }
        await next();
        ctx.url = orig;
      } else {
        ctx.redirect(removeTrail(prefix, "/") + ctx.url);
      }
    });
  }
  app.use(protocolMiddleware);

  // The plugin container owns everything past this point: services first, so
  // that a plugin can use them, then the plugins themselves. `ctx.koa` mounts
  // the two composed stacks a plugin adds middleware and routers to, which is
  // why it has to be installed before `mountRouters` puts the core last.
  installPanelPluginServices(app);
  await loadPanelPlugins();

  const pluginDirectory = path.join(process.cwd(), "plugins");
  app.use(async (ctx, next) => {
    if (ctx.path === "/plugins/manifest.json") {
      ctx.set("Cache-Control", "no-store");
      ctx.type = "application/json";
      ctx.body = panel.plugins.frontendManifest();
      return;
    }
    const match = ctx.path.match(/^\/plugins\/([a-zA-Z0-9_-]+)\/frontend(?:\/|$)/);
    if (!match) return next();
    const folder = match[1];
    if (!panel.plugins.frontendManifest().some((plugin) => plugin.assetDirectory === folder)) {
      return next();
    }
    return koaMount(
      `/plugins/${folder}/frontend`,
      koaStatic(path.join(pluginDirectory, folder, "frontend"), {
        maxAge: 10 * 24 * 60 * 60
      })
    )(ctx, next);
  });
  app.use(
    koaStatic(path.join(process.cwd(), "public"), {
      maxAge: 10 * 24 * 60 * 60
    })
  );

  mountRouters(app);

  process.on("uncaughtException", function (err) {
    logger.error(`ERROR (uncaughtException):`, err);
  });

  process.on("unhandledRejection", (reason, p) => {
    logger.error(`ERROR (unhandledRejection):`, reason, p);
  });

  if (systemConfig)
    setupHttp(
      app,
      systemConfig.ssl,
      systemConfig.sslPemPath,
      systemConfig.sslKeyPath,
      systemConfig.httpPort,
      systemConfig.httpIp
    );
  await panel.start();
}

main().catch(async (err) => {
  await panel.stop();
  logger.error("main() error:", err);
  process.exit(0);
});
