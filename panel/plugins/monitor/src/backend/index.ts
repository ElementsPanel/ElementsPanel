import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";
import { VisualDataHistory } from "./service/visual_data";

// Panel side of the data monitoring page. It owns the two rolling histories the
// page charts and the panel-wide operation log listing. `GET /api/overview`
// stays in the core — the nodes, the panel process and the host it runs on are
// what the rest of the panel reads it for — and this plugin contributes the
// `chart` field to it.

export const inject = ["i18n", "koa", "overview", "middleware", "roles", "operations", "remote"];

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

  // The panel-wide operation log the monitoring page lists. Per-instance log
  // storage and lifecycle reporting stay in the core; this plugin owns the
  // viewer and reads the core route only while its action is installed.
  const router = ctx.koa.router("/api/monitor");
  router.get(
    "/operation_logs",
    ctx.middleware.permission({ level: ctx.roles.ADMIN }),
    async (requestCtx) => {
      const limit = Number(requestCtx.query?.limit ?? 20);
      if (!Number.isFinite(limit) || limit <= 0 || limit > 200) {
        return requestCtx.throw(400, "Invalid limit value. It must be a number between 1 and 200.");
      }
      requestCtx.body = await ctx.operations.get(limit);
    }
  );
}
