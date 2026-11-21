import type Koa from "koa";
import { createHash } from "node:crypto";
import { writePluginOverride } from "mcsmanager-common";
import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import type SystemConfig from "../../../../runtime/panel/src/backend/entity/setting";
import { localeMessages } from "../i18n";
import { SettingsFormService } from "./settings";

// Scope node routes to the optional remote service so panel management remains available.

const SELF = "config";

/** Keep essential management services enabled. */
const ESSENTIAL = new Set(["console", "i18n", "storage", "runtime", "server"]);
const PLUGIN_GROUPS_CATEGORY = "PluginGroups";
const PLUGIN_REMARKS_CATEGORY = "PluginRemarks";

interface PluginGroup {
  id: string;
  name: string;
  pluginIds: string[];
}

class StoredPluginGroups {
  groups: PluginGroup[] = [];
}

interface PluginRemark {
  id: string;
  remarks: string;
}

class StoredPluginRemarks {
  entries: PluginRemark[] = [];
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

export const inject = [
  "koa",
  "i18n",
  "middleware",
  "roles",
  "plugins",
  "storage",
  "settings",
  "identity",
  "operations"
];

export function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);
  ctx.plugin(SettingsFormService);
  const settingsForm = ctx.get("settingsForm");
  if (!settingsForm) throw new Error("Panel settings form service is unavailable.");

  const router = ctx.koa.router("/api/plugins");
  const requireAdmin = ctx.middleware.permission({ level: ctx.roles.ADMIN });

  const settingsRouter = ctx.koa.router("/api/overview");
  settingsRouter.get("/setting", requireAdmin, async (requestCtx) => {
    requestCtx.body = ctx.settings.config;
  });
  settingsRouter.put("/setting", requireAdmin, async (requestCtx) => {
    const config = (requestCtx.request.body ?? {}) as Partial<SystemConfig>;
    const current = ctx.settings.config;
    if (!config || !current) throw new Error(ctx.i18n.$t("TXT_CODE_COMMON_REQUEST_BODY_ERROR"));
    if (config.gzip != null) current.gzip = config.gzip;
    if (config.maxCompress != null) current.maxCompress = config.maxCompress;
    if (config.maxDownload != null) current.maxDownload = config.maxDownload;
    if (config.zipType != null) current.zipType = config.zipType;
    if (config.forwardType != null) current.forwardType = Number(config.forwardType);
    if (config.dataPort != null) current.dataPort = Number(config.dataPort);
    ctx.operations.log("system_config_change", {
      operator_ip: requestCtx.ip,
      operator_name: ctx.identity.of(requestCtx).userName
    });
    await ctx.settings.save();
    requestCtx.body = "OK";
  });

  router.get("/", requireAdmin, async (requestCtx) => {
    const declared = new Set(settingsForm.declared());
    requestCtx.body = ctx.plugins.inventory().map((record) => ({
      ...record,
      hasSettings: declared.has(record.id),
      canResetSettings: settingsForm.canReset(record.id)
    }));
  });

  router.get("/settings", requireAdmin, async (requestCtx) => {
    requestCtx.body = await settingsForm.read(String(requestCtx.request.query.id ?? ""));
  });

  router.put(
    "/settings",
    requireAdmin,
    ctx.middleware.validator({ query: { id: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      const id = String(requestCtx.request.query.id);
      // Each plugin validates its own settings.
      requestCtx.body = await settingsForm.write(
        id,
        (requestCtx.request.body ?? {}) as Record<string, unknown>
      );
    }
  );

  router.post(
    "/settings/reset",
    requireAdmin,
    ctx.middleware.validator({ query: { id: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      requestCtx.body = await settingsForm.reset(String(requestCtx.request.query.id));
    }
  );

  const groupsStorageId = (requestCtx: Koa.ParameterizedContext) =>
    String(ctx.identity.of(requestCtx).uuid || "anonymous");

  router.get("/groups", requireAdmin, async (requestCtx) => {
    const stored = (await ctx.storage
      .getStorage()
      .load(
        PLUGIN_GROUPS_CATEGORY,
        StoredPluginGroups,
        groupsStorageId(requestCtx)
      )) as StoredPluginGroups | null;
    requestCtx.body = stored?.groups ?? [];
  });

  router.put("/groups", requireAdmin, async (requestCtx) => {
    const groups = normalizePluginGroups((requestCtx.request.body as { groups?: unknown })?.groups);
    await ctx.storage.getStorage().store(PLUGIN_GROUPS_CATEGORY, groupsStorageId(requestCtx), {
      groups
    });
    requestCtx.body = groups;
  });

  const remarksStorageId = (requestCtx: Koa.ParameterizedContext) =>
    createHash("sha256")
      .update(
        JSON.stringify([
          groupsStorageId(requestCtx),
          String(requestCtx.request.query.daemonId ?? "")
        ])
      )
      .digest("hex");

  const readPluginRemarks = async (requestCtx: Koa.ParameterizedContext) => {
    const stored = (await ctx.storage
      .getStorage()
      .load(
        PLUGIN_REMARKS_CATEGORY,
        StoredPluginRemarks,
        remarksStorageId(requestCtx)
      )) as StoredPluginRemarks | null;
    return stored?.entries ?? [];
  };

  router.get("/remarks", requireAdmin, async (requestCtx) => {
    requestCtx.body = await readPluginRemarks(requestCtx);
  });

  router.put(
    "/remarks",
    requireAdmin,
    ctx.middleware.validator({ body: { id: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      const { id, remarks } = requestCtx.request.body as PluginRemark;
      if (!id.trim() || id.length > 256 || typeof remarks !== "string") {
        throw new Error(ctx.i18n.$t("TXT_CODE_COMMON_REQUEST_BODY_ERROR"));
      }
      const entry = { id: id.trim(), remarks: remarks.replace(/[\r\n]+/g, " ").trim() };
      const entries = (await readPluginRemarks(requestCtx)).filter((item) => item.id !== entry.id);
      if (entry.remarks) entries.push(entry);
      await ctx.storage.getStorage().store(PLUGIN_REMARKS_CATEGORY, remarksStorageId(requestCtx), {
        entries
      });
      requestCtx.body = entry;
    }
  );

  router.put(
    "/enabled",
    requireAdmin,
    ctx.middleware.validator({ body: { id: String, enabled: Boolean } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      const id = String(requestCtx.request.body.id);
      const enabled = Boolean(requestCtx.request.body.enabled);
      // Throw errors so the response protocol applies the standard envelope.
      if (id === SELF && !enabled) throw new Error(ctx.i18n.$t("TXT_CODE_PLUGIN_SELF_DISABLE"));
      if (ESSENTIAL.has(id) && !enabled)
        throw new Error(ctx.i18n.$t("TXT_CODE_PLUGIN_ESSENTIAL_DISABLE"));
      requestCtx.body = await ctx.plugins.setEnabled(id, enabled);
    }
  );

  router.delete(
    "/",
    requireAdmin,
    ctx.middleware.validator({ query: { id: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      const id = String(requestCtx.request.query.id);
      await ctx.plugins.remove(id);
      if (requestCtx.request.query.removeConfig === "true") {
        await ctx.plugins.runExclusive(async () => writePluginOverride(id, { config: {} }));
      }
      requestCtx.body = { removed: true };
    }
  );

  router.post(
    "/npm/install",
    requireAdmin,
    ctx.middleware.validator({ body: { name: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      const payload = requestCtx.request.body as { name: string; version?: string };
      requestCtx.body = await ctx.plugins.install({
        name: payload.name.trim(),
        version: payload.version?.trim() || undefined
      });
    }
  );

  ctx.inject(["remote"], (scoped) => {
    const nodeRouter = scoped.koa.router("/api/plugins/node");
    const RemoteRequest = scoped.remote.Request;

    const nodeOf = (requestCtx: Koa.ParameterizedContext) => {
      const daemonId = String(requestCtx.request.query.daemonId ?? "");
      const node = scoped.remote.services.getInstance(daemonId);
      if (!node) throw new Error(ctx.i18n.$t("TXT_CODE_PLUGIN_NODE_NOT_FOUND"));
      return node;
    };

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
        const record = await new RemoteRequest(node).request("plugin/enabled", { id, enabled });

        // Reconnect older daemons after the reply to refresh socket-bound handlers.
        node.refreshReconnect();

        requestCtx.body = record;
      }
    );

    nodeRouter.delete(
      "/",
      requireAdmin,
      ctx.middleware.validator({ query: { daemonId: String, id: String } }),
      async (requestCtx: Koa.ParameterizedContext) => {
        const node = nodeOf(requestCtx);
        // Unloading can exceed the default request timeout.
        await new RemoteRequest(node).request(
          "plugin/remove",
          {
            id: String(requestCtx.request.query.id),
            ...(requestCtx.request.query.removeConfig === "true" ? { removeConfig: true } : {})
          },
          10 * 60 * 1000
        );
        node.refreshReconnect();
        requestCtx.body = { removed: true };
      }
    );

    nodeRouter.post(
      "/npm/install",
      requireAdmin,
      ctx.middleware.validator({ query: { daemonId: String }, body: { name: String } }),
      async (requestCtx: Koa.ParameterizedContext) => {
        const node = nodeOf(requestCtx);
        const payload = requestCtx.request.body as { name: string; version?: string };
        requestCtx.body = await new RemoteRequest(node).request(
          "plugin/npm/install",
          {
            name: payload.name.trim(),
            version: payload.version?.trim() || undefined
          },
          10 * 60 * 1000
        );
        node.refreshReconnect();
      }
    );

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
        const request = new RemoteRequest(nodeOf(requestCtx));
        requestCtx.body = await request.request("plugin/config/write", {
          id: String(requestCtx.request.query.id),
          values: (requestCtx.request.body ?? {}) as Record<string, unknown>
        });
        // Refresh connection metadata after saving; a failed refresh must not invalidate a successful response.
        try {
          await request.request("info/overview");
        } catch (error) {
          ctx.logger.warn(
            "Failed to refresh node information after saving plugin settings:",
            error
          );
        }
      }
    );

    nodeRouter.post(
      "/settings/reset",
      requireAdmin,
      ctx.middleware.validator({ query: { daemonId: String, id: String } }),
      async (requestCtx: Koa.ParameterizedContext) => {
        const request = new RemoteRequest(nodeOf(requestCtx));
        requestCtx.body = await request.request("plugin/config/reset", {
          id: String(requestCtx.request.query.id)
        });
        try {
          await request.request("info/overview");
        } catch (error) {
          ctx.logger.warn("Failed to refresh node information after resetting plugin settings:", error);
        }
      }
    );

    nodeRouter.get(
      "/groups",
      requireAdmin,
      ctx.middleware.validator({ query: { daemonId: String } }),
      async (requestCtx: Koa.ParameterizedContext) => {
        requestCtx.body = await new RemoteRequest(nodeOf(requestCtx)).request("plugin/groups");
      }
    );

    nodeRouter.put(
      "/groups",
      requireAdmin,
      ctx.middleware.validator({ query: { daemonId: String } }),
      async (requestCtx: Koa.ParameterizedContext) => {
        const groups = (requestCtx.request.body as { groups?: unknown })?.groups;
        requestCtx.body = await new RemoteRequest(nodeOf(requestCtx)).request(
          "plugin/groups/write",
          { groups }
        );
      }
    );
  });
}
