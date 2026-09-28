import { useDefineApi } from "@/stores/useDefineApi";

export const uploadFile = useDefineApi<
  {
    data: FormData;
  },
  string
>({
  method: "POST",
  headers: { "Content-Type": "multipart/form-data" },
  url: "/api/overview/upload_assets"
});
