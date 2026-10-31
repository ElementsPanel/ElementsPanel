export interface PluginUpdateTarget {
  /** Omitted for the panel itself. */
  daemonId?: string;
  label: string;
  currentVersion: string;
}

export interface PluginUpdate {
  pluginId: string;
  name: string;
  displayName: string;
  version: string;
  targets: PluginUpdateTarget[];
}

export interface PluginUpdates {
  plugins: PluginUpdate[];
  uncheckedNodes: Array<{ daemonId: string; label: string }>;
}

export interface PluginUpdateResult {
  pluginId: string;
  installedVersion?: string;
  updatedTargets: PluginUpdateTarget[];
  failedTargets: PluginUpdateTarget[];
  restartRequired: boolean;
}
