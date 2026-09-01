import fs from "fs-extra";
import http from "http";
import https from "https";
import Koa from "koa";
import koaBody, { HttpMethodEnum } from "koa-body";
import koaMount from "koa-mount";
import koaStatic from "koa-static";
import session from "koa-session";
import { removeTrail } from "mcsmanager-common";
import open from "open";
import os from "os";
import path from "path";
import { v4 } from "uuid";
import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";
import { KoaService } from "./koa";
import { preCheck } from "./precheck";
import { protocol } from "./protocol";

// The panel's web server.
//
// Everything about serving HTTP lives here: the Koa application, the base
// middleware stack, the static assets and the listener itself. The panel core
// keeps only its API routers and mounts them onto `ctx.koa.app` once this plugin
// has provided it, so replacing the web server means replacing this directory.
//
// `ctx.koa` is provided from inside `apply()`, which makes it this plugin's:
// unloading the server takes the Koa service with it, and every plugin that
// injected it is disposed in turn. That is also why `"koa"` must never appear in
// this plugin's own `inject` list.

const STATIC_MAX_AGE = 10 * 24 * 60 * 60;
const PLUGIN_FRONTEND_PATH = /^\/plugins\/([a-zA-Z0-9_-]+)\/frontend(?:\/|$)/;

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

export const inject = ["i18n", "settings", "globals", "plugins"];

export function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);

  const config = ctx.settings.config;
  const $t = ctx.i18n.$t;

  const app = new Koa({
    proxy: config.reverseProxyMode || false,
    proxyIpHeader: config.reverseProxyHeader || "X-Real-IP"
  });

  // Listen for Koa errors
  app.on("error", () => {
    // Block all Koa framework level events
    // When Koa is attacked by a short connection flood, it is easy for error
    // messages to swipe the screen, which may indirectly affect the operation of
    // some applications
  });

  // Ahead of koa-body, which is the whole point of it: an upload the caller may
  // not make must be rejected before the body parser writes it to disk.
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

  if (config.prefix !== "") {
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

  app.use(protocol(ctx));

  // Everything past this point belongs to the plugins: `KoaService` mounts the
  // two composed stacks a plugin adds middleware and routers to, which is why it
  // has to come before the static handlers and before the core's own routers.
  ctx.plugin(KoaService, app);

  const pluginDirectory = path.join(process.cwd(), "plugins");
  app.use(async (requestCtx, next) => {
    if (requestCtx.path === "/plugins/manifest.json") {
      requestCtx.set("Cache-Control", "no-store");
      requestCtx.type = "application/json";
      requestCtx.body = ctx.plugins.frontendManifest();
      return;
    }
    const match = requestCtx.path.match(PLUGIN_FRONTEND_PATH);
    if (!match) return next();
    const folder = match[1];
    if (!ctx.plugins.frontendManifest().some((plugin) => plugin.assetDirectory === folder)) {
      return next();
    }
    return koaMount(
      `/plugins/${folder}/frontend`,
      koaStatic(path.join(pluginDirectory, folder, "frontend"), { maxAge: STATIC_MAX_AGE })
    )(requestCtx, next);
  });

  app.use(koaStatic(path.join(process.cwd(), "public"), { maxAge: STATIC_MAX_AGE }));

  // The settings page for this plugin. `koa` is resolved here rather than
  // injected, because injecting a service the plugin itself provides would never
  // resolve.
  ctx.inject(["koa", "middleware", "roles"], (scoped) => {
    const router = scoped.koa.router("/api/server");
    const requireAdmin = scoped.middleware.permission({ level: scoped.roles.ADMIN });

    router.get("/settings", requireAdmin, async (requestCtx) => {
      const settings: Record<string, unknown> = {};
      for (const key of SETTING_KEYS) settings[key] = config[key];
      requestCtx.body = settings;
    });

    router.put("/settings", requireAdmin, async (requestCtx) => {
      const body = (requestCtx.request.body ?? {}) as Record<string, unknown>;

      // Checked before anything is written: a rejected request must not leave
      // the running configuration holding a port the panel cannot bind.
      const port = body.httpPort == null ? config.httpPort : Number(body.httpPort);
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error($t("TXT_CODE_e4d6cc20"));
      }

      // Empty is meaningful for the string fields — no listen address, no path
      // prefix, no certificate — so they are assigned whenever they are present
      // rather than validated as required.
      config.httpPort = port;
      if (body.httpIp != null) config.httpIp = String(body.httpIp);
      if (body.prefix != null) config.prefix = String(body.prefix);
      if (body.ssl != null) config.ssl = Boolean(body.ssl);
      if (body.sslPemPath != null) config.sslPemPath = String(body.sslPemPath);
      if (body.sslKeyPath != null) config.sslKeyPath = String(body.sslKeyPath);
      if (body.crossDomain != null) config.crossDomain = Boolean(body.crossDomain);
      if (body.reverseProxyMode != null) config.reverseProxyMode = Boolean(body.reverseProxyMode);
      if (body.reverseProxyHeader != null)
        config.reverseProxyHeader = String(body.reverseProxyHeader);

      ctx.settings.save();
      // Nothing is rebound live: the listener, the proxy mode and the path
      // prefix are all fixed when this plugin starts, so the panel has to be
      // restarted for a change to take effect — as it always has.
      requestCtx.body = true;
    });
  });

  // Bound on `ready`, not here: the core mounts its own routers after every
  // plugin has loaded, and the panel must not accept a request before they are
  // in place. cordis runs the hook immediately when the container is already
  // started, so reloading this plugin re-binds rather than going silent.
  let httpServer: http.Server | https.Server | undefined;

  ctx.on("ready", () => {
    if (config.ssl) {
      const options = {
        cert: fs.readFileSync(path.join(config.sslPemPath)),
        key: fs.readFileSync(path.join(config.sslKeyPath))
      };
      httpServer = https.createServer(options, app.callback());
    } else {
      httpServer = http.createServer(app.callback());
    }

    httpServer.on("error", (err) => {
      ctx.logger.error($t("TXT_CODE_app.httpSetupError"));
      ctx.logger.error(err);
      process.exit(1);
    });

    const port = config.httpPort;
    httpServer.listen(port, config.httpIp);
    ctx.logger.info("==================================");
    ctx.logger.info($t("TXT_CODE_app.panelStarted"));
    ctx.logger.info($t("TXT_CODE_app.reference"));
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

  // The core used to leak the listener until the process exited; it now closes
  // with the plugin, and so on shutdown.
  ctx.on("dispose", () => {
    httpServer?.close();
    httpServer = undefined;
  });
}
