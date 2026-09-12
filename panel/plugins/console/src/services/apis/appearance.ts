import { useDefineApi } from "@/stores/useDefineApi";

export interface PanelAppearance {
  pageTitle: string;
  logoImage: string;
  backgroundImage: string;
}

/** Public: the shell reads it before authentication is restored. */
export const getAppearance = useDefineApi<unknown, PanelAppearance>({
  url: "/api/overview/appearance",
  method: "GET"
});
