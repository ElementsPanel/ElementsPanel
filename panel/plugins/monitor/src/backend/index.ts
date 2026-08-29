import Router from "@koa/router";
import type { PanelPluginContext } from "../../../../src/app/plugins";
import { localeMessages } from "../i18n";
import { VisualDataHistory } from "./service/visual_data";

// Panel side of the data monitoring page. It owns the two rolling histories the
// page charts and the panel-wide operation log listing. `GET /api/overview`
// stays in the core — the nodes, the panel process and the host it runs on are
// what the rest of the panel reads it for — and this plugin contributes the
// `chart` field to it.

let history: VisualDataHistory | undefined;

export function setup(context: PanelPluginContext) {
  context.registerLocaleMessages(localeMessages);

  history = new VisualDataHistory(context);
  history.start();

  // Counted here rather than in the core response middleware: the request rate
  // only exists to be charted. Runs for every request regardless of where in
  // the middleware chain the plugin was mounted.
  context.registerMiddleware(async (ctx, next) => {
    if (ctx.url.startsWith("/api/")) history?.addRequestCount();
    await next();
  });

  context.registerOverviewProvider(() => ({ chart: history?.toChart() }));

  const router = new Router({ prefix: "/api/monitor" });

  // The panel-wide operation log the monitoring page lists. Per-instance logs
  // stay in the core: the instance pages read those whether or not the
  // monitoring page exists.
  router.get(
    "/operation_logs",
    context.middleware.permission({ level: context.roles.ADMIN }),
    async (ctx) => {
      const limit = Number(ctx.query?.limit ?? 20);
      if (!Number.isFinite(limit) || limit <= 0 || limit > 200) {
        return ctx.throw(400, "Invalid limit value. It must be a number between 1 and 200.");
      }
      ctx.body = await context.services.operationLogger.get(limit);
    }
  );

  context.registerRouter(router);
}

export function dispose() {
  history?.stop();
  history = undefined;
}
