import type { DaemonPluginContext } from "../../../../src/plugin";
import { localeMessages } from "../i18n";
import { SettingsFormService } from "./settings";

// Daemon side of the plugin manager. The daemon core owns the mechanism —
// `ctx.plugins` lists what is installed and persists the enable switch — and
// this plugin only exposes it over the protocol, because the panel's plugin
// manager page is what drives it.
//
// Both events are reachable only over an authenticated top-level session: the
// daemon's auth middleware rejects every event other than "auth" and "stream"
// until the panel has presented the daemon key.

/** Turning this plugin off would remove the events the request came in over. */
const SELF = "config";

/**
 * Turning the web server off would drop the connection the request arrived on,
 * and with it every event that could turn it back on.
 */
const ESSENTIAL = new Set(["i18n", "runtime", "server", "monitor"]);

export const inject = ["protocol", "i18n", "plugins"];

export function apply(ctx: DaemonPluginContext) {
  ctx.i18n.define(localeMessages);
  ctx.plugin(SettingsFormService);
  const settingsForm = ctx.get("settingsForm");
  if (!settingsForm) throw new Error("Daemon settings form service is unavailable.");

  ctx.protocol.on("plugin/list", (routerCtx) => {
    const declared = new Set(settingsForm.declared());
    ctx.protocol.response(
      routerCtx,
      ctx.plugins.inventory().map((record) => ({
        ...record,
        // So the panel can say "no configurable options" without a round trip.
        hasSettings: declared.has(record.id)
      }))
    );
  });

  ctx.protocol.on("plugin/enabled", async (routerCtx, data) => {
    try {
      const payload = (data ?? {}) as { id?: unknown; enabled?: unknown };
      const id = String(payload.id ?? "");
      const enabled = Boolean(payload.enabled);
      if (!id) throw new Error(ctx.i18n.$t("TXT_CODE_DAEMON_PLUGIN_ID_REQUIRED"));
      if (!enabled && id === SELF) {
        throw new Error(ctx.i18n.$t("TXT_CODE_DAEMON_PLUGIN_SELF_DISABLE"));
      }
      if (!enabled && ESSENTIAL.has(id)) {
        throw new Error(ctx.i18n.$t("TXT_CODE_DAEMON_PLUGIN_ESSENTIAL_DISABLE"));
      }
      ctx.protocol.response(routerCtx, await ctx.plugins.setEnabled(id, enabled));
    } catch (error: any) {
      // The panel turns this into the error its page reports; an unhandled throw
      // from an async handler would reach nobody, because `emitRouter` only
      // catches the synchronous part.
      ctx.protocol.responseError(routerCtx, error);
    }
  });

  // The configuration of one of this daemon's plugins, described by the plugin
  // itself. The panel renders the description; nothing about the form lives
  // there, which is the only way a daemon plugin can have a settings page at all.
  ctx.protocol.on("plugin/config", async (routerCtx, data) => {
    try {
      const id = String((data as { id?: unknown })?.id ?? "");
      if (!id) throw new Error(ctx.i18n.$t("TXT_CODE_DAEMON_PLUGIN_ID_REQUIRED"));
      ctx.protocol.response(routerCtx, await settingsForm.read(id));
    } catch (error: any) {
      ctx.protocol.responseError(routerCtx, error);
    }
  });

  ctx.protocol.on("plugin/config/write", async (routerCtx, data) => {
    try {
      const payload = (data ?? {}) as { id?: unknown; values?: unknown };
      const id = String(payload.id ?? "");
      if (!id) throw new Error(ctx.i18n.$t("TXT_CODE_DAEMON_PLUGIN_ID_REQUIRED"));
      const values = (payload.values ?? {}) as Record<string, unknown>;
      await settingsForm.write(id, values);
      ctx.protocol.response(routerCtx, true);
    } catch (error: any) {
      ctx.protocol.responseError(routerCtx, error);
    }
  });
}
