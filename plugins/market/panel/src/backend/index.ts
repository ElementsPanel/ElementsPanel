import axios from "axios";
import type Koa from "koa";
import { writePluginOverride } from "mcsmanager-common";
import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import { localeMessages } from "../i18n";
import {
  fetchMarketPluginDetail,
  forgetRemoteInstall,
  listInstalled,
  panelDependencyVersions,
  PluginMarketError,
  readRemoteInstalls,
  recordRemoteInstall,
  type MarketInstallInfo,
  type PluginSide,
  type RemoteMarketInstall
} from "./service/plugin_market";
import { initMarketSettings, marketSettings, saveMarketSettings } from "./service/market_settings";

// Built-in plugin market. Application templates are owned by the external
// epanel-plugin-mcsm-market plugin.
//
// The market indexes npm packages named `epanel-plugin-*`. Installing or
// updating a plugin adds an npm dependency to the installation project; the
// market service itself never hosts package files.

export const inject = [
  "koa",
  "i18n",
  "storage",
  "settingsForm",
  "middleware",
  "roles",
  "remote",
  "identity",
  "plugins"
];

// Install and uninstall must share a queue: a second request cannot rewrite the
// project manifest while the first request is still using it.
const pluginOperations = new Map<string, Promise<void>>();

async function withPluginLock<T>(pluginId: string, operation: () => Promise<T>): Promise<T> {
  const previous = pluginOperations.get(pluginId) ?? Promise.resolve();
  const result = previous.then(operation);
  const settled = result.then(
    () => {},
    () => {}
  );
  pluginOperations.set(pluginId, settled);
  try {
    return await result;
  } finally {
    if (pluginOperations.get(pluginId) === settled) pluginOperations.delete(pluginId);
  }
}

