import { useDefineApi } from "@/stores/useDefineApi";

// Every HTTP call the plugin manager page makes. The container owns the
// mechanism; this plugin's backend only exposes it.

/** One installed plugin, as the panel reports it. */
export interface PluginRecord {
  id: string;
  name?: string;
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
