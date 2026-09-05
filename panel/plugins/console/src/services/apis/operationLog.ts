import { useDefineApi } from "@/stores/useDefineApi";

export const logInstanceCrash = useDefineApi<
  {
    data: {
      daemonId: string;
      instanceId: string;
      instanceName?: string;
      exitCode?: number;
    };
  },
  { ok: boolean }
>({
  url: "/api/overview/instance_crash",
  method: "POST"
});

export const logInstanceAutoRestart = useDefineApi<
  {
    data: {
      daemonId: string;
      instanceId: string;
      instanceName?: string;
    };
  },
  { ok: boolean }
>({
  url: "/api/overview/instance_auto_restart",
  method: "POST"
});
