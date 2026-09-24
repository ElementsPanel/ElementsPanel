import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";
import { VisualDataHistory } from "./service/visual_data";

// Optional monitoring contributes history and exposes the audit log view.

export const inject = ["i18n", "koa", "middleware", "roles", "operations", "overview"];

export function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);
  const history = new VisualDataHistory(ctx);

  // Counted here rather than in the core response middleware: the request rate
  // only exists to be charted. Runs for every request regardless of where in
  // the middleware chain the plugin was mounted.
  ctx.koa.use(async (requestCtx, next) => {
    if (requestCtx.url.startsWith("/api/")) history.addRequestCount();
    await next();
  });

  ctx.overview.provide(() => ({ chart: history.toChart() }));

  // The panel-wide operation log the monitoring page lists.
  const router = ctx.koa.router("/api/monitor");
  router.get(
    "/operation_logs",
    ctx.middleware.permission({ level: ctx.roles.ADMIN }),
    async (requestCtx) => {
      const limit = Number(requestCtx.query?.limit ?? 20);
      if (!Number.isInteger(limit) || limit <= 0 || limit > 200) {
        return requestCtx.throw(400, "Invalid limit value. It must be a number between 1 and 200.");
      }
      requestCtx.body = await ctx.operations.get(limit);
    }
  );
}
