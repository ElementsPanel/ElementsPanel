import { useDefineApi } from "@/stores/useDefineApi";
import type { PluginUpdateResult, PluginUpdates } from "./updates";

// ---- Plugin market -------------------------------------------------------
// Distinct from the catalogue above: these are panel and daemon plugins, not
// instance templates.

/** One plugin as the market lists it, with the version installed here, if any. */
export interface MarketPlugin {
  id: string;
  name: string;
  displayName: string;
  summary: string;
  category: string;
  author: { id: string; displayName: string };
  latestVersion?: MarketPluginVersion;
  /** The version installed on this panel or its nodes, if any. */
  installedVersion?: string;
  installedState?: string;
  /** Nodes with a recorded installation of this plugin. */
  installedDaemonIds?: string[];
  /**
   * Whether the installation shown here can be removed from this panel.
   * Essential packages can still change versions through npm.
   */
  installedRemovable?: boolean;
  /** Whether this installation has an npm package whose version can be changed. */
  installedUpdatable?: boolean;
  /**
   * The halves the latest release carries, as the market reports them. Optional
   * because a market source that predates the field simply does not send it.
   */
  sides?: PluginSide[];
  /**
   * Whether the latest release's package carries an `icon.png`. Optional for the
   * same reason as `sides`: an older market source does not send it, and the page
   * then falls back to the default icon.
   */
  hasIcon?: boolean;
}

/** Which half of a package carries a plugin: its first path segment. */
export type PluginSide = "panel" | "daemon";

export interface MarketPluginVersion {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  engines?: Record<string, string>;
  deprecated?: string;
  frontendDependencies?: string[];
  compatibility?: Partial<Record<PluginSide, { api: number; sdk?: number }>>;
  id: string;
  version: string;
  status: string;
  changelog: string;
  fileCount: number;
  sizeBytes: number;
  submittedAt: number;
  /** The halves this release's own package carries. */
  sides?: PluginSide[];
}

export interface MarketPluginDetail extends MarketPlugin {
  /** Versions resolvable from this panel, not from its remote daemons. */
  dependencyVersions?: Record<string, string>;
  description: string;
  /** 包里的 README.md 原文，市场没给或包里没有时为空。 */
  readme?: string;
  versions: MarketPluginVersion[];
  selectedVersion: MarketPluginVersion;
  createdAt: number;
  updatedAt: number;
}

/** One plugin installed from the market on the panel or its nodes. */
export interface InstalledPlugin {
  state?: string;
  panelVersion?: string;
  daemonVersions?: Record<string, string>;
  pluginId: string;
  name: string;
  version: string;
  installedAt: number;
  sides: string[];
  daemonIds: string[];
  /** `bundled` plugins ship with the runtime; `project` ones are npm dependencies. */
  source: "bundled" | "project";
  removable: boolean;
  updatable?: boolean;
}

export const pluginMarketList = useDefineApi<unknown, MarketPlugin[]>({
  url: "/api/market/plugin/list",
  method: "GET"
});

/**
 * The plugin's icon, proxied to the market by the panel backend: the market's
 * address is a backend setting, so the browser cannot fetch it directly. The
 * route answers with a data URL rather than the image itself, because the panel's
 * request layer only reads JSON; it answers `dataUrl: null` when the package
 * carries no icon, which the page treats as "keep the default icon". Pass the
 * displayed release's version so a newer publication cannot change its icon.
 */
export const pluginMarketIcon = useDefineApi<
  { params: { pluginId: string; version?: string } },
  { dataUrl: string | null }
>({
  url: "/api/market/plugin/icon",
  method: "GET"
});

export const pluginMarketDetail = useDefineApi<
  { params: { pluginId: string; version?: string } },
  MarketPluginDetail
>({
  url: "/api/market/plugin/detail",
  method: "GET"
});

export const pluginMarketInstalled = useDefineApi<unknown, InstalledPlugin[]>({
  url: "/api/market/plugin/installed",
  method: "GET"
});

export const pluginMarketUpdates = useDefineApi<unknown, PluginUpdates>({
  url: "/api/market/plugin/updates",
  method: "GET"
});

export const updateMarketPlugin = useDefineApi<
  { data: { pluginId: string; version: string; panel: boolean; daemonIds: string[] } },
  PluginUpdateResult
>({
  url: "/api/market/plugin/update",
  method: "POST"
});

/** One daemon a plugin with a daemon half can be installed on. */
export interface MarketNode {
  daemonId: string;
  remarks: string;
  ip: string;
  port: number;
  available: boolean;
}

export const pluginMarketNodes = useDefineApi<unknown, MarketNode[]>({
  url: "/api/market/plugin/nodes",
  method: "GET"
});

export const pluginMarketPackage = useDefineApi<
  { params: { pluginId: string; version?: string } },
  { name: string; version: string; sides: string[] }
>({
  url: "/api/market/plugin/package",
  method: "GET"
});

export const installMarketPlugin = useDefineApi<
  {
    data: {
      pluginId: string;
      name: string;
      version?: string;
      /** The nodes to send the daemon half to. Empty installs the panel half only. */
      daemonIds?: string[];
    };
  },
  { restartRequired: boolean; failedNodes: string[]; installedVersion?: string }
>({
  url: "/api/market/plugin/install",
  method: "POST"
});

export const uninstallMarketPlugin = useDefineApi<
  { params: { pluginId: string; daemonIds?: string; removeConfig?: boolean } },
  { removed: boolean; restartRequired: boolean; failedNodes: string[]; installedVersion?: string }
>({
  url: "/api/market/plugin/uninstall",
  method: "DELETE"
});
