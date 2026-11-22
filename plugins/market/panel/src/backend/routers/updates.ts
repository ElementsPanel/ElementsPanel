import type Koa from "koa";
import type { MarketRouter, MarketServices, PanelPluginContext } from "../types";
import type { PluginSide } from "../service/plugin_market";
import type { PluginUpdateRequest } from "../../updates";
import { withPluginLock, withPluginLocks } from "../service/operation_lock";
import { selectedDaemon } from "./target";

export function registerMarketUpdates(
  ctx: PanelPluginContext,
  router: MarketRouter,
  requireAdmin: Koa.Middleware,
  services: MarketServices
) {
  const { validator } = ctx.middleware;
  const { responseFinished, reportPanelRestart } = services.restart;
  const { checkUpdates, updateBatch, updateRuntime, updatePlugin } = services.updates;
  const { reportPluginMarketError } = services.catalogue;
  router.get("/plugin/updates", requireAdmin, async (requestCtx) => {
    requestCtx.body = await checkUpdates(selectedDaemon(requestCtx));
  });
  router.post(
    "/plugin/update-batch",
    requireAdmin,
    reportPanelRestart,
    validator({ body: { updates: Array } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      const { updates } = requestCtx.request.body as { updates: PluginUpdateRequest[] };
      if (
        !Array.isArray(updates) ||
        !updates.length ||
        updates.length > 2000 ||
        updates.some(
          (update) =>
            !update ||
            typeof update.pluginId !== "string" ||
            typeof update.version !== "string" ||
            typeof update.panel !== "boolean" ||
            !Array.isArray(update.daemonIds) ||
            (update.runtime !== undefined &&
              update.runtime !== "panel" &&
              update.runtime !== "daemon")
        )
      ) {
        requestCtx.status = 400;
        return;
      }
      let finishBatch!: () => void;
      const finished = new Promise<void>((resolve) => {
        finishBatch = resolve;
      });
      const reloadAfter = Promise.all([responseFinished(requestCtx), finished]).then(() => {});
      ctx.plugins.deferRestartUntil(reloadAfter);
      try {
        requestCtx.body = await withPluginLocks(
          updates.map((update) =>
            update.runtime ? `@elementspanel/${update.runtime}` : update.pluginId
          ),
          () => updateBatch(updates, reloadAfter)
        );
      } finally {
        finishBatch();
      }
    }
  );

  router.post(
    "/runtime/update",
    requireAdmin,
    reportPanelRestart,
    validator({ body: { side: String, version: String, daemonIds: Array } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      ctx.plugins.deferRestartUntil?.(responseFinished(requestCtx));
      const body = requestCtx.request.body as {
        side: PluginSide;
        version: string;
        daemonIds: string[];
      };
      if (body.side !== "panel" && body.side !== "daemon") {
        requestCtx.status = 400;
        return;
      }
      try {
        requestCtx.body = await withPluginLock(`@elementspanel/${body.side}`, () =>
          updateRuntime(body, responseFinished(requestCtx))
        );
      } catch (error) {
        reportPluginMarketError(error);
      }
    }
  );
  router.post(
    "/plugin/update",
    requireAdmin,
    reportPanelRestart,
    validator({ body: { pluginId: String, version: String, panel: Boolean, daemonIds: Array } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      ctx.plugins.deferRestartUntil?.(responseFinished(requestCtx));
      const body = requestCtx.request.body as {
        pluginId: string;
        version: string;
        panel: boolean;
        daemonIds: string[];
      };
      try {
        requestCtx.body = await withPluginLock(body.pluginId, () =>
          updatePlugin(body, responseFinished(requestCtx))
        );
      } catch (error) {
        reportPluginMarketError(error, "NPM_FAILED");
      }
    }
  );
}
