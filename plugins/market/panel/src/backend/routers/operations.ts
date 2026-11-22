import type Koa from "koa";
import type { MarketRouter, MarketServices, PanelPluginContext } from "../types";
import { withPluginLock } from "../service/operation_lock";

export function registerMarketOperations(
  ctx: PanelPluginContext,
  router: MarketRouter,
  requireAdmin: Koa.Middleware,
  services: MarketServices
) {
  const { responseFinished, reportPanelRestart } = services.restart;
  const { install, uninstall } = services.operations;
  const { reportPluginMarketError } = services.catalogue;
  router.post(
    "/plugin/install",
    requireAdmin,
    reportPanelRestart,
    ctx.middleware.speedLimit(3),
    ctx.middleware.validator({ body: { pluginId: String, name: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      ctx.plugins.deferRestartUntil?.(responseFinished(requestCtx));
      const body = (requestCtx.request.body ?? {}) as Record<string, unknown>;
      try {
        requestCtx.body = await withPluginLock(String(body.pluginId), () =>
          install(body, responseFinished(requestCtx))
        );
      } catch (error) {
        reportPluginMarketError(error, "NPM_FAILED");
      }
    }
  );
  router.delete(
    "/plugin/uninstall",
    requireAdmin,
    reportPanelRestart,
    ctx.middleware.validator({ query: { pluginId: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      const query = requestCtx.request.query;
      try {
        requestCtx.body = await withPluginLock(String(query.pluginId), () => uninstall(query));
      } catch (error) {
        reportPluginMarketError(error, "NPM_FAILED");
      }
    }
  );
}
