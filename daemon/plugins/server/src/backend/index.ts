import fs from "fs-extra";
import http from "http";
import https from "https";
import Koa from "koa";
import koaBody from "koa-body";
import { removeTrail } from "mcsmanager-common";
import path from "path";
import { Server } from "socket.io";
import { DAEMON_INDEX_HTML } from "../../../../src/const/index_html";
import type { DaemonPluginContext } from "../../../../src/plugin";
import { localeMessages } from "../i18n";
import { KoaService } from "./koa";
import { addGlobalSocket, delGlobalSocket, navigation, ProtocolService } from "./protocol";

// The daemon's network layer.
//
// Everything the daemon is reachable over lives here: the Koa application and
// its base middleware, the HTTP/HTTPS listener, the protocol handlers and
// the Socket.io server the panel actually talks to. Replacing this plugin
// replaces the daemon's transport and its protocol entry point.
//
// `ctx.koa` and `ctx.websocket` are set from inside `apply()`, which makes them
// this plugin's: they leave when it unloads. That is also why neither may appear
// in this plugin's own `inject` list.

export const inject = ["i18n", "settings", "middleware"];

export function apply(ctx: DaemonPluginContext) {
  ctx.i18n.define(localeMessages);

  const config = ctx.settings.config;
  const $t = ctx.i18n.$t;

  // Described, not drawn: a daemon plugin has no browser half, so the panel's
  // plugin manager renders this declaration with the same generic form it uses
  // for its own plugins. Nothing here is rebound live — the listener is fixed
  // when this plugin starts — so the port's description says to restart.
  ctx.inject(["settingsForm"], (settingsCtx) => settingsCtx.settingsForm.declare({
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
      // Checked before anything is written: a rejected request must not leave the
      // running configuration holding a port the daemon cannot bind.
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
  }));

  const app = new Koa();

  // Listen for Koa errors
  app.on("error", () => {
    // Block all Koa framework error
    // When Koa is attacked by a short connection flood, it is easy for error
    // messages to swipe the screen, which may indirectly affect the operation of
    // some applications
  });

  // Both ahead of koa-body: the rate limit has to wrap the request stream before
  // anything reads it, and an unauthorized upload has to be rejected before the
  // body parser writes it to disk. The runtime foundation owns the upload
  // subsystem they consult and hands the middleware over as a service.
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

  // Load Koa top-level middleware
  app.use(async (requestCtx, next) => {
    await next();
    // Because all HTTP requests can only be used by creating a task passport on the panel side, cross-domain requests are allowed, and security can also be guaranteed
    requestCtx.response.set("Access-Control-Allow-Origin", "*");
    requestCtx.response.set("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
    requestCtx.response.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Cookie, Accept-Encoding, User-Agent, Host, Referer, " +
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

  // Everything past this point belongs to plugins: `KoaService` mounts the two
  // composed stacks for middleware and routers.
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
    // A daemon that cannot build its listener is of no use to anyone, and
    // failing quietly would leave it running and unreachable.
    ctx.logger.error($t("TXT_CODE_app.httpSetupError"));
    ctx.logger.error(error);
    return process.exit(1);
  }

  httpServer.on("error", (err) => {
    ctx.logger.error($t("TXT_CODE_app.httpSetupError"));
    ctx.logger.error(err);
    process.exit(1);
  });

  // Initialize Websocket service to HTTP service
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
    httpServer.listen(config.port, config.ip);

    ctx.logger.info("----------------------------");
    ctx.logger.info($t("TXT_CODE_app.started"));
    ctx.logger.info($t("TXT_CODE_app.doc"));
    let appHost = $t("TXT_CODE_app.host", { port: config.port });
    if (config.ssl) appHost = appHost.replace("http", "https");
    ctx.logger.info(appHost);
    ctx.logger.info($t("TXT_CODE_app.configPathTip", { path: "" }));
    ctx.logger.info($t("TXT_CODE_app.password", { key: config.key }));
    ctx.logger.info($t("TXT_CODE_app.passwordTip"));
    ctx.logger.info($t("TXT_CODE_app.exitTip"));
    ctx.logger.info("----------------------------");
    console.log("");
  });

  // The daemon used to leak both until the process exited; they now close with
  // the plugin, and so on shutdown.
  ctx.on("dispose", () => {
    io.close();
    // `dispose` can run after a failed `ready` hook, before the listener ever
    // started. Node throws ERR_SERVER_NOT_RUNNING in that case, which would
    // mask the original startup error and make plugin unload non-idempotent.
    if (httpServer.listening) httpServer.close();
  });
}
