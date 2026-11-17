export interface PanelRestartStatus {
  processId: string;
  restarting: boolean;
}

export interface PanelRestartResponse {
  /** The worker that must be replaced before this operation is complete. */
  panelRestart?: { processId: string };
}

export interface PluginUpdateTarget {
  /** Omitted for the panel itself. */
  daemonId?: string;
  label: string;
  currentVersion: string;
}

export interface PluginUpdate {
  runtime?: "panel" | "daemon";
  pluginId: string;
  name: string;
  displayName: string;
  version: string;
  targets: PluginUpdateTarget[];
}

export interface PluginUpdates {
  plugins: PluginUpdate[];
  checkFailed?: boolean;
  uncheckedNodes: Array<{ daemonId: string; label: string }>;
}

export interface PluginUpdateResult {
  pluginId: string;
  installedVersion?: string;
  updatedTargets: PluginUpdateTarget[];
  failedTargets: PluginUpdateTarget[];
  restartRequired: boolean;
}

export interface PluginUpdateRequest {
  pluginId: string;
  version: string;
  runtime?: "panel" | "daemon";
  panel: boolean;
  daemonIds: string[];
}

export interface PluginUpdateBatchResult extends PanelRestartResponse {
  results: Array<{ pluginId: string; result?: PluginUpdateResult; error?: string }>;
}
