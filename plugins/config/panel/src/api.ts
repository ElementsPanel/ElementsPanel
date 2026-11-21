import type { PluginChangeResult, PluginSettingsPage, PluginState } from "../../../../core/common/src/plugin_contract";
export type { PluginChangeResult };
import { useDefineApi } from "@elementspanel/epanel-plugin-console/stores/useDefineApi";


export interface PluginRecord {
  packageName?: string;
  id: string;
  version?: string;
  description?: string;
  priority?: number;
  /** Enabled state after applying data/plugin-overrides.json. */
  enabled: boolean;
  sides: { backend: boolean; frontend: boolean };
  /** Current panel backend state. */
  running: boolean;
  state?: PluginState;
  result?: PluginChangeResult;
  error?: string;
  hasSettings?: boolean;
  canResetSettings?: boolean;
  removable: boolean;
}

/** Link fields navigate without reading or writing a value. */
export type SettingFieldType =
  | "string"
  | "color"
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "list"
  | "link";

export interface SettingOption {
  value: string | number | boolean;
  label: string;
}

/** Field labels are already translated by the backend. */
export interface SettingField {
  page?: PluginSettingsPage;
  key?: string;
  type: SettingFieldType;
  title: string;
  description?: string;
  placeholder?: string;
  unit?: string;
  min?: number;
  max?: number;
  control?: "slider";
  options?: SettingOption[];
  secret?: boolean;
  /** `string`: offer the installed file manager's upload dialog. */
  fileUpload?: boolean;
  /** All conditions must match: a truthy field name or "name=value". */
  visibleWhen?: string | string[];
  /** `link`: a frontend route the form offers as a button. */
  route?: string;
  fields?: SettingField[];
  maxItems?: number;
  itemTitleKey?: string;
  listEditor?: "inline" | "dialog";
  addLabel?: string;
  editLabel?: string;
  removeLabel?: string;
  required?: boolean;
}

export interface SettingsSchema {
  id: string;
  fields: SettingField[];
  values: Record<string, unknown>;
}

/** Custom plugin group persisted on its host. */
export interface PluginGroup {
  id: string;
  name: string;
  pluginIds: string[];
}

export interface PluginRemark {
  id: string;
  remarks: string;
}

export const pluginRemarkList = useDefineApi<{ params?: { daemonId?: string } }, PluginRemark[]>({
  url: "/api/plugins/remarks",
  method: "GET"
});

export const updatePluginRemark = useDefineApi<
  { params?: { daemonId?: string }; data: PluginRemark },
  PluginRemark
>({
  url: "/api/plugins/remarks",
  method: "PUT"
});

/** Every installed plugin, disabled ones included. */
export const pluginList = useDefineApi<unknown, PluginRecord[]>({
  url: "/api/plugins",
  method: "GET"
});

/** Persist and apply the panel plugin's enabled state. */
export const setPluginEnabled = useDefineApi<
  { data: { id: string; enabled: boolean } },
  PluginRecord
>({
  url: "/api/plugins/enabled",
  method: "PUT"
});

export const removePlugin = useDefineApi<{ params: { id: string; removeConfig?: boolean } }, void>({
  url: "/api/plugins",
  method: "DELETE"
});

export const installPlugin = useDefineApi<
  { data: { name: string; version?: string } },
  PluginRecord
>({ url: "/api/plugins/npm/install", method: "POST" });

export const installNodePlugin = useDefineApi<
  { params: { daemonId: string }; data: { name: string; version?: string } },
  NodePluginRecord
>({ url: "/api/plugins/node/npm/install", method: "POST" });

export const pluginSettings = useDefineApi<{ params: { id: string } }, SettingsSchema | null>({
  url: "/api/plugins/settings",
  method: "GET"
});

export const updatePluginSettings = useDefineApi<
  { params: { id: string }; data: Record<string, unknown> },
  PluginChangeResult | boolean
>({
  url: "/api/plugins/settings",
  method: "PUT"
});

export const resetPluginSettings = useDefineApi<
  { params: { id: string } },
  PluginChangeResult
>({
  url: "/api/plugins/settings/reset",
  method: "POST"
});

export const pluginGroupList = useDefineApi<unknown, PluginGroup[]>({
  url: "/api/plugins/groups",
  method: "GET"
});

export const updatePluginGroupList = useDefineApi<
  { data: { groups: PluginGroup[] } },
  PluginGroup[]
>({
  url: "/api/plugins/groups",
  method: "PUT"
});

// Resolve node requests through the optional remote service.

export interface NodeSummary {
  uuid: string;
  remarks: string;
  ip: string;
  port: number;
  available: boolean;
}

export interface NodePluginRecord {
  packageName?: string;
  id: string;
  name?: string;
  version?: string;
  description?: string;
  priority?: number;
  /** Enabled state after applying data/plugin-overrides.json. */
  enabled: boolean;
  hasEntry: boolean;
  /** Current daemon backend state. */
  running: boolean;
  state?: PluginState;
  result?: PluginChangeResult;
  error?: string;
  hasSettings?: boolean;
  canResetSettings?: boolean;
  removable: boolean;
}

export const nodeList = useDefineApi<unknown, NodeSummary[]>({
  url: "/api/plugins/node/list",
  method: "GET"
});

/** Fetch the selected daemon's plugin inventory. */
export const nodePluginList = useDefineApi<{ params: { daemonId: string } }, NodePluginRecord[]>({
  url: "/api/plugins/node/plugins",
  method: "GET"
});

/** Persist and apply the daemon plugin's enabled state. */
export const setNodePluginEnabled = useDefineApi<
  { params: { daemonId: string }; data: { id: string; enabled: boolean } },
  NodePluginRecord
>({
  url: "/api/plugins/node/enabled",
  method: "PUT"
});

export const removeNodePlugin = useDefineApi<
  { params: { daemonId: string; id: string; removeConfig?: boolean } },
  void
>({
  url: "/api/plugins/node",
  method: "DELETE"
});

export const nodePluginSettings = useDefineApi<
  { params: { daemonId: string; id: string } },
  SettingsSchema | null
>({
  url: "/api/plugins/node/settings",
  method: "GET"
});

export const updateNodePluginSettings = useDefineApi<
  { params: { daemonId: string; id: string }; data: Record<string, unknown> },
  PluginChangeResult | boolean
>({
  url: "/api/plugins/node/settings",
  method: "PUT"
});

export const resetNodePluginSettings = useDefineApi<
  { params: { daemonId: string; id: string } },
  PluginChangeResult
>({
  url: "/api/plugins/node/settings/reset",
  method: "POST"
});

export const nodePluginGroupList = useDefineApi<{ params: { daemonId: string } }, PluginGroup[]>({
  url: "/api/plugins/node/groups",
  method: "GET"
});

export const updateNodePluginGroupList = useDefineApi<
  { params: { daemonId: string }; data: { groups: PluginGroup[] } },
  PluginGroup[]
>({
  url: "/api/plugins/node/groups",
  method: "PUT"
});
