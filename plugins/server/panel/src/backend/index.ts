import axios from "axios";
import fs from "fs-extra";
import http from "http";
import https from "https";
import Koa from "koa";
import koaBody, { HttpMethodEnum } from "koa-body";
import koaStatic from "koa-static";
import mount from "koa-mount";
import session from "koa-session";
import { packagePath, removeTrail, developmentRuntime } from "mcsmanager-common";
import open from "open";
import os from "os";
import path from "path";
import { Server as SocketIOServer } from "socket.io";
import { v4 } from "uuid";
import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import { localeMessages } from "../i18n";
import { KoaService } from "./koa";
import { preCheck } from "./precheck";
import { protocol } from "./protocol";
import { pluginAssets } from "./plugin_assets";

// Own the panel HTTP stack, listener and plugin-scoped Koa service.
// Provide koa here; declaring it as an injected dependency would prevent startup.

const STATIC_MAX_AGE = 10 * 24 * 60 * 60;

/** The fields this plugin owns in the panel configuration. */
const SETTING_KEYS = [
  "httpPort",
  "httpIp",
  "prefix",
  "ssl",
  "sslPemPath",
  "sslKeyPath",
  "crossDomain",
  "reverseProxyMode",
  "reverseProxyHeader"
] as const;

export const inject = ["i18n", "settings", "globals", "plugins", "middleware", "roles"];

