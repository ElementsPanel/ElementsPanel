import type Koa from "koa";
import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";

// Panel side of the plugin manager page. The container owns the mechanism —
// `ctx.plugins` lists what is installed and persists the enable switch — and this
// plugin only exposes it over HTTP, because it owns the page that drives it.

/** Turning this plugin off would remove the page the request came from. */
const SELF = "config";

export const inject = ["koa", "i18n", "middleware", "roles", "plugins"];

export function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);

  const router = ctx.koa.router("/api/plugins");
  const requireAdmin = ctx.middleware.permission({ level: ctx.roles.ADMIN });

  // Everything installed, disabled plugins included: the page needs to list one
  // to be able to enable it again.
  router.get("/", requireAdmin, async (requestCtx) => {
    requestCtx.body = ctx.plugins.inventory();
  });

  router.put(
    "/enabled",
    requireAdmin,
    ctx.middleware.validator({ body: { id: String, enabled: Boolean } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      const id = String(requestCtx.request.body.id);
      const enabled = Boolean(requestCtx.request.body.enabled);
      // Thrown rather than answered: the panel's response protocol turns an
      // Error into the standard envelope, which is what the page reports.
      if (id === SELF && !enabled) throw new Error(ctx.i18n.$t("TXT_CODE_PLUGIN_SELF_DISABLE"));
      requestCtx.body = await ctx.plugins.setEnabled(id, enabled);
    }
  );
}
