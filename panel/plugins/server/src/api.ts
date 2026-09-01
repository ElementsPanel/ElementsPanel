import { useDefineApi } from "@/stores/useDefineApi";

// The HTTP server's own settings. They used to live on the panel Settings page,
// but they only describe the web server this plugin runs, so the plugin owns the
// form that edits them.

export interface ServerSettings {
  /** Listening port. */
  httpPort: number;
  /** Listening address; empty means every interface. */
  httpIp: string;
  /** Sub-path the panel is served under; empty means the root. */
  prefix: string;
  ssl: boolean;
  sslPemPath: string;
  sslKeyPath: string;
  crossDomain: boolean;
  reverseProxyMode: boolean;
  reverseProxyHeader: string;
}

export const serverSettings = useDefineApi<any, ServerSettings>({
  url: "/api/server/settings",
  method: "GET"
});

export const updateServerSettings = useDefineApi<{ data: Partial<ServerSettings> }, boolean>({
  url: "/api/server/settings",
  method: "PUT"
});
