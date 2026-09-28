import { useDefineApi } from "@/stores/useDefineApi";
import type { JavaRuntime } from "./types";
import type { JavaCatalog } from "../../../../common/src/java";

export const getJavaList = useDefineApi<
  {
    params: {
      daemonId: string;
      instanceId?: string;
    };
  },
  JavaRuntime[]
>({
  url: "/api/java_manager/list",
  method: "GET"
});

export const addJava = useDefineApi<
  {
    params: {
      daemonId: string;
    };
    data: {
      name: string;
      path: string;
    };
  },
  Boolean
>({
  url: "/api/java_manager/add",
  method: "POST"
});

export const downloadJava = useDefineApi<
  {
    params: {
      daemonId: string;
      instanceId?: string;
    };
    data: {
      name: string;
      version: string;
    };
  },
  JavaRuntime
>({
  url: "/api/java_manager/download",
  method: "POST",
  forceRequest: true,
  timeout: 60000
});

export const getJavaCatalog = useDefineApi<{ params: { daemonId: string } }, JavaCatalog>({
  url: "/api/java_manager/catalog",
  method: "GET",
  forceRequest: true,
  timeout: 30000
});

export const usingJava = useDefineApi<
  {
    params: {
      daemonId: string;
      instanceId: string;
    };
    data: {
      id: string;
    };
  },
  Boolean
>({
  url: "/api/java_manager/using",
  method: "POST"
});

export const deleteJava = useDefineApi<
  {
    params: {
      daemonId: string;
      instanceId: string;
    };
    data: {
      id: string;
    };
  },
  Boolean
>({
  url: "/api/java_manager/delete",
  method: "DELETE"
});
