import { useDefineApi } from "@/stores/useDefineApi";
import type { OperationLoggerItem } from "@/types/operationLog";

export const getInstanceOperationLog = useDefineApi<
  {
    params: {
      daemonId: string;
      instanceId: string;
      limit?: number;
    };
  },
  OperationLoggerItem[]
>({
  url: "/api/overview/instance_operation_logs",
  method: "GET"
});

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
