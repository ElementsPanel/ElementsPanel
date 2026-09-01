import { useDefineApi } from "@/stores/useDefineApi";

// Every HTTP call the plugin manager page makes. The container owns the
// mechanism; this plugin's backend only exposes it.

/** One installed plugin, as the panel reports it. */
export interface PluginRecord {
  id: string;
  version?: string;
  description?: string;
  priority?: number;
  /** The persisted switch, as `plugin.json` holds it. */
  enabled: boolean;
  /** Which halves the manifest declares. */
  sides: { backend: boolean; frontend: boolean };
  /** Whether the backend half is running in the panel process right now. */
  running: boolean;
  /** Why the backend half is not running, when it should be. */
  error?: string;
}

/** Every installed plugin, disabled ones included. */
export const pluginList = useDefineApi<unknown, PluginRecord[]>({
  url: "/api/plugins",
  method: "GET"
});

/** Turns a plugin on or off, in `plugin.json` and in the running panel. */
export const setPluginEnabled = useDefineApi<
  { data: { id: string; enabled: boolean } },
  PluginRecord
>({
  url: "/api/plugins/enabled",
  method: "PUT"
});

// The node half of the page. These three exist only while `plugins/node` is
// installed, because they go through the panel's daemon connections.

/** One connected node, as the page lists it for selection. */
export interface NodeSummary {
  uuid: string;
  remarks: string;
  ip: string;
  port: number;
  available: boolean;
}

/** One plugin installed on a daemon, as that daemon reports it. */
export interface NodePluginRecord {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  priority?: number;
  /** The persisted switch, as the daemon's `plugin.json` holds it. */
  enabled: boolean;
  /** Whether the manifest names an entry module at all. */
  hasEntry: boolean;
  /** Whether the plugin is running in the daemon process right now. */
  running: boolean;
  /** Why it is not running, when it should be. */
  error?: string;
}

/** The nodes this panel can administer. */
export const nodeList = useDefineApi<unknown, NodeSummary[]>({
  url: "/api/plugins/node/list",
  method: "GET"
});

/** One node's plugin inventory, fetched from the daemon itself. */
export const nodePluginList = useDefineApi<
  { params: { daemonId: string } },
  NodePluginRecord[]
>({
  url: "/api/plugins/node/plugins",
  method: "GET"
});

/** Turns a plugin on or off on that node. The daemon applies it immediately. */
export const setNodePluginEnabled = useDefineApi<
  { params: { daemonId: string }; data: { id: string; enabled: boolean } },
  NodePluginRecord
>({
  url: "/api/plugins/node/enabled",
  method: "PUT"
});
