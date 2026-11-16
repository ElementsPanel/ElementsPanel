import { PLUGIN_API_VERSION, type NpmPackageUpdate } from "mcsmanager-common";
import type { DaemonPluginContext } from "../../../../../core/daemon/src/plugin";
import { localeMessages } from "../i18n";
import { SettingsFormService } from "./settings";
import { writePluginOverride } from "mcsmanager-common";

// Expose daemon plugin management over the protocol.
// The daemon auth middleware requires an authenticated panel session for these events.

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

  // Include plugin versions and dual-side requirements in the overview for compatibility checks.
  // Hosts without an overview service can still load this plugin.
  ctx.overview?.provide(() => ({
    plugins: ctx.plugins
      .inventory()
      .map((record) => ({ id: record.id, version: record.version, dual: record.dual }))
  }));

  // The loader enforces removal restrictions and returns protocol errors.
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
    ctx.protocol.response(routerCtx, {
      api: PLUGIN_API_VERSION,
      restarting: ctx.plugins.restartPending === true,
      batchUpdates: typeof ctx.plugins.updateBatch === "function",
      runtimeUpdates: Boolean(ctx.plugins.runtime),
      runtime: ctx.plugins.runtime?.installed ?? null
    });
  });

  ctx.protocol.on("runtime/check", async (routerCtx) => {
    try {
      ctx.protocol.response(routerCtx, (await ctx.plugins.runtime?.check()) ?? null);
    } catch (error: any) {
      ctx.protocol.responseError(routerCtx, error);
    }
  });

  ctx.protocol.on("plugin/list", (routerCtx) => {
    const declared = new Set(settingsForm.declared());
    ctx.protocol.response(
      routerCtx,
      ctx.plugins.inventory().map((record) => ({
        ...record,
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

  // Install the selected npm dependency in the daemon's installation project.
  async function installPackage(
    routerCtx: Parameters<typeof ctx.protocol.response>[0],
    data: unknown,
    mode: "plugin" | "runtime" | "batch" = "plugin"
  ) {
    const protocol = ctx.protocol;
    let resume!: () => void;
    const reloadAfter = new Promise<void>((resolve) => {
      resume = resolve;
    });
    let respond: () => void;
    try {
      const payload = (data ?? {}) as {
        name?: unknown;
        pluginId?: unknown;
        version?: unknown;
        updates?: NpmPackageUpdate[];
      };
      if (
        mode === "batch" &&
        (!Array.isArray(payload.updates) ||
          payload.updates.length > 2000 ||
          payload.updates.some(
            (update) =>
              !update ||
              typeof update.name !== "string" ||
              typeof update.version !== "string" ||
              (update.runtime !== undefined && typeof update.runtime !== "boolean") ||
              (!update.runtime && typeof update.pluginId !== "string")
          ))
      )
        throw new Error("Invalid npm update batch.");
      const record =
        mode === "batch"
          ? await ctx.plugins.updateBatch({ updates: payload.updates!, reloadAfter })
          : mode === "runtime"
          ? await ctx.plugins.runtime!.update({
              version: String(payload.version ?? ""),
              reloadAfter
            })
          : await ctx.plugins.install({
              name: String(payload.name ?? ""),
              pluginId: payload.pluginId ? String(payload.pluginId) : undefined,
              version: payload.version ? String(payload.version) : undefined,
              reloadAfter
            });
      respond = () => protocol.response(routerCtx, record);
    } catch (error: any) {
      respond = () => protocol.responseError(routerCtx, error);
    }
    const connection = routerCtx.socket?.conn;
    let flushed = false;
    const onDrain = () => {
      flushed = true;
    };
    connection?.once("drain", onDrain);
    try {
      respond();
    } finally {
      // A polling transport may be between HTTP requests. Wait until Engine.IO
      // hands the buffered reply to its transport before replacing the socket.
      connection?.off("drain", onDrain);
      if (connection?.readyState === "open" && !flushed) {
        const release = () => {
          clearTimeout(timeout);
          connection.off("drain", release);
          connection.off("close", release);
          setImmediate(resume);
        };
        const timeout = setTimeout(release, 10000);
        connection.once("drain", release);
        connection.once("close", release);
      } else {
        setImmediate(resume);
      }
    }
  }

  ctx.protocol.on("plugin/npm/install", (routerCtx, data) => installPackage(routerCtx, data));
  ctx.protocol.on("runtime/update", (routerCtx, data) =>
    installPackage(routerCtx, data, "runtime")
  );
  ctx.protocol.on("plugin/npm/update-batch", (routerCtx, data) =>
    installPackage(routerCtx, data, "batch")
  );

  ctx.protocol.on("plugin/npm/uninstall", async (routerCtx, data) => {
    try {
      const pluginId = String((data as { pluginId?: unknown })?.pluginId ?? "");
      await ctx.plugins.remove(pluginId);
      if ((data as { removeConfig?: unknown })?.removeConfig === true) {
        await ctx.plugins.runExclusive(async () => writePluginOverride(pluginId, { config: {} }));
      }
      ctx.protocol.response(routerCtx, { removed: true, pluginId });
    } catch (error: any) {
      ctx.protocol.responseError(routerCtx, error);
    }
  });

  // Reconcile dependencies and make their current handlers available on
  // existing authenticated sockets.
  ctx.protocol.on("plugin/reload", async (routerCtx) => {
    try {
      await ctx.plugins.reload();
      ctx.protocol.response(routerCtx, ctx.plugins.inventory());
    } catch (error: any) {
      ctx.protocol.responseError(routerCtx, error);
    }
  });

  // Expose backend-declared settings for the panel's generic form.
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
