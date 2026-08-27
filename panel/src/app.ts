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
import { loadPanelPlugins, runPanelPluginHook } from "./app/plugins";
import { logger } from "./app/service/log";
import SystemRemoteService from "./app/service/remote_service";
import SystemUser from "./app/service/user_service";
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
    await runPanelPluginHook("dispose");
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

  // Initialize services
  await SystemUser.initialize();
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
  await loadPanelPlugins(app);
  const pluginDirectory = path.join(process.cwd(), "plugins");
  const discoverFrontendPlugins = () => {
    const manifest: any[] = [];
    if (!fs.existsSync(pluginDirectory)) return manifest;
    for (const item of fs.readdirSync(pluginDirectory, { withFileTypes: true })) {
      if (!item.isDirectory() || !/^[a-zA-Z0-9_-]+$/.test(item.name)) continue;
      const folder = item.name;
      const installedPluginDirectory = path.join(pluginDirectory, folder);
      const metadataPath = path.join(installedPluginDirectory, "plugin.json");
      if (!fs.existsSync(metadataPath)) continue;
      try {
        const metadata = fs.readJsonSync(metadataPath);
        if (typeof metadata?.id !== "string" || !metadata.id.trim()) continue;
        const frontend = [metadata?.frontend, metadata?.ui].find(
          (entry) => typeof entry === "string" && entry.length > 0
        );
        if (metadata?.enabled === false || typeof frontend !== "string") continue;
        const frontendDirectory = path.join(installedPluginDirectory, "frontend");
        const frontendEntryPath = path.resolve(installedPluginDirectory, frontend);
        if (
          !frontendEntryPath.startsWith(`${path.resolve(frontendDirectory)}${path.sep}`) ||
          !fs.existsSync(frontendEntryPath)
        )
          continue;
        const relativeEntry = path.relative(installedPluginDirectory, frontendEntryPath);
        const styles = Array.isArray(metadata.styles)
          ? metadata.styles
            .filter((style: unknown) => typeof style === "string")
            .map((style: string) => path.resolve(installedPluginDirectory, style))
            .filter(
              (stylePath: string) =>
                stylePath.startsWith(`${path.resolve(frontendDirectory)}${path.sep}`) &&
                fs.existsSync(stylePath)
            )
            .map(
              (stylePath: string) =>
                `./${folder}/${path
                  .relative(installedPluginDirectory, stylePath)
                  .split(path.sep)
                  .join("/")}`
            )
          : [];
        manifest.push({
          metadata,
          directory: metadata.id,
          assetDirectory: folder,
          entry: `./${folder}/${relativeEntry.split(path.sep).join("/")}`,
          styles
        });
      } catch (error) {
        logger.error(`Failed to load compiled frontend plugin: ${folder}`, error);
      }
    }
    return manifest.sort(
      (a, b) =>
        (Number(a.metadata.priority) || 0) - (Number(b.metadata.priority) || 0) ||
        String(a.metadata.id).localeCompare(String(b.metadata.id))
    );
  };
  app.use(async (ctx, next) => {
    if (ctx.path === "/plugins/manifest.json") {
      ctx.set("Cache-Control", "no-store");
      ctx.type = "application/json";
      ctx.body = discoverFrontendPlugins();
      return;
    }
    const match = ctx.path.match(/^\/plugins\/([a-zA-Z0-9_-]+)\/frontend(?:\/|$)/);
    if (!match) return next();
    const folder = match[1];
    if (!discoverFrontendPlugins().some((plugin) => plugin.assetDirectory === folder)) {
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
  await runPanelPluginHook("ready");
}

main().catch(async (err) => {
  await runPanelPluginHook("dispose");
  logger.error("main() error:", err);
  process.exit(0);
});
