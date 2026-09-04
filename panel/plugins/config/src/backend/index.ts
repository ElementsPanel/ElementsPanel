import type Koa from "koa";
import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";

// Panel side of the plugin manager page. The container owns the mechanism —
// `ctx.plugins` lists what is installed and persists the enable switch — and this
// plugin only exposes it over HTTP, because it owns the page that drives it.
//
// The same page administers each connected node's plugins. That half is a thin
// proxy onto the daemon-side `config` plugin: the daemon decides what it will
// switch off, and this plugin only carries the question there and the answer
// back. It lives inside `ctx.inject(["remote"], ...)` so that a panel without
// `plugins/node` still manages its own plugins.

/** Turning this plugin off would remove the page the request came from. */
const SELF = "config";

/**
 * Turning an essential plugin off would remove the interface or connection
 * that is needed to turn it back on.
 */
const ESSENTIAL = new Set(["console", "i18n", "server"]);

export const inject = ["koa", "i18n", "middleware", "roles", "plugins", "settingsForm"];

export function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);

  const router = ctx.koa.router("/api/plugins");
  const requireAdmin = ctx.middleware.permission({ level: ctx.roles.ADMIN });

  // Everything installed, disabled plugins included: the page needs to list one
  // to be able to enable it again.
  router.get("/", requireAdmin, async (requestCtx) => {
    const declared = new Set(ctx.settingsForm.declared());
    requestCtx.body = ctx.plugins.inventory().map((record) => ({
      ...record,
      // So the page can say "no configurable options" without a round trip.
      hasSettings: declared.has(record.id)
    }));
  });

  // One plugin's form and its current values, as its own backend describes them.
  // `null` when it declared nothing.
  router.get("/settings", requireAdmin, async (requestCtx) => {
    requestCtx.body = await ctx.settingsForm.read(String(requestCtx.request.query.id ?? ""));
  });

  router.put(
    "/settings",
    requireAdmin,
    ctx.middleware.validator({ query: { id: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      const id = String(requestCtx.request.query.id);
      // The plugin's own `write()` validates: this route knows nothing about
      // what any particular plugin's values mean.
      await ctx.settingsForm.write(id, (requestCtx.request.body ?? {}) as Record<string, unknown>);
      requestCtx.body = true;
    }
  );

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
      if (ESSENTIAL.has(id) && !enabled)
        throw new Error(ctx.i18n.$t("TXT_CODE_PLUGIN_ESSENTIAL_DISABLE"));
      requestCtx.body = await ctx.plugins.setEnabled(id, enabled);
    }
  );

  // The node half. `remote` is resolved here rather than injected at the top, so
  // removing `plugins/node` takes the node routes away and leaves the rest of the
  // page working.
  ctx.inject(["remote"], (scoped) => {
    const nodeRouter = scoped.koa.router("/api/plugins/node");
    const RemoteRequest = scoped.remote.Request;

    const nodeOf = (requestCtx: Koa.ParameterizedContext) => {
      const daemonId = String(requestCtx.request.query.daemonId ?? "");
      const node = scoped.remote.services.getInstance(daemonId);
      if (!node) throw new Error(ctx.i18n.$t("TXT_CODE_PLUGIN_NODE_NOT_FOUND"));
      return node;
    };

    // Which nodes there are to administer. Unavailable ones are listed too, so
    // the page can say why it cannot reach one instead of hiding it.
    nodeRouter.get("/list", requireAdmin, async (requestCtx) => {
      requestCtx.body = Array.from(scoped.remote.services.services.entries()).map(
        ([uuid, node]) => ({
          uuid,
          remarks: node.config.remarks,
          ip: node.config.ip,
          port: node.config.port,
          available: node.available
        })
      );
    });

    // Straight through to the daemon's own inventory.
    nodeRouter.get("/plugins", requireAdmin, async (requestCtx) => {
      requestCtx.body = await new RemoteRequest(nodeOf(requestCtx)).request("plugin/list");
    });

    nodeRouter.put(
      "/enabled",
      requireAdmin,
      ctx.middleware.validator({
        query: { daemonId: String },
        body: { id: String, enabled: Boolean }
      }),
      async (requestCtx: Koa.ParameterizedContext) => {
        const node = nodeOf(requestCtx);
        const id = String(requestCtx.request.body.id);
        const enabled = Boolean(requestCtx.request.body.enabled);
        // No id list is checked here: which of its plugins a daemon refuses to
        // switch off is the daemon's own business, and its refusal arrives as a
        // protocol error that the response protocol turns into this envelope.
        const record = await new RemoteRequest(node).request("plugin/enabled", { id, enabled });

        // A daemon binds its protocol events onto each socket as that socket
        // connects (`service/router.ts`), so a handler that has just appeared —
        // or just gone — is invisible to the connection we are holding. The node
        // is reconnected here, which is the only thing that makes the change
        // actually reachable; the daemon has already answered by now.
        node.refreshReconnect();

        requestCtx.body = record;
      }
    );

    // A daemon plugin's configuration, described by the plugin itself and
    // rendered by the same generic form. Nothing about the form lives here.
    nodeRouter.get(
      "/settings",
      requireAdmin,
      ctx.middleware.validator({ query: { daemonId: String, id: String } }),
      async (requestCtx: Koa.ParameterizedContext) => {
        requestCtx.body = await new RemoteRequest(nodeOf(requestCtx)).request("plugin/config", {
          id: String(requestCtx.request.query.id)
        });
      }
    );

    nodeRouter.put(
      "/settings",
      requireAdmin,
      ctx.middleware.validator({ query: { daemonId: String, id: String } }),
      async (requestCtx: Koa.ParameterizedContext) => {
        requestCtx.body = await new RemoteRequest(nodeOf(requestCtx)).request(
          "plugin/config/write",
          {
            id: String(requestCtx.request.query.id),
            values: (requestCtx.request.body ?? {}) as Record<string, unknown>
          }
        );
      }
    );
  });
}
