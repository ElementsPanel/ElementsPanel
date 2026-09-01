import { Stream } from "stream";
import type Koa from "koa";
import type { PanelPluginContext } from "../../../../src/app/plugin";

/**
 * The panel's response protocol: every API answer leaves as
 * `{ status, data, time }`, and a thrown `Error` becomes that envelope too.
 *
 * It wraps everything downstream, so it is part of the base stack rather than a
 * `ctx.koa.use()` registration — a plugin middleware added before it would
 * otherwise escape the envelope.
 */
export function protocol(ctx: PanelPluginContext) {
  return async function protocolMiddleware(
    requestCtx: Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext, any>,
    next: Function
  ): Promise<void> {
    // Compatible with version 9.X API parameters
    if (requestCtx.query?.remote_uuid) requestCtx.query.daemonId = requestCtx.query.remote_uuid;
    if (requestCtx.query?.daemon_id) requestCtx.query.daemonId = requestCtx.query.daemon_id;

    // Pass the next middleware, any errors and return data will be processed
    // according to the response protocol
    try {
      await next();
    } catch (error: any) {
      requestCtx.body = error;
    }

    if (ctx.settings.config.crossDomain) {
      requestCtx.response.set("Access-Control-Allow-Origin", "*");
      requestCtx.response.set("Access-Control-Allow-Methods", "PUT, POST, GET, DELETE, OPTIONS");
      requestCtx.response.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Content-Length, Authorization, Accept, X-Requested-With"
      );
    }
    requestCtx.response.set("X-Powered-By", "MCSManager");
    // The core's `getVersion()` reads exactly this, and `ctx.globals` is the
    // same store, so the plugin needs nothing from the core to report it.
    requestCtx.response.set("X-Version", ctx.globals.get("version", "Unknown"));

    // Frontend plugin manifests are regular JSON resources, not API responses.
    // Keep the array shape intact so the browser can discover compiled plugins.
    if (requestCtx.path === "/plugins/manifest.json") {
      return;
    }

    // Serialize and display when sending Error class
    if (requestCtx.body instanceof Error) {
      const error = requestCtx.body as Error;
      requestCtx.status = 500;
      requestCtx.body = JSON.stringify({
        status: requestCtx.status,
        data: error.message,
        time: new Date().getTime()
      });
      return;
    }

    // release all data streams
    if (requestCtx.body instanceof Stream) {
      return;
    }

    // 404 error code
    if (requestCtx.status == 404) {
      requestCtx.status = 404;
      requestCtx.body = JSON.stringify({
        status: requestCtx.status,
        data: "[404] Not Found",
        time: new Date().getTime()
      });
      return;
    }

    // When the response text is a string, use normal formatting
    if (typeof requestCtx.body == "string") {
      const status = requestCtx.status;
      const data = requestCtx.body;
      requestCtx.body = JSON.stringify({
        status,
        data,
        time: new Date().getTime()
      });
      return;
    }

    // When the return result is empty, display processing failed
    if (requestCtx.body === null || requestCtx.body === false || requestCtx.body === undefined) {
      requestCtx.status = 500;
      requestCtx.body = JSON.stringify({
        status: 500,
        data: requestCtx.body || null,
        time: new Date().getTime()
      });
      return;
    }

    // normal data
    if (requestCtx.status == 200) {
      requestCtx.body = JSON.stringify({
        status: requestCtx.status,
        data: requestCtx.body,
        time: new Date().getTime()
      });
      return;
    }
  };
}