export async function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);
  await initMarketSettings(ctx);

  // Source and disabled plugins count as installed too. The loader decides
  // whether a package can be changed; npm records alone cannot protect sources.
  function installedPlugins() {
    const records = listInstalled();
    for (const plugin of ctx.plugins?.inventory() ?? []) {
      const installed = records.find((item) => item.pluginId === plugin.id);
      if (installed) {
        installed.removable = installed.removable && plugin.removable;
        installed.state = plugin.state;
      } else {
        records.push({
          pluginId: plugin.id,
          name: plugin.packageName ?? plugin.id,
          version: plugin.version ?? "",
          panelVersion: plugin.version,
          state: plugin.state,
          daemonVersions: {},
          installedAt: 0,
          sides: ["panel"],
          directories: [],
          daemonIds: [],
          source: "bundled",
          removable: plugin.removable
        });
      }
    }
    return records;
  }

  const { permission, validator } = ctx.middleware;
  const requireAdmin = permission({ level: ctx.roles.ADMIN });
  const router = ctx.koa.router("/api/market");

  /**
   * The plugin market's address, as the settings form accepts it. Every market call
   * is built from it, so it is checked here rather than failing one request at a
   * time; an empty value simply means no market is configured.
   */
  function normalizePluginMarketAddr(value: unknown): string {
    const raw = String(value).trim().replace(/\/+$/, "");
    if (!raw) return "";
    const invalid = () =>
      Object.assign(new Error(ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_ADDR_INVALID")), { status: 400 });
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw invalid();
    }
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      throw invalid();
    }
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  }

  async function writeMarketSettings(values: Record<string, unknown>) {
    const settings = marketSettings();
    // Only a new address is checked: an address stored before this check existed
    // must not make every other setting on the form unsavable.
    if (values.pluginMarketAddr != null && values.pluginMarketAddr !== settings.pluginMarketAddr)
      settings.pluginMarketAddr = normalizePluginMarketAddr(values.pluginMarketAddr);
    await saveMarketSettings(ctx);
  }

  // ---- Plugin market -----------------------------------------------------
  // Install npm plugins into the panel and daemon installation projects.

  /** The largest page the market serves; it answers 12 plugins per page by default. */
  const MARKET_PAGE_SIZE = 48;
  /** A source that never reports the end is bounded by pages, plugins and wall clock. */
  const MAX_MARKET_PAGES = 100;
  const MAX_MARKET_PLUGINS = 2000;
  const MARKET_PAGE_TIMEOUT_MS = 15000;
  const MARKET_LIST_BUDGET_MS = 40000;
  const MAX_MARKET_PAGE_BYTES = 8 * 1024 * 1024;

  /**
   * Plugins are listed publicly by the market, so this needs no token.
   *
   * The market pages its list, and the page searches and filters what this returns,
   * so every page is read: stopping at the first one would hide every plugin that
   * did not fit on it. Reading many pages is what the budget above bounds — one
   * request must not be able to occupy a connection for as long as the pages allow.
   */
  async function fetchMarketPlugins(addr: string) {
    const items: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    const deadline = Date.now() + MARKET_LIST_BUDGET_MS;

    for (let page = 1; page <= MAX_MARKET_PAGES; page++) {
      let listed: Array<Record<string, unknown>> = [];
      let total: unknown;
      try {
        const response = await axios.get<{
          items?: Array<Record<string, unknown>>;
          total?: unknown;
        }>(`${addr}/api/plugins`, {
          params: { page, pageSize: MARKET_PAGE_SIZE },
          timeout: Math.max(1000, Math.min(MARKET_PAGE_TIMEOUT_MS, deadline - Date.now())),
          maxContentLength: MAX_MARKET_PAGE_BYTES,
          maxBodyLength: MAX_MARKET_PAGE_BYTES
        });
        listed = response.data?.items ?? [];
        total = response.data?.total;
      } catch (error) {
        // A page that fails says nothing about the pages already read: answering
        // with what the market did give beats turning the whole list into an error.
        if (!items.length) throw error;
        ctx.logger.warn(`Failed to read page ${page} of the plugin market list: ${error}`);
        break;
      }

      let added = 0;
      for (const item of listed) {
        // An item without an id cannot be installed, opened or told apart from
        // another, so it is not a plugin this panel can offer.
        const id = typeof item.id === "string" ? item.id.trim() : "";
        if (!id || seen.has(id)) continue;
        seen.add(id);
        items.push(item);
        added++;
      }

      // Nothing new on this page: either the market has run out of plugins, or it
      // ignores `page` and is answering with the same ones.
      if (!added || items.length >= MAX_MARKET_PLUGINS) break;
      if (typeof total !== "number" || items.length >= total) break;
      if (Date.now() >= deadline) {
        ctx.logger.warn(`The plugin market list took too long; stopped after page ${page}.`);
        break;
      }
    }

    const installed = new Map(installedPlugins().map((item) => [item.pluginId, item]));
    return items.map((item) => {
      const local = installed.get(String(item.id));
      return {
        ...item,
        installedVersion: local?.version,
        installedState: local?.state,
        installedDaemonIds: local?.daemonIds ?? [],
        installedRemovable: local?.removable ?? true
      };
    });
  }

  function reportPluginMarketError(
    error: unknown,
    fallback: "UNREACHABLE" | "NPM_FAILED" = "UNREACHABLE"
  ): never {
    const reason =
      error instanceof PluginMarketError
        ? error.reason ?? (error as { message?: string }).message
        : axios.isAxiosError(error) && error.response?.status === 404
        ? "NOT_FOUND"
        : axios.isAxiosError(error) && error.response?.status === 409
        ? "INCOMPATIBLE"
        : axios.isAxiosError(error)
        ? "UNREACHABLE"
        : fallback;
    if (reason === "NPM_FAILED")
      ctx.logger.warn(`Plugin market npm operation failed: ${String(error)}`);
    const messages: Record<string, string> = {
      NOT_FOUND: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_NOT_FOUND"),
      DIR_TAKEN: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_DIR_TAKEN"),
      EMPTY_PACKAGE: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_EMPTY_PACKAGE"),
      BAD_PATH: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_BAD_PACKAGE"),
      BAD_CHECKSUM: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_BAD_CHECKSUM"),
      INCOMPATIBLE: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_INCOMPATIBLE"),
      NO_NODES: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_SELECT_NODES"),
      BUNDLED: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_BUNDLED"),
      NPM_FAILED: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_NPM_FAILED")
    };
    const statusByReason: Record<string, number> = {
      NOT_FOUND: 404,
      DIR_TAKEN: 409,
      EMPTY_PACKAGE: 400,
      BAD_PATH: 400,
      BAD_CHECKSUM: 400,
      INCOMPATIBLE: 409,
      NO_NODES: 400,
      BUNDLED: 409,
      NPM_FAILED: 502
    };
    throw Object.assign(
      new Error(messages[reason] ?? ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_UNREACHABLE")),
      { status: statusByReason[reason] ?? 502 }
    );
  }

  /** The daemons a daemon plugin can be installed on, as the page lists them. */
  function listNodes() {
    return Array.from(ctx.remote.services.services.entries()).map(([daemonId, node]) => ({
      daemonId,
      remarks: node.config.remarks,
      ip: node.config.ip,
      port: node.config.port,
      available: node.available
    }));
  }

  /**
   * The daemons a request names. The install sends them as an array in the body;
   * an uninstall has no body, so it names them in the query instead.
   */
  function requestedNodes(value: unknown): string[] {
    const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
    return [
      ...new Set(
        values
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      )
    ];
  }

  /** Installs the package on each selected node, one npm dependency per node. */
  async function installOnNodes(
    daemonIds: readonly string[],
    info: MarketInstallInfo
  ): Promise<{ failedNodes: string[]; changedNodes: string[] }> {
    const failedNodes: string[] = [];
    const changedNodes: string[] = [];
    for (const daemonId of daemonIds) {
      const node = ctx.remote.services.getInstance(daemonId);
      if (!node || !node.available) {
        failedNodes.push(daemonId);
        continue;
      }
      try {
        await new ctx.remote.Request(node).request(
          "plugin/npm/install",
          { name: info.name, pluginId: info.pluginId, version: info.version },
          10 * 60 * 1000
        );
      } catch (error) {
        ctx.logger.warn(`Failed to install a plugin on daemon ${daemonId}: ${error}`);
        failedNodes.push(daemonId);
        continue;
      }
      await recordRemoteInstall(info, daemonId);
      changedNodes.push(daemonId);
    }
    return { failedNodes, changedNodes };
  }

  /** Failed or unselected uninstalls stay recorded until a later successful retry. */
  async function removeFromNodes(
    installations: readonly RemoteMarketInstall[],
    removeConfig = false
  ) {
    const failedNodes = new Set<string>();
    const changedNodes = new Set<string>();
    for (const installation of installations) {
      const { daemonId, name, pluginId } = installation;
      const node = ctx.remote.services.getInstance(daemonId);
      if (!node || !node.available) {
        failedNodes.add(daemonId);
        continue;
      }
      try {
        await new ctx.remote.Request(node).request(
          "plugin/npm/uninstall",
          { name, pluginId, ...(removeConfig ? { removeConfig: true } : {}) },
          10 * 60 * 1000
        );
      } catch (error) {
        ctx.logger.warn(`Failed to uninstall a plugin on daemon ${daemonId}: ${error}`);
        failedNodes.add(daemonId);
        continue;
      }
      await forgetRemoteInstall(installation);
      changedNodes.add(daemonId);
    }
    return { failedNodes: [...failedNodes], changedNodes: [...changedNodes] };
  }

  /**
   * Asks the daemons the user picked to re-scan their plugin directories.
   *
   * Current daemons dispatch through their live registry. Reconnecting also
   * keeps this panel compatible with older daemons that bind routes per socket.
   */
  async function reloadNodes(daemonIds: readonly string[], pluginId?: string): Promise<boolean> {
    let reloaded = true;
    for (const daemonId of daemonIds) {
      const node = ctx.remote.services.getInstance(daemonId);
      if (!node || !node.available) {
        reloaded = false;
        continue;
      }
      try {
        const inventory = await new ctx.remote.Request(node).request("plugin/reload");
        if (
          Array.isArray(inventory) &&
          inventory.some((plugin) => plugin.id === pluginId && plugin.state === "restart-required")
        )
          reloaded = false;
        node.refreshReconnect();
      } catch (error) {
        // A daemon that cannot reload — an older one, or one that is not a
        // development checkout — keeps what it has until its next restart.
        ctx.logger.warn(`Failed to reload a daemon's plugins: ${error}`);
        reloaded = false;
      }
    }
    return reloaded;
  }

  /**
   * Makes a freshly installed package take effect without a restart.
   *
   * Both halves re-scan after the dependency is installed: the panel scans its
   * own npm plugins, and the selected daemons scan theirs before reconnecting.
   * Loaders dispose the previous revision before activating its replacement.
   */
  async function hotReload(
    sides: PluginSide[],
    daemonIds: readonly string[] = [],
    pluginId?: string
  ): Promise<boolean> {
    if (!sides.length) return true;
    try {
      if (sides.includes("panel")) await ctx.plugins.reload();
      const panelReady =
        !sides.includes("panel") ||
        !ctx.plugins
          .inventory()
          .some((plugin) => plugin.id === pluginId && plugin.state === "restart-required");
      if (sides.includes("daemon")) return (await reloadNodes(daemonIds, pluginId)) && panelReady;
      return panelReady;
    } catch (error) {
      ctx.logger.warn(`Failed to reload plugins after a market install: ${error}`);
      return false;
    }
  }

  router.get("/plugin/list", requireAdmin, async (requestCtx) => {
    try {
      requestCtx.body = await fetchMarketPlugins(marketSettings().pluginMarketAddr);
    } catch (error) {
      reportPluginMarketError(error);
    }
  });

  router.get("/plugin/installed", requireAdmin, async (requestCtx) => {
    requestCtx.body = installedPlugins();
  });

  router.get(
    "/plugin/detail",
    requireAdmin,
    validator({ query: { pluginId: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      try {
        const pluginId = String(requestCtx.query.pluginId);
        const version = requestCtx.query.version ? String(requestCtx.query.version) : undefined;
        const response = await axios.get(
          `${marketSettings().pluginMarketAddr}/api/plugins/${encodeURIComponent(pluginId)}`,
          { params: { version }, timeout: 15000 }
        );
        const detail = response.data;
        // Also support market sources that predate the selectedVersion field.
        const selectedVersion = version
          ? detail.versions?.find((item: { version: string }) => item.version === version)
          : detail.selectedVersion ?? detail.latestVersion;
        if (!selectedVersion || (selectedVersion.status && selectedVersion.status !== "approved")) {
          throw new PluginMarketError("NOT_FOUND");
        }
        const installed = installedPlugins().find((item) => item.pluginId === pluginId);
        requestCtx.body = {
          ...detail,
          selectedVersion,
          dependencyVersions: panelDependencyVersions(detail),
          installedVersion: installed?.version,
          installedState: installed?.state,
          installedDaemonIds: installed?.daemonIds ?? [],
          installedRemovable: installed?.removable ?? true
        };
      } catch (error) {
        reportPluginMarketError(error);
      }
    }
  );

  // The daemons the page offers to install a daemon plugin on.
  router.get("/plugin/nodes", requireAdmin, async (requestCtx) => {
    requestCtx.body = listNodes();
  });

  /**
   * 插件图标。npm 索引不托管图标，页面统一回退到默认拼图图标；保留这个路由是为了让
   * 浏览器侧不必区分旧版与新版市场。
   */
  router.get("/plugin/icon", requireAdmin, async (requestCtx) => {
    requestCtx.body = { dataUrl: null };
  });

  // What the page needs before it can ask the user anything: a package with a
  // daemon half has to be installed on the nodes the user picks.
  router.get(
    "/plugin/package",
    requireAdmin,
    validator({ query: { pluginId: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      try {
        const query = requestCtx.request.query;
        const detail = await fetchMarketPluginDetail(
          marketSettings().pluginMarketAddr,
          String(query.pluginId),
          query.version ? String(query.version) : undefined
        );
        requestCtx.body = {
          name: detail.name,
          version: detail.selectedVersion.version,
          sides: detail.selectedVersion.sides
        };
      } catch (error) {
        reportPluginMarketError(error);
      }
    }
  );

  // Installing adds a dependency to this installation's package.json and sends the
  // same npm install to the nodes the user picked. Both sides are asked to re-scan
  // after the dependency arrives and replace the running plugin revision.
  router.post(
    "/plugin/install",
    requireAdmin,
    ctx.middleware.speedLimit(3),
    ctx.middleware.validator({ body: { pluginId: String, name: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      const body = (requestCtx.request.body ?? {}) as Record<string, unknown>;
      try {
        requestCtx.body = await withPluginLock(String(body.pluginId), async () => {
          const detail = await fetchMarketPluginDetail(
            marketSettings().pluginMarketAddr,
            String(body.pluginId),
            body.version ? String(body.version) : undefined
          );
          const daemonIds = requestedNodes(body.daemonIds);
          const sides = detail.selectedVersion.sides;
          if (!sides.includes("panel") && !daemonIds.length)
            throw new PluginMarketError("NO_NODES");
          const info: MarketInstallInfo = {
            pluginId: detail.id,
            name: detail.name,
            version: detail.selectedVersion.version,
            installedAt: Date.now()
          };
          // Core services and source plugins cannot be replaced while running.
          if (
            sides.includes("panel") &&
            ctx.plugins.inventory().some((item) => item.id === info.pluginId && !item.removable)
          )
            throw new PluginMarketError("BUNDLED");

          const changedSides: PluginSide[] = [];
          if (sides.includes("panel")) {
            await ctx.plugins.install({
              name: detail.name,
              pluginId: detail.id,
              version: detail.selectedVersion.version
            });
            changedSides.push("panel");
          }
          const { failedNodes, changedNodes } =
            sides.includes("daemon") && daemonIds.length
              ? await installOnNodes(daemonIds, info)
              : { failedNodes: [], changedNodes: [] };
          if (changedNodes.length) changedSides.push("daemon");
          const reloaded = await hotReload(changedSides, changedNodes, info.pluginId);

          return {
            restartRequired: !reloaded,
            installedVersion: installedPlugins().find((item) => item.pluginId === info.pluginId)
              ?.version,
            failedNodes
          };
        });
      } catch (error) {
        reportPluginMarketError(error, "NPM_FAILED");
      }
    }
  );

  router.delete(
    "/plugin/uninstall",
    requireAdmin,
    ctx.middleware.validator({ query: { pluginId: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      const pluginId = String(requestCtx.request.query.pluginId);
      const daemonIds = requestedNodes(requestCtx.request.query.daemonIds);
      const removeConfig = requestCtx.request.query.removeConfig === "true";
      try {
        requestCtx.body = await withPluginLock(pluginId, async () => {
          const selectedNodes = new Set(daemonIds);
          const installations = readRemoteInstalls(pluginId).filter((item) =>
            selectedNodes.has(item.daemonId)
          );
          const local = ctx.plugins.inventory().find((plugin) => plugin.id === pluginId);
          if (local) await ctx.plugins.remove(pluginId);
          if (local && removeConfig) {
            await ctx.plugins.runExclusive(async () =>
              writePluginOverride(pluginId, { config: {} })
            );
          }
          const removed = Boolean(local);
          const { failedNodes, changedNodes } = await removeFromNodes(installations, removeConfig);
          const sides: PluginSide[] = removed ? ["panel"] : [];
          if (changedNodes.length) sides.push("daemon");
          const remaining = installedPlugins().find((item) => item.pluginId === pluginId);
          return {
            removed: !remaining,
            installedVersion: remaining?.version,
            failedNodes,
            restartRequired: !(await hotReload(sides, changedNodes, pluginId))
          };
        });
      } catch (error) {
        reportPluginMarketError(error, "NPM_FAILED");
      }
    }
  );

  ctx.settingsForm.declare({
    fields: () => [
      {
        key: "pluginMarketAddr",
        type: "string",
        title: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_ADDR"),
        description: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_ADDR_DESC")
      },
      { type: "link", title: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET"), route: "/market/plugins" }
    ],
    read: () => ({ ...marketSettings() }),
    write: writeMarketSettings
  });
}
