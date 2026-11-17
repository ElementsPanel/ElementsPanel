import { useDefineApi } from "@elementspanel/epanel-plugin-console/stores/useDefineApi";
import type { DesktopSettings } from "./settings";

export const getDesktopSettings = useDefineApi<unknown, DesktopSettings>({
  url: "/api/overview/desktop_settings",
  method: "GET"
});

export const getDesktopLayoutConfig = useDefineApi<any, any>({
  url: "/api/overview/desktop_layout",
  method: "GET"
});

export const setDesktopLayoutConfig = useDefineApi<
  {
    data: any;
  },
  any
>({
  url: "/api/overview/desktop_layout",
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  }
});
