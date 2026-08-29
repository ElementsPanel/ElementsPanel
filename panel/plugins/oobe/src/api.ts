import { useDefineApi } from "@/stores/useDefineApi";

export const updateOobeSettings = useDefineApi<
  {
    data: {
      language: string;
    };
  },
  string
>({
  url: "/api/overview/install",
  method: "PUT"
});
