import axios from "axios";
import { PluginMarketError } from "./plugin_market";
import type { MarketInventory, PanelPluginContext } from "../types";

export function createMarketCatalogue(ctx: PanelPluginContext, inventory: MarketInventory) {
  const { targetInstallations } = inventory;
  const MARKET_PAGE_SIZE = 48;
  /** A source that never reports the end is bounded by pages, plugins and wall clock. */
  const MAX_MARKET_PAGES = 100;
  const MAX_MARKET_PLUGINS = 2000;
  const MARKET_PAGE_TIMEOUT_MS = 15000;
  const MARKET_LIST_BUDGET_MS = 40000;
  const MAX_MARKET_PAGE_BYTES = 8 * 1024 * 1024;

  /** Load all catalogue pages within the request budget for client-side filtering. */
  async function fetchMarketPlugins(
    addr: string,
    daemonId?: string
  ): Promise<Array<Record<string, unknown>>> {
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
        // Return the pages already loaded if a later page fails.
        if (!items.length) throw error;
        ctx.logger.warn(`Failed to read page ${page} of the plugin market list: ${error}`);
        break;
      }

      let added = 0;
      for (const item of listed) {
        const id = typeof item.id === "string" ? item.id.trim() : "";
        if (!id || seen.has(id)) continue;
        seen.add(id);
        items.push(item);
        added++;
      }

      // Stop when no new ids appear, including markets that ignore pagination.
      if (!added || items.length >= MAX_MARKET_PLUGINS) break;
      if (typeof total !== "number" || items.length >= total) break;
      if (Date.now() >= deadline) {
        ctx.logger.warn(`The plugin market list took too long; stopped after page ${page}.`);
        break;
      }
    }

    const installed = new Map(
      (await targetInstallations(daemonId)).map((item) => [item.pluginId, item])
    );
    return items
      .filter((item) => {
        if (daemonId === undefined) return true;
        const release = item.latestVersion as { sides?: string[] } | undefined;
        const sides = release?.sides?.length ? release.sides : item.sides;
        return Array.isArray(sides) && sides.includes(daemonId ? "daemon" : "panel");
      })
      .map((item) => {
        const local = installed.get(String(item.id));
        return {
          ...item,
          ...(daemonId !== undefined ? { targetDaemonId: daemonId } : {}),
          installedVersion: local?.version,
          installedState: local?.state,
          installedDaemonIds: local?.daemonIds ?? [],
          installedRemovable: local?.removable ?? true,
          installedUpdatable: local?.updatable ?? true
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
      NODE_UNAVAILABLE: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_NODE_UNAVAILABLE"),
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
      NODE_UNAVAILABLE: 503,
      BUNDLED: 409,
      NPM_FAILED: 502
    };
    throw Object.assign(
      new Error(messages[reason] ?? ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_UNREACHABLE")),
      { status: statusByReason[reason] ?? 502 }
    );
  }

  return { fetchMarketPlugins, reportPluginMarketError };
}
