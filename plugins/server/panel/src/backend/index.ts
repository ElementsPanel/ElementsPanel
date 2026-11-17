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

// Provide the Koa service here so server startup has no self-dependency.

const STATIC_MAX_AGE = 10 * 24 * 60 * 60;

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
  // Wrap parser errors while preserving authentication before multipart writes.
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
          title: $t("TXT_CODE_COMMON_PANEL_PORT"),
          description: `${$t("TXT_CODE_COMMON_ENTER_AN_INTEGER_PORT_NUMBER_DEFAULT_23333")} ${$t("TXT_CODE_SERVER_RESTART_TIP")}`,
          min: 1,
          max: 65535
        },
        {
          key: "httpIp",
          type: "string",
          title: $t("TXT_CODE_COMMON_PANEL_BINDING_IP"),
          description: $t("TXT_CODE_COMMON_ENTER_ITS_IP_ADDRESS_TO_BIND_TO_A_SPECIFIC_NETWORK_INTERFACE")
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
          title: $t("TXT_CODE_COMMON_CROSS_ORIGIN_REQUEST_API_INTERFACE"),
          description: $t("TXT_CODE_SERVER_CROSS_ORIGIN_SECURITY_HINT")
        },
        {
          key: "reverseProxyMode",
          type: "boolean",
          title: $t("TXT_CODE_COMMON_REVERSE_PROXY_MODE"),
          description: $t("TXT_CODE_COMMON_ENABLE_WHEN_USING_A_REVERSE_PROXY_TO_READ_THE_CLIENTS_REAL_IP")
        },
        {
          key: "reverseProxyHeader",
          type: "string",
          title: $t("TXT_CODE_COMMON_REVERSE_PROXY_REQUEST_HEADER"),
          description: $t("TXT_CODE_COMMON_NAME_OF_THE_REQUEST_HEADER_CONTAINING_THE_CLIENTS_REAL_IP"),
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
          throw new Error($t("TXT_CODE_COMMON_REQUEST_BODY_ERROR"));
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
    ctx.logger.error($t("TXT_CODE_APP_HTTP_SETUP_ERROR"));
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
      // Wait for Socket.IO adapters to release the listener while existing HTTP replies finish.
      await websocket?.close();
      if (httpServer?.listening) httpServer.close();
    })());

  // Stop new requests before unloading routes; allow in-flight installation replies to finish.
  ctx.on("process/restarting", () => {
    reloading = true;
    return closeTransport();
  });

  httpServer.on("error", (err) => {
    ctx.logger.error($t("TXT_CODE_APP_HTTP_SETUP_ERROR"));
    ctx.logger.error(err);
    process.exit(1);
  });

  // Listen only after every plugin has registered its routes.
  ctx.on("ready", async () => {
    if (process.env.EPANEL_DEV === "1")
      closeDevelopment = await developmentRuntime()?.attach(httpServer!, config.prefix);
    const port = config.httpPort;
    httpServer?.listen(port, config.httpIp, () => {
      if (process.connected) process.send?.({ type: "elementspanel:ready" }, () => {});
    });
    ctx.logger.info("==================================");
    ctx.logger.info($t("TXT_CODE_APP_PANEL_STARTED"));
    let appHost = $t("TXT_CODE_DAEMON_ACCESS_URL", { port });
    if (config.ssl) appHost = appHost.replace("http", "https");
    ctx.logger.info(appHost);
    ctx.logger.info($t("TXT_CODE_APP_PORT_TIP", { port }));
    ctx.logger.info($t("TXT_CODE_APP_EXIT_TIP", { port }));
    ctx.logger.info("==================================");

    if (os.platform() === "win32" && process.argv.includes("--open")) {
      open(config.ssl ? `https://localhost:${port}/` : `http://localhost:${port}/`);
    }
  });

  ctx.on("dispose", async () => {
    await closeTransport();
    websocket = undefined;
    httpServer = undefined;
  });
}
