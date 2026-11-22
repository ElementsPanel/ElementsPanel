import type Koa from "koa";
import type { MarketRouter, MarketServices, PanelPluginContext } from "../types";
import axios from "axios";
import {
  fetchMarketPluginDetail,
  panelDependencyVersions,
  PluginMarketError
} from "../service/plugin_market";
import { marketSettings } from "../service/market_settings";
import { selectedDaemon } from "./target";

export function registerMarketCatalogue(
  ctx: PanelPluginContext,
  router: MarketRouter,
  requireAdmin: Koa.Middleware,
  services: MarketServices
) {
  const { validator } = ctx.middleware;
  const { fetchMarketPlugins, reportPluginMarketError } = services.catalogue;
  const { targetInstallations, listNodes, nodeInventories } = services.inventory;
  const MAX_MARKET_ICON_BYTES = 2 * 1024 * 1024;
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  router.get("/plugin/list", requireAdmin, async (requestCtx) => {
    try {
      requestCtx.body = await fetchMarketPlugins(
        marketSettings().pluginMarketAddr,
        selectedDaemon(requestCtx)
      );
    } catch (error) {
      reportPluginMarketError(error);
    }
  });

  router.get("/plugin/installed", requireAdmin, async (requestCtx) => {
    try {
      requestCtx.body = await targetInstallations(selectedDaemon(requestCtx));
    } catch (error) {
      reportPluginMarketError(error);
    }
  });

  router.get(
    "/plugin/detail",
    requireAdmin,
    validator({ query: { pluginId: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      try {
        const pluginId = String(requestCtx.query.pluginId);
        const daemonId = selectedDaemon(requestCtx);
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
        const supportsTarget = (release: { sides?: string[] }) => {
          if (daemonId === undefined) return true;
          const sides = release.sides?.length ? release.sides : detail.sides;
          return Array.isArray(sides) && sides.includes(daemonId ? "daemon" : "panel");
        };
        if (!supportsTarget(selectedVersion)) throw new PluginMarketError("INCOMPATIBLE");
        const installed = (await targetInstallations(daemonId)).find(
          (item) => item.pluginId === pluginId
        );
        requestCtx.body = {
          ...detail,
          versions: detail.versions?.filter(supportsTarget),
          ...(daemonId !== undefined ? { targetDaemonId: daemonId } : {}),
          selectedVersion,
          dependencyVersions: daemonId ? {} : panelDependencyVersions(detail),
          installedVersion: installed?.version,
          installedState: installed?.state,
          installedDaemonIds: installed?.daemonIds ?? [],
          installedRemovable: installed?.removable ?? true,
          installedUpdatable: installed?.updatable ?? true
        };
      } catch (error) {
        reportPluginMarketError(error);
      }
    }
  );

  router.get("/plugin/nodes", requireAdmin, async (requestCtx) => {
    requestCtx.body = listNodes();
  });

  router.get(
    "/plugin/targets",
    requireAdmin,
    validator({ query: { pluginId: String } }),
    async (requestCtx: Koa.ParameterizedContext) => {
      const pluginId = String(requestCtx.query.pluginId);
      const nodes = listNodes();
      const inventories = await nodeInventories(nodes.map((node) => node.daemonId));
      const panel = (await targetInstallations("")).find((item) => item.pluginId === pluginId);
      requestCtx.body = [
        {
          daemonId: "",
          remarks: "",
          ip: "",
          port: 0,
          available: true,
          installed: Boolean(panel),
          installedVersion: panel?.version,
          removable: panel?.removable ?? true,
          updatable: panel?.updatable ?? true
        },
        ...nodes.map((node, index) => {
          const inventory = inventories[index].plugins;
          const installed = inventory?.find((item) => item?.id === pluginId);
          return {
            ...node,
            available: inventory !== null,
            installed: Boolean(installed),
            installedVersion: installed?.version,
            removable: installed ? installed.removable === true : true,
            updatable: installed ? Boolean(installed.packageName) : true
          };
        })
      ];
    }
  );

  /** Return PNG icons as data URLs; missing or invalid icons use the default. */
  router.get("/plugin/icon", requireAdmin, async (requestCtx) => {
    const pluginId = typeof requestCtx.query.pluginId === "string" ? requestCtx.query.pluginId : "";
    let dataUrl: string | null = null;
    if (pluginId) {
      try {
        const response = await axios.get<ArrayBuffer>(
          `${marketSettings().pluginMarketAddr}/api/plugins/${encodeURIComponent(pluginId)}/icon`,
          {
            responseType: "arraybuffer",
            timeout: 15000,
            maxContentLength: MAX_MARKET_ICON_BYTES,
            maxBodyLength: MAX_MARKET_ICON_BYTES
          }
        );
        const icon = Buffer.from(response.data);
        if (icon.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
          dataUrl = `data:image/png;base64,${icon.toString("base64")}`;
        }
      } catch (error) {
        if (!axios.isAxiosError(error) || error.response?.status !== 404) {
          ctx.logger.warn(`Failed to read the icon of plugin ${pluginId}: ${error}`);
        }
      }
    }
    requestCtx.body = { dataUrl };
  });

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
}
