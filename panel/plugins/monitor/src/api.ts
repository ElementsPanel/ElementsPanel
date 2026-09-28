import { useDefineApi } from "@/stores/useDefineApi";
import type { OperationLoggerItem } from "@/types/operationLog";

/** The panel-wide operation log shown by the monitoring page. */
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

/** Operation logs for the instance console's monitor-provided log action. */
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
