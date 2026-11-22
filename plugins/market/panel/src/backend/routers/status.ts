import type Koa from "koa";
import type { MarketRouter, PanelPluginContext } from "../types";
import { PANEL_PROCESS_ID } from "../service/restart";

export function registerMarketStatus(
  ctx: PanelPluginContext,
  router: MarketRouter,
  requireAdmin: Koa.Middleware
) {
  router.get("/plugin/restart-status", requireAdmin, (requestCtx: Koa.ParameterizedContext) => {
    requestCtx.set("Cache-Control", "no-store");
    const restarting = Boolean(ctx.plugins.restartPending);
    const manifest = ctx.plugins.frontendManifest();
    const inventory = ctx.plugins.inventory();
    const ready =
      !restarting &&
      ["runtime", "i18n", "console"].every(
        (id) =>
          manifest.some((entry) => entry.metadata.id === id && entry.entry) &&
          inventory.some((plugin) => plugin.id === id && plugin.state === "active")
      ) &&
      manifest.every(
        (entry) =>
          !entry.metadata.restartRequired &&
          (!entry.metadata.frontendRequired ||
            inventory.some(
              (plugin) => plugin.id === entry.metadata.id && plugin.state === "active"
            ))
      );
    requestCtx.body = {
      processId: PANEL_PROCESS_ID,
      restarting,
      ready
    };
  });
}
