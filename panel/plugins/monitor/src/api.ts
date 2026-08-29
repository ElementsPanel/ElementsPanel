import { useDefineApi } from "@/stores/useDefineApi";
import type { OperationLoggerItem } from "@/types/operationLog";

/**
 * The panel-wide operation log the monitoring page lists. Per-instance logs live
 * in the core's `@/services/apis/operationLog`, because the instance pages read
 * those whether or not this plugin is installed.
 */
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
