import { useDefineApi } from "@elementspanel/epanel-plugin-console/stores/useDefineApi";
import { computed, ref } from "vue";
import { ctx } from "@elements-panel/sdk";
import type {
  PanelRestartResponse,
  PanelRestartStatus,
  PluginUpdateBatchResult,
  PluginUpdateRequest,
  PluginUpdateResult,
  PluginUpdates
} from "./updates";

const panelRestartStatus = useDefineApi<unknown, PanelRestartStatus>({
  url: "/api/market/plugin/restart-status",
  method: "GET"
});

async function waitForPanelRestart(processId: string) {
  for (;;) {
    try {
      const response = await panelRestartStatus().execute({
        forceRequest: true,
        errorAlert: false,
        timeout: 10000
      });
      const status = response.value;
      if (
        status?.processId &&
        status.processId !== processId &&
        status.restarting === false &&
        status.ready === true
      )
        return;
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) throw error;
      // The transport can disappear during restart, including a manual recovery.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** Keep the shell busy until the replacement worker can serve a fresh page. */
function useDefineMarketMutation<P, T>(baseConfig: Parameters<typeof useDefineApi>[0]) {
  const defineApi = useDefineApi<P, T & PanelRestartResponse>(baseConfig);
  return () => {
    const api = defineApi();
    const requests = ref(0);
    return {
      ...api,
      isLoading: computed(() => requests.value > 0),
      isReady: computed(() => api.isReady.value && requests.value === 0),
      execute: async (...args: Parameters<typeof api.execute>) => {
        requests.value++;
        let release!: () => void;
        const finished = new Promise<void>((resolve) => {
          release = resolve;
        });
        try {
          ctx.plugins.deferRefreshUntil?.(finished);
          const response = await api.execute(...args);
          if (response.value?.panelRestart) {
            await waitForPanelRestart(response.value.panelRestart.processId);
            window.location.reload();
            // Keep the dialog and refresh gate until the document unloads.
            await new Promise<never>(() => {});
          }
          return response;
        } finally {
          release();
          requests.value--;
        }
      }
    };
  };
}

export interface MarketPlugin {
  /** Empty for this panel; omitted for an unscoped catalogue response. */
  targetDaemonId?: string;
  id: string;
  name: string;
  displayName: string;
  summary: string;
  category: string;
  author: { id: string; displayName: string };
  latestVersion?: MarketPluginVersion;
  installedVersion?: string;
  installedState?: string;
  installedDaemonIds?: string[];
  /** Essential packages may be updated through npm but cannot be removed. */
  installedRemovable?: boolean;
  /** Only npm-installed packages support version changes. */
  installedUpdatable?: boolean;
  /** Older market sources may omit the release's plugin sides. */
  sides?: PluginSide[];
  /** Market path to icon.png. Older markets may omit it; null or absent values use the default icon. */
  iconUrl?: string | null;
}

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
  sides?: PluginSide[];
}

export interface MarketPluginDetail extends MarketPlugin {
  /** Versions resolvable from this panel, not from its remote daemons. */
  dependencyVersions?: Record<string, string>;
  description: string;
  readme?: string;
  versions: MarketPluginVersion[];
  selectedVersion: MarketPluginVersion;
  createdAt: number;
  updatedAt: number;
}

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

export const pluginMarketList = useDefineApi<{ params?: { daemonId?: string } }, MarketPlugin[]>({
  url: "/api/market/plugin/list",
  method: "GET"
});

/** Proxy the latest icon as a data URL; version only partitions the frontend cache. */
export const pluginMarketIcon = useDefineApi<
  { params: { pluginId: string; version?: string } },
  { dataUrl: string | null }
>({
  url: "/api/market/plugin/icon",
  method: "GET"
});

export const pluginMarketDetail = useDefineApi<
  { params: { pluginId: string; version?: string; daemonId?: string } },
  MarketPluginDetail
>({
  url: "/api/market/plugin/detail",
  method: "GET"
});

export const pluginMarketInstalled = useDefineApi<
  { params?: { daemonId?: string } },
  InstalledPlugin[]
>({
  url: "/api/market/plugin/installed",
  method: "GET"
});

export const pluginMarketUpdates = useDefineApi<{ params?: { daemonId?: string } }, PluginUpdates>({
  url: "/api/market/plugin/updates",
  method: "GET"
});

export const updateMarketPlugin = useDefineMarketMutation<
  { data: { pluginId: string; version: string; panel: boolean; daemonIds: string[] } },
  PluginUpdateResult
>({
  url: "/api/market/plugin/update",
  method: "POST"
});

export const updateMarketRuntime = useDefineMarketMutation<
  { data: { side: PluginSide; version: string; daemonIds: string[] } },
  PluginUpdateResult
>({
  url: "/api/market/runtime/update",
  method: "POST"
});

export const updateMarketBatch = useDefineMarketMutation<
  { data: { updates: PluginUpdateRequest[] } },
  PluginUpdateBatchResult
>({
  url: "/api/market/plugin/update-batch",
  method: "POST"
});

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

/** Read live install state from the panel and every configured daemon. */
export interface MarketPluginTarget extends MarketNode {
  installed: boolean;
  installedVersion?: string;
  removable: boolean;
  updatable: boolean;
}

export const pluginMarketTargets = useDefineApi<
  { params: { pluginId: string } },
  MarketPluginTarget[]
>({
  url: "/api/market/plugin/targets",
  method: "GET"
});

export const pluginMarketPackage = useDefineApi<
  { params: { pluginId: string; version?: string } },
  { name: string; version: string; sides: string[] }
>({
  url: "/api/market/plugin/package",
  method: "GET"
});

export const installMarketPlugin = useDefineMarketMutation<
  {
    data: {
      pluginId: string;
      name: string;
      version?: string;
      /** The nodes to send the daemon half to. Empty installs the panel half only. */
      daemonIds?: string[];
      /** Whether to change this panel. Defaults to the package's declared sides. */
      panel?: boolean;
    };
  },
  { restartRequired: boolean; failedNodes: string[]; installedVersion?: string }
>({
  url: "/api/market/plugin/install",
  method: "POST"
});

export const uninstallMarketPlugin = useDefineMarketMutation<
  { params: { pluginId: string; daemonIds?: string; removeConfig?: boolean; panel?: boolean } },
  { removed: boolean; restartRequired: boolean; failedNodes: string[]; installedVersion?: string }
>({
  url: "/api/market/plugin/uninstall",
  method: "DELETE"
});
