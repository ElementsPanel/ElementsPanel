import { useDefineApi } from "@elementspanel/epanel-plugin-console/stores/useDefineApi";
import type { OperationLoggerItem } from "@elementspanel/epanel-plugin-console/types/operationLog";

export const getOperationLog = useDefineApi<
  {
    data: {
      limit?: number;
    };
  },
  OperationLoggerItem[]
>({
  url: "/api/monitor/operation_logs",
  method: "GET"
});

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
