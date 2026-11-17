import { Stream } from "stream";
import type Koa from "koa";
import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";

/** Apply the { status, data, time } envelope to API results and middleware errors. */
export function protocol(ctx: PanelPluginContext) {
  return async function protocolMiddleware(
    requestCtx: Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext, any>,
    next: Function
  ): Promise<void> {
    // Compatible with version 9.X API parameters
    if (requestCtx.query?.remote_uuid) requestCtx.query.daemonId = requestCtx.query.remote_uuid;
    if (requestCtx.query?.daemon_id) requestCtx.query.daemonId = requestCtx.query.daemon_id;

    try {
      await next();
    } catch (error: any) {
      requestCtx.body = error;
    }

    // Development asset middleware writes its response directly through Node.
    if (requestCtx.respond === false) return;

    if (ctx.settings.config.crossDomain) {
      requestCtx.response.set("Access-Control-Allow-Origin", "*");
      requestCtx.response.set("Access-Control-Allow-Methods", "PUT, POST, GET, DELETE, OPTIONS");
      requestCtx.response.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Content-Length, Authorization, Accept, X-Requested-With"
      );
    }
    requestCtx.response.set("X-Powered-By", "MCSManager");
    // Read the public version from the runtime's shared globals.
    requestCtx.response.set("X-Version", ctx.globals.get("version", "Unknown"));

    // Leave frontend plugin manifests as plain JSON arrays, outside the API envelope.
    if (requestCtx.path === "/plugins/manifest.json") {
      return;
    }

    if (requestCtx.body instanceof Error) {
      const error = requestCtx.body as Error & { status?: number; statusCode?: number };
      const status = error.status ?? error.statusCode ?? requestCtx.status;
      requestCtx.status = status >= 400 && status <= 599 ? status : 500;
      requestCtx.type = "application/json";
      requestCtx.body = JSON.stringify({
        status: requestCtx.status,
        data: error.message,
        time: new Date().getTime()
      });
      return;
    }

    if (requestCtx.body instanceof Stream || Buffer.isBuffer(requestCtx.body)) {
      return;
    }

    if ((requestCtx.status >= 300 && requestCtx.status < 400) ||
        requestCtx.status === 204 || requestCtx.status === 205) return;
    requestCtx.type = "application/json";

    if (requestCtx.status == 404) {
      requestCtx.status = 404;
      requestCtx.body = JSON.stringify({
        status: requestCtx.status,
        data: "[404] Not Found",
        time: new Date().getTime()
      });
      return;
    }

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

    if (requestCtx.body === null || requestCtx.body === undefined) {
      requestCtx.status = 500;
      requestCtx.body = JSON.stringify({
        status: 500,
        data: requestCtx.body || null,
        time: new Date().getTime()
      });
      return;
    }

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