export function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);

  const config = ctx.settings.config;
  const $t = ctx.i18n.$t;

  const app = new Koa({
    proxy: config.reverseProxyMode || false,
    proxyIpHeader: config.reverseProxyHeader || "X-Real-IP"
  });
  let reloading = false;
  app.use(async (requestCtx, next) => {
    if (reloading) {
      requestCtx.status = 503;
      return;
    }
    await next();
  });

  app.on("error", () => {
    // Suppress noisy Koa framework errors during connection floods.
  });

  // The launcher keeps these stable across worker restarts.
  app.keys = [process.env.EPANEL_SESSION_SECRET || v4()];
  app.use(
    session(
      {
        key: process.env.EPANEL_SESSION_COOKIE || v4(),
        maxAge: 86400000,
        overwrite: true,
        httpOnly: true,
        signed: true,
        rolling: false,
        renew: false,
        sameSite: "lax",
        secure: config.ssl
      },
      app
    )
  );
  if (config.prefix !== "") {
    const prefix = removeTrail(config.prefix, "/");
    app.use(async (requestCtx, next) => {
      if (requestCtx.path === prefix || requestCtx.path.startsWith(prefix + "/")) {
        const originalUrl = requestCtx.url;
        requestCtx.url = requestCtx.url.slice(prefix.length) || "/";
        if (!requestCtx.url.startsWith("/")) requestCtx.url = "/" + requestCtx.url;
        try {
          await next();
        } finally {
          requestCtx.url = originalUrl;
        }
      } else {
        requestCtx.redirect(prefix + requestCtx.url);
      }
    });
  }
  // Wrap parser and upload errors too, while keeping the authenticated session
  // available before multipart parsing writes any temporary files.
  app.use(protocol(ctx));

  // Reject unauthorized uploads before the body parser writes temporary files.
  app.use(preCheck(ctx));

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
      onError(err) {
        ctx.logger.error("koaBody Lib Error:", err);
        throw err;
      }
    })
  );

  // Mount plugin dispatchers before static handlers and feature routes.
  ctx.plugin(KoaService, app);

  app.use(pluginAssets(ctx));

  app.use(
    mount(
      "/upload_files",
      koaStatic(path.resolve("public", "upload_files"), { maxAge: STATIC_MAX_AGE })
    )
  );
  app.use(koaStatic(packagePath("public"), { maxAge: STATIC_MAX_AGE }));

  // Provide the administrative proxy for remote integrations.
  ctx.inject(["koa"], (koaCtx) => {
    const proxyRouter = koaCtx.koa.router("/api/auth");
    proxyRouter.all(
      "/proxy",
      ctx.middleware.validator({ query: { target: String } }),
      ctx.middleware.permission({ level: ctx.roles.ADMIN }),
      async (requestCtx) => {
        try {
          const response = await axios.request({
            method: (requestCtx.query.method as string) || requestCtx.method,
            url: String(requestCtx.query.target)
          });
          if (response.status !== 200) throw new Error("Response code != 200");
          requestCtx.body = response.data;
        } catch (error) {
          requestCtx.body = error;
        }
      }
    );
  });

  // Listener, proxy and path settings take effect after restart.
  ctx.inject(["settingsForm"], (settingsCtx) =>
    settingsCtx.settingsForm.declare({
      restartRequired: true,
      fields: () => [
        {
          key: "httpPort",
          type: "number",
          title: $t("TXT_CODE_7f0017d2"),
          description: `${$t("TXT_CODE_233624ad")} ${$t("TXT_CODE_SERVER_RESTART_TIP")}`,
          min: 1,
          max: 65535
        },
        {
          key: "httpIp",
          type: "string",
          title: $t("TXT_CODE_514e064a"),
          description: $t("TXT_CODE_328191e")
        },
        {
          key: "prefix",
          type: "string",
          title: $t("TXT_CODE_SERVER_PREFIX"),
          description: $t("TXT_CODE_SERVER_PREFIX_TIP")
        },
        {
          key: "ssl",
          type: "boolean",
          title: $t("TXT_CODE_SERVER_SSL"),
          description: $t("TXT_CODE_SERVER_SSL_TIP")
        },
        {
          key: "sslPemPath",
          type: "string",
          title: $t("TXT_CODE_SERVER_SSL_PEM"),
          description: $t("TXT_CODE_SERVER_SSL_PEM_TIP"),
          visibleWhen: "ssl"
        },
        {
          key: "sslKeyPath",
          type: "string",
          title: $t("TXT_CODE_SERVER_SSL_KEY"),
          description: $t("TXT_CODE_SERVER_SSL_KEY_TIP"),
          visibleWhen: "ssl"
        },
        {
          key: "crossDomain",
          type: "boolean",
          title: $t("TXT_CODE_405cd346"),
          description: $t("TXT_CODE_6655c905")
        },
        {
          key: "reverseProxyMode",
          type: "boolean",
          title: $t("TXT_CODE_f0789d81"),
          description: $t("TXT_CODE_2b85af6d")
        },
        {
          key: "reverseProxyHeader",
          type: "string",
          title: $t("TXT_CODE_66aeac82"),
          description: $t("TXT_CODE_fd8bc51f"),
          visibleWhen: "reverseProxyMode"
        }
      ],
      read: () => {
        const values: Record<string, unknown> = {};
        for (const key of SETTING_KEYS) values[key] = config[key];
        return values;
      },
      write: (values) => {
        // Validate before changing live configuration.
        const port = values.httpPort == null ? config.httpPort : Number(values.httpPort);
        if (!Number.isInteger(port) || port <= 0 || port > 65535) {
          throw new Error($t("TXT_CODE_e4d6cc20"));
        }

        // Accept explicit empty strings to clear addresses, prefixes and certificates.
        config.httpPort = port;
        if (values.httpIp != null) config.httpIp = String(values.httpIp);
        if (values.prefix != null) config.prefix = String(values.prefix);
        if (values.ssl != null) config.ssl = Boolean(values.ssl);
        if (values.sslPemPath != null) config.sslPemPath = String(values.sslPemPath);
        if (values.sslKeyPath != null) config.sslKeyPath = String(values.sslKeyPath);
        if (values.crossDomain != null) config.crossDomain = Boolean(values.crossDomain);
        if (values.reverseProxyMode != null) {
          config.reverseProxyMode = Boolean(values.reverseProxyMode);
        }
        if (values.reverseProxyHeader != null) {
          config.reverseProxyHeader = String(values.reverseProxyHeader);
        }
        return ctx.settings.save();
      }
    })
  );

  // Create Socket.IO before feature apply() hooks register handlers; defer listening until ready.
  let httpServer: http.Server | https.Server | undefined;
  let websocket: SocketIOServer | undefined;

  try {
    if (config.ssl) {
      const options = {
        cert: fs.readFileSync(path.join(config.sslPemPath)),
        key: fs.readFileSync(path.join(config.sslKeyPath))
      };
      httpServer = https.createServer(options, app.callback());
    } else {
      httpServer = http.createServer(app.callback());
    }
  } catch (error) {
    // Fail startup if the listener cannot be created.
    ctx.logger.error($t("TXT_CODE_app.httpSetupError"));
    ctx.logger.error(error);
    return process.exit(1);
  }

  websocket = new SocketIOServer(httpServer, {
    path: removeTrail(config.prefix, "/") + "/socket.io",
    serveClient: false,
    cookie: false,
    cors: config.crossDomain ? { origin: true, credentials: true } : undefined
  });
  ctx.set("websocket", { io: websocket });

  let closing: Promise<void> | undefined;
  let closeDevelopment: (() => Promise<void>) | undefined;
  const closeTransport = () =>
    (closing ??= (async () => {
      await closeDevelopment?.();
      // Socket.IO releases the listener after its adapters finish closing.
      // Existing HTTP replies may finish after it stops accepting connections.
      await websocket?.close();
      if (httpServer?.listening) httpServer.close();
    })());

  // Stop accepting requests before authentication and feature routes unload.
  // An install request already in progress can still send its final HTTP reply.
  ctx.on("process/restarting", () => {
    reloading = true;
    return closeTransport();
  });

  httpServer.on("error", (err) => {
    ctx.logger.error($t("TXT_CODE_app.httpSetupError"));
    ctx.logger.error(err);
    process.exit(1);
  });

  // Bound on `ready`, not here: the panel must not accept a request before every
  // plugin has registered its routes.
  ctx.on("ready", async () => {
    if (process.env.EPANEL_DEV === "1")
      closeDevelopment = await developmentRuntime()?.attach(httpServer!, config.prefix);
    const port = config.httpPort;
    httpServer?.listen(port, config.httpIp, () => {
      if (process.connected) process.send?.({ type: "elementspanel:ready" }, () => {});
    });
    ctx.logger.info("==================================");
    ctx.logger.info($t("TXT_CODE_app.panelStarted"));
    let appHost = $t("TXT_CODE_app.host", { port });
    if (config.ssl) appHost = appHost.replace("http", "https");
    ctx.logger.info(appHost);
    ctx.logger.info($t("TXT_CODE_app.portTip", { port }));
    ctx.logger.info($t("TXT_CODE_app.exitTip", { port }));
    ctx.logger.info("==================================");

    if (os.platform() === "win32" && process.argv.includes("--open")) {
      open(config.ssl ? `https://localhost:${port}/` : `http://localhost:${port}/`);
    }
  });

  // Close the listener when the server plugin unloads.
  ctx.on("dispose", async () => {
    await closeTransport();
    websocket = undefined;
    httpServer = undefined;
  });
}
