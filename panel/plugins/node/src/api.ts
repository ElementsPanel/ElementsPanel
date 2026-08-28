import { useDefineApi } from "@/stores/useDefineApi";
import type { NodeStatus } from "@/types";

export const remoteNodeList = useDefineApi<any, NodeStatus[]>({
  url: "/api/service/remote_services_list"
});

export const editNode = useDefineApi<
  {
    params: { uuid: string };
    data: {
      apiKey?: string;
      ip?: string;
      port?: number;
      prefix?: string;
      remarks?: string;
      setting?: any;
      [key: string]: any;
    };
  },
  any
>({
  url: "/api/service/remote_service",
  method: "PUT"
});

export const addNode = useDefineApi<
  {
    data: {
      ip: string;
      port: number;
      remarks: string;
      apiKey: string;
      [key: string]: any;
    };
  },
  any
>({
  url: "/api/service/remote_service",
  method: "POST"
});

export const deleteNode = useDefineApi<
  { params: { uuid: string } },
  any
>({
  url: "/api/service/remote_service",
  method: "DELETE"
});

export const connectNode = useDefineApi<
  { params: { uuid: string } },
  any
>({
  url: "/api/service/link_remote_service",
  method: "GET"
});

