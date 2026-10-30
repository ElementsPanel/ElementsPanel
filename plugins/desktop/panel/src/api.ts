import { useDefineApi } from "@/stores/useDefineApi";

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
