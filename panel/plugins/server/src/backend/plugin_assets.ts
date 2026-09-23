import { PassThrough } from "stream";
import { createHash } from "crypto";
import type Koa from "koa";
import koaMount from "koa-mount";
import koaStatic from "koa-static";
import type { PanelPluginContext } from "../../../../src/app/plugin";

const STATIC_MAX_AGE = 10 * 24 * 60 * 60;
const PLUGIN_FRONTEND_PATH = /^\/plugins\/([a-zA-Z0-9_-]+)(?:@([a-f0-9]{24}))?\/frontend(?:\/|$)/;

/** Same-port plugin assets and graph notifications, with no filesystem paths in public metadata. */
export function pluginAssets(ctx: PanelPluginContext): Koa.Middleware {
  const streams = new Set<PassThrough>();
  const publicManifest = () =>
    ctx.plugins.frontendManifest().map(({ frontendDirectory, ...entry }) => entry);
  const graphRevision = () =>
    createHash("sha256").update(JSON.stringify(publicManifest())).digest("hex");
  let lastRevision = "";
  ctx.setInterval(() => {
    try {
      const revision = graphRevision();
      const frame =
        revision === lastRevision ? ": heartbeat\n\n" : `data: ${JSON.stringify({ revision })}\n\n`;
      lastRevision = revision;
      for (const stream of streams) if (!stream.write(frame)) stream.destroy();
    } catch (error) {
      ctx.logger.warn("Failed to refresh plugin graph", error);
    }
  }, 2000);
  ctx.effect(() => () => {
    for (const stream of streams) stream.end();
    streams.clear();
  });
  return async (requestCtx, next) => {
    if (requestCtx.method !== "GET" && requestCtx.method !== "HEAD") return next();
    if (requestCtx.path === "/plugins/manifest.json") {
      requestCtx.set("Cache-Control", "no-store");
      requestCtx.type = "application/json";
      requestCtx.body = publicManifest();
      return;
    }
    if (requestCtx.path === "/plugins/events" && requestCtx.method === "GET") {
      requestCtx.set("Cache-Control", "no-cache, no-transform");
      requestCtx.set("X-Accel-Buffering", "no");
      requestCtx.type = "text/event-stream";
      const stream = new PassThrough();
      streams.add(stream);
      const close = () => {
        streams.delete(stream);
        stream.destroy();
      };
      requestCtx.res.once("close", close);
      stream.once("close", () => {
        streams.delete(stream);
        requestCtx.res.off("close", close);
      });
      stream.write(`data: ${JSON.stringify({ revision: graphRevision() })}\n\n`);
      requestCtx.body = stream;
      return;
    }
    const match = requestCtx.path.match(PLUGIN_FRONTEND_PATH);
    if (!match) return next();
    const folder = match[1];
    const revision = match[2];
    const plugin = ctx.plugins.frontendManifest().find((entry) => entry.assetDirectory === folder);
    if (!plugin || (revision && revision !== plugin.revision)) {
      requestCtx.status = 404;
      return;
    }
    // Resolve the directory from discovery, including data/plugins and legacy installations.
    return koaMount(
      `/plugins/${folder}${revision ? `@${revision}` : ""}/frontend`,
      koaStatic(plugin.frontendDirectory, { maxAge: revision ? STATIC_MAX_AGE : 0 })
    )(requestCtx, next);
  };
}
