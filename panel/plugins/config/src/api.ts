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
  /** Whether the plugin declared a configuration form. */
  hasSettings?: boolean;
}

// A plugin describes its configuration on its backend rather than shipping a
// component for it, so the page renders every form — panel and node alike — from
// the same description.

/** What a declared setting renders as. `link` reads and writes nothing. */
export type SettingFieldType =
  | "string"
  /** Multi-line string. */
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "link";

export interface SettingOption {
  value: string | number | boolean;
  label: string;
}

/** One row of a plugin's form, with its labels already translated. */
export interface SettingField {
  key?: string;
  type: SettingFieldType;
  title: string;
  description?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  options?: SettingOption[];
  secret?: boolean;
  /**
   * Shown only while every listed condition holds: a field name (truthy) or
   * `"name=value"`.
   */
  visibleWhen?: string | string[];
  /** `link`: a frontend route the form offers as a button. */
  route?: string;
}

/** One plugin's form and its current values. */
export interface SettingsSchema {
  id: string;
  fields: SettingField[];
  values: Record<string, unknown>;
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

/** One panel plugin's declared form and values, or `null` when it declared none. */
export const pluginSettings = useDefineApi<
  { params: { id: string } },
  SettingsSchema | null
>({
  url: "/api/plugins/settings",
  method: "GET"
});

export const updatePluginSettings = useDefineApi<
  { params: { id: string }; data: Record<string, unknown> },
  boolean
>({
  url: "/api/plugins/settings",
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
  /** Whether the plugin declared a configuration form. */
  hasSettings?: boolean;
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

/** One daemon plugin's declared form and values, straight from that daemon. */
export const nodePluginSettings = useDefineApi<
  { params: { daemonId: string; id: string } },
  SettingsSchema | null
>({
  url: "/api/plugins/node/settings",
  method: "GET"
});

export const updateNodePluginSettings = useDefineApi<
  { params: { daemonId: string; id: string }; data: Record<string, unknown> },
  boolean
>({
  url: "/api/plugins/node/settings",
  method: "PUT"
});
