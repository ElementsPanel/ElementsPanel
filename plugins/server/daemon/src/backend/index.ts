import fs from "fs-extra";
import http from "http";
import https from "https";
import Koa from "koa";
import koaBody from "koa-body";
import { removeTrail } from "mcsmanager-common";
import path from "path";
import { Server } from "socket.io";
import { DAEMON_INDEX_HTML } from "./static/index_html";
import type { DaemonPluginContext } from "../../../../../core/daemon/src/plugin";
import { localeMessages } from "../i18n";
import { KoaService } from "./koa";
import { addGlobalSocket, delGlobalSocket, navigation, ProtocolService } from "./protocol";

// Own the daemon HTTP and Socket.IO transports.
// Provide koa and websocket here; do not declare them as injected dependencies.

export const inject = ["i18n", "settings", "middleware"];

export function apply(ctx: DaemonPluginContext) {
  ctx.i18n.define(localeMessages);

  const config = ctx.settings.config;
  const $t = ctx.i18n.$t;

  // Declare daemon settings for the panel form; listener changes require restart.
  ctx.inject(["settingsForm"], (settingsCtx) =>
    settingsCtx.settingsForm.declare({
      restartRequired: true,
      fields: () => [
        {
          key: "port",
          type: "number",
          title: $t("TXT_CODE_DSERVER_PORT"),
          description: $t("TXT_CODE_DSERVER_PORT_TIP"),
          min: 1,
          max: 65535
        },
        {
          key: "ip",
          type: "string",
          title: $t("TXT_CODE_DSERVER_IP"),
          description: $t("TXT_CODE_DSERVER_IP_TIP")
        },
        {
          key: "prefix",
          type: "string",
          title: $t("TXT_CODE_DSERVER_PREFIX"),
          description: $t("TXT_CODE_DSERVER_PREFIX_TIP")
        },
        {
          key: "ssl",
          type: "boolean",
          title: $t("TXT_CODE_DSERVER_SSL"),
          description: $t("TXT_CODE_DSERVER_SSL_TIP")
        },
        {
          key: "sslPemPath",
          type: "string",
          title: $t("TXT_CODE_DSERVER_SSL_PEM"),
          description: $t("TXT_CODE_DSERVER_PATH_TIP"),
          visibleWhen: "ssl"
        },
        {
          key: "sslKeyPath",
          type: "string",
          title: $t("TXT_CODE_DSERVER_SSL_KEY"),
          description: $t("TXT_CODE_DSERVER_PATH_TIP"),
          visibleWhen: "ssl"
        }
      ],
      read: () => ({
        port: config.port,
        ip: config.ip,
        prefix: config.prefix,
        ssl: config.ssl,
        sslPemPath: config.sslPemPath,
        sslKeyPath: config.sslKeyPath
      }),
      write: (values) => {
        // Validate before changing live configuration.
        const port = values.port == null ? config.port : Number(values.port);
        if (!Number.isInteger(port) || port <= 0 || port > 65535) {
          throw new Error($t("TXT_CODE_DSERVER_PORT_TIP"));
        }
        config.port = port;
        if (values.ip != null) config.ip = String(values.ip);
        if (values.prefix != null) config.prefix = String(values.prefix);
        if (values.ssl != null) config.ssl = Boolean(values.ssl);
        if (values.sslPemPath != null) config.sslPemPath = String(values.sslPemPath);
        if (values.sslKeyPath != null) config.sslKeyPath = String(values.sslKeyPath);
        ctx.settings.save();
      }
    })
  );

  const app = new Koa();
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

  // Apply upload authorization and rate limits before the body parser reads or writes files.
  app.use(ctx.middleware.uploadSpeedLimit);
  app.use(ctx.middleware.uploadFileCheck);

  app.use(
    koaBody({
      multipart: true,
      formidable: {
        maxFileSize: 1024 * 1024 * 100, // 100MB
        maxFiles: 1
      },
      jsonLimit: "10mb",
      onError(err) {
        ctx.logger.error("koaBody Lib Error:", err);
      }
    })
  );

  app.use(async (requestCtx, next) => {
    await next();
    // Allow cross-origin transfers because each request requires a panel-issued passport.
    requestCtx.response.set("Access-Control-Allow-Origin", "*");
    requestCtx.response.set("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
    requestCtx.response.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Cookie, Accept-Encoding, User-Agent, Host, Referer, " +
        "X-Requested-With, Accept, Accept-Language, Cache-Control, Connection"
    );
    requestCtx.response.set("X-Power-by", "MCSManager");
  });

  if (config.prefix != "") {
    const prefix = config.prefix;
    app.use(async (requestCtx, next) => {
      if (requestCtx.url.startsWith(prefix)) {
        const orig = requestCtx.url;
        requestCtx.url = requestCtx.url.slice(prefix.length);
        if (!requestCtx.url.startsWith("/")) {
          requestCtx.url = "/" + requestCtx.url;
        }
        await next();
        requestCtx.url = orig;
      } else {
        requestCtx.redirect(removeTrail(prefix, "/") + requestCtx.url);
      }
    });
  }

  // Mount plugin middleware and router dispatchers after the base stack.
  ctx.plugin(KoaService, app);
  ctx.plugin(ProtocolService);

  ctx.inject(["koa"], (koaCtx) => {
    const rootRouter = koaCtx.koa.router();
    rootRouter.all("/", async (requestCtx) => {
      requestCtx.body = DAEMON_INDEX_HTML;
      requestCtx.status = 200;
    });
  });

  let httpServer: http.Server | https.Server;
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
    ctx.logger.error($t("TXT_CODE_APP_HTTP_SETUP_ERROR"));
    ctx.logger.error(error);
    return process.exit(1);
  }

  httpServer.on("error", (err) => {
    ctx.logger.error($t("TXT_CODE_APP_HTTP_SETUP_ERROR"));
    ctx.logger.error(err);
    process.exit(1);
  });

  const io = new Server(httpServer, {
    serveClient: false,
    pingInterval: 1000 * 20,
    pingTimeout: 1000 * 10,
    cookie: false,
    path: removeTrail(config.prefix, "/") + "/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE"]
    },
    maxHttpBufferSize: 1e8
  });

  // Handed over before anything listens; this plugin attaches its connection
  // handler before the first client can arrive.
  ctx.set("websocket", { io });
  let closing: Promise<void> | undefined;
  const closeTransport = () =>
    (closing ??= (async () => {
      await io.close();
      // Disposal can also follow a startup failure before listen() ever ran.
      if (httpServer.listening) httpServer.close();
    })());

  ctx.on("process/restarting", () => {
    reloading = true;
    return closeTransport();
  });

  io.on("connection", (socket) => {
    addGlobalSocket(socket);
    navigation(socket, ctx.logger);
    socket.on("error", (error) => ctx.logger.error("Connection(): Socket.io Error:", error));
    socket.on("disconnect", () => {
      delGlobalSocket(socket);
      for (const name of socket.eventNames()) socket.removeAllListeners(name);
    });
  });

  // Bound on `ready`, so the daemon does not accept a request before the plugin
  // router, protocol handlers and every dependent plugin are in place.
  ctx.on("ready", () => {
    httpServer.listen(config.port, config.ip, () => {
      if (process.connected) process.send?.({ type: "elementspanel:ready" }, () => {});
    });

    ctx.logger.info("----------------------------");
    ctx.logger.info($t("TXT_CODE_APP_STARTED"));
    let appHost = $t("TXT_CODE_DAEMON_ACCESS_URL", { port: config.port });
    if (config.ssl) appHost = appHost.replace("http", "https");
    ctx.logger.info(appHost);
    ctx.logger.info($t("TXT_CODE_APP_CONFIG_PATH_TIP", { path: "" }));
    ctx.logger.info($t("TXT_CODE_DAEMON_ACCESS_KEY", { key: config.key }));
    ctx.logger.info($t("TXT_CODE_DAEMON_ACCESS_KEY_HINT"));
    ctx.logger.info($t("TXT_CODE_APP_EXIT_TIP"));
    ctx.logger.info("----------------------------");
    console.log("");
  });

  // Close both transports when the server plugin unloads.
  ctx.on("dispose", async () => {
    // Wait for Socket.IO's adapters to close and release the listening socket
    // before a new revision tries to bind the same port.
    await closeTransport();
  });
}
