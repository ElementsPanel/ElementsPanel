import {
  installNpmPlugin,
  PLUGIN_API_VERSION,
  uninstallNpmPlugin
} from "mcsmanager-common";
import type { DaemonPluginContext } from "../../../../src/plugin";
import { localeMessages } from "../i18n";
import { SettingsFormService } from "./settings";

// Daemon side of the plugin manager. The daemon core owns the mechanism —
// `ctx.plugins` lists what is installed and persists the enable switch — and
// this plugin only exposes it over the protocol, because the panel's plugin
// manager page is what drives it.
//
// Every event is reachable only over an authenticated top-level session: the
// daemon's auth middleware rejects every event other than "auth" and "stream"
// until the panel has presented the daemon key.

/** Turning this plugin off would remove the events the request came in over. */
const SELF = "config";

/**
 * Turning the web server off would drop the connection the request arrived on,
 * and with it every event that could turn it back on.
 */
const ESSENTIAL = new Set(["i18n", "storage", "runtime", "server"]);
const PLUGIN_GROUPS_CATEGORY = "PluginGroups";
const PLUGIN_GROUPS_ID = "config";

interface PluginGroup {
  id: string;
  name: string;
  pluginIds: string[];
}

class StoredPluginGroups {
  groups: PluginGroup[] = [];
}

function normalizePluginGroups(input: unknown): PluginGroup[] {
  if (!Array.isArray(input)) throw new Error("Plugin groups must be an array.");
  if (input.length > 100) throw new Error("Too many plugin groups.");
  return input.map((value) => {
    if (!value || typeof value !== "object") throw new Error("Invalid plugin group.");
    const group = value as Partial<PluginGroup>;
    const id = String(group.id ?? "").trim();
    const name = String(group.name ?? "").trim();
    if (!id || id.length > 128 || !name || name.length > 200) {
      throw new Error("Invalid plugin group.");
    }
    if (
      !Array.isArray(group.pluginIds) ||
      group.pluginIds.length > 2000 ||
      group.pluginIds.some((pluginId) => typeof pluginId !== "string")
    ) {
      throw new Error("Invalid plugin group plugins.");
    }
    return {
      id,
      name,
      pluginIds: [...new Set(group.pluginIds.map((pluginId) => pluginId.trim()).filter(Boolean))]
    };
  });
}

export const inject = ["protocol", "i18n", "plugins", "storage", "overview"];

export function apply(ctx: DaemonPluginContext) {
  ctx.i18n.define(localeMessages);
  ctx.plugin(SettingsFormService);
  const settingsForm = ctx.get("settingsForm");
  if (!settingsForm) throw new Error("Daemon settings form service is unavailable.");

  // The panel's node page compares daemon plugins against its own inventory, so
  // the id/version pairs ride along on the overview payload it already polls.
  // `dual` marks a two-sided plugin: if its panel half is absent there, the node
  // page reports the plugin as missing rather than daemon-only by design.
  // Best-effort: hosts without an overview service (tests, minimal daemons)
  // keep loading this plugin without the extra payload.
  ctx.overview?.provide(() => ({
    plugins: ctx.plugins
      .inventory()
      .map((record) => ({ id: record.id, version: record.version, dual: record.dual }))
  }));

  // Unloads and deletes one installed plugin package. What may be removed —
  // essential plugins, development sources — is the loader's own decision; its
  // refusal arrives as a protocol error the panel's page reports.
  ctx.protocol.on("plugin/remove", async (routerCtx, data) => {
    try {
      const id = String((data as { id?: unknown })?.id ?? "");
      if (!id) throw new Error(ctx.i18n.$t("TXT_CODE_DAEMON_PLUGIN_ID_REQUIRED"));
      await ctx.plugins.remove(id);
      ctx.protocol.response(routerCtx, { removed: true });
    } catch (error: any) {
      ctx.protocol.responseError(routerCtx, error);
    }
  });

  ctx.protocol.on("plugin/capabilities", (routerCtx) => {
    ctx.protocol.response(routerCtx, { api: PLUGIN_API_VERSION });
  });

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

  // A plugin installed from the market is an npm dependency of the daemon's
  // installation project. npm runs on the machine that will load the plugin, so
  // the panel only names the package and the version.
  ctx.protocol.on("plugin/npm/install", async (routerCtx, data) => {
    try {
      const payload = (data ?? {}) as {
        name?: unknown;
        pluginId?: unknown;
        version?: unknown;
      };
      const record = await installNpmPlugin({
        name: String(payload.name ?? ""),
        pluginId: String(payload.pluginId ?? ""),
        version: String(payload.version ?? ""),
        side: "daemon"
      });
      ctx.protocol.response(routerCtx, record);
    } catch (error: any) {
      ctx.protocol.responseError(routerCtx, error);
    }
  });

  ctx.protocol.on("plugin/npm/uninstall", async (routerCtx, data) => {
    try {
      const pluginId = String((data as { pluginId?: unknown })?.pluginId ?? "");
      const removed = await uninstallNpmPlugin(pluginId);
      ctx.protocol.response(routerCtx, { removed, pluginId });
    } catch (error: any) {
      ctx.protocol.responseError(routerCtx, error);
    }
  });

  // Re-scan the plugin directories for a plugin that arrived while the daemon
  // was running. The panel reconnects after this response so protocol handlers
  // from a newly loaded plugin are bound to a fresh socket.
  ctx.protocol.on("plugin/reload", async (routerCtx) => {
    try {
      await ctx.plugins.reload();
      ctx.protocol.response(routerCtx, ctx.plugins.inventory());
    } catch (error: any) {
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
      ctx.protocol.response(routerCtx, await settingsForm.write(id, values));
    } catch (error: any) {
      ctx.protocol.responseError(routerCtx, error);
    }
  });

  ctx.protocol.on("plugin/groups", (routerCtx) => {
    try {
      const stored = ctx.storage.load(
        PLUGIN_GROUPS_CATEGORY,
        StoredPluginGroups,
        PLUGIN_GROUPS_ID
      ) as StoredPluginGroups | null;
      ctx.protocol.response(routerCtx, stored?.groups ?? []);
    } catch (error: any) {
      ctx.protocol.responseError(routerCtx, error);
    }
  });

  ctx.protocol.on("plugin/groups/write", (routerCtx, data) => {
    try {
      const groups = normalizePluginGroups((data as { groups?: unknown })?.groups);
      ctx.storage.store(PLUGIN_GROUPS_CATEGORY, PLUGIN_GROUPS_ID, { groups });
      ctx.protocol.response(routerCtx, groups);
    } catch (error: any) {
      ctx.protocol.responseError(routerCtx, error);
    }
  });
}
