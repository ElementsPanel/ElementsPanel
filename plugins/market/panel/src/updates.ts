export interface PluginUpdateTarget {
  /** Omitted for the panel itself. */
  daemonId?: string;
  label: string;
  currentVersion: string;
}

export interface PluginUpdate {
  /** Runtime packages use the same target selection and progress as plugins. */
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

export interface PluginUpdateBatchResult {
  results: Array<{ pluginId: string; result?: PluginUpdateResult; error?: string }>;
}
