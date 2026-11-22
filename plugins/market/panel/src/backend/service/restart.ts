import type Koa from "koa";
import { performance } from "perf_hooks";
import type { PanelPluginContext } from "../types";

// Foundation updates replace the worker and restore instances before the node reconnects.
export const NODE_RESTART_TIMEOUT_MS = 5 * 60 * 1000;
// Stable across plugin reloads, distinct for each panel worker.
export const PANEL_PROCESS_ID = `${process.pid}:${performance.timeOrigin}`;

export function createMarketRestart(ctx: PanelPluginContext) {
  async function reportPanelRestart(requestCtx: Koa.ParameterizedContext, next: Koa.Next) {
    await next();
    const body = requestCtx.request.body as { pluginId?: string; panel?: boolean } | undefined;
    const pluginId = body?.pluginId ?? requestCtx.query.pluginId;
    const panelNeedsRestart =
      ctx.plugins?.restartPending ||
      (typeof pluginId === "string" &&
        body?.panel !== false &&
        requestCtx.query.panel !== "false" &&
        ctx.plugins
          ?.inventory()
          .some((plugin) => plugin.id === pluginId && plugin.state === "restart-required"));
    if (panelNeedsRestart && requestCtx.body && typeof requestCtx.body === "object") {
      requestCtx.body = {
        ...requestCtx.body,
        panelRestart: { processId: PANEL_PROCESS_ID }
      };
    }
  }

  function responseFinished(requestCtx: Koa.ParameterizedContext): Promise<void> {
    const response = requestCtx.res;
    if (!response || response.writableFinished || response.destroyed) return Promise.resolve();
    return new Promise((resolve) => {
      const release = () => {
        response.off("finish", release);
        response.off("close", release);
        resolve();
      };
      response.once("finish", release);
      response.once("close", release);
    });
  }

  return { reportPanelRestart, responseFinished };
}
