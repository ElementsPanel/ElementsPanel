import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import { localeMessages } from "../i18n";
import { VisualDataHistory } from "./service/visual_data";

// Optional monitoring contributes history and exposes the audit log view.

export const inject = ["i18n", "koa", "middleware", "roles", "operations", "overview"];

type OperationLogEntry = Record<string, any>;

/**
 * Older log entries only carry the instance id, so the audit view cannot show
 * a name. Resolve the missing ones through the optional instance provider.
 */
async function attachInstanceNames(ctx: PanelPluginContext, entries: OperationLogEntry[]) {
  const provider = ctx.get("instances");
  if (!provider || !Array.isArray(entries) || entries.length === 0) return entries;

  const missing = new Map<string, { instanceUuid: string; daemonId: string }>();
  for (const entry of entries) {
    const instanceId = entry?.instance_id;
    const daemonId = entry?.daemon_id;
    if (!instanceId || !daemonId) continue;
    if (entry.instance_name && entry.instance_name !== instanceId) continue;
    missing.set(`${daemonId}:${instanceId}`, { instanceUuid: instanceId, daemonId });
  }
  if (missing.size === 0) return entries;

  try {
    const details = await provider.getDetails([...missing.values()]);
    const names = new Map<string, string>();
    for (const detail of details) {
      if (detail?.nickname) names.set(`${detail.daemonId}:${detail.instanceUuid}`, String(detail.nickname));
    }
    return entries.map((entry) => {
      const name = names.get(`${entry?.daemon_id}:${entry?.instance_id}`);
      return name ? { ...entry, instance_name: name } : entry;
    });
  } catch (error) {
    // The audit view must still render when the instance provider is unavailable.
    return entries;
  }
}

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
      requestCtx.body = await attachInstanceNames(ctx, await ctx.operations.get(limit));
    }
  );
}
