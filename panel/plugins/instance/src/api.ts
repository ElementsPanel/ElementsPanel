import { useDefineApi } from "@/stores/useDefineApi";
import type { MinecraftServerSelection } from "../../../../common/src/minecraft";
import type { RemoteMappingEntry } from "@/tools/protocol";
import type {
  ContainerInfo,
  DockerNetworkModes,
  ImageInfo,
  InstanceDetail,
  JsonData,
  NewScheduleTask,
  Schedule
} from "@/types";

export const remoteInstances = useDefineApi<
  {
    params: {
      daemonId: string;
      page: number;
      page_size: number;
      instance_name?: string;
      status?: string;
      tag?: string;
    };
  },
  {
    maxPage: 1;
    page: 1;
    pageSize: 10;
    data: InstanceDetail[];
    allTags: string[];
  }
>({
  url: "/api/service/remote_service_instances"
});

export const getInstanceInfo = useDefineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
    };
  },
  InstanceDetail
>({
  url: "/api/instance",
  method: "GET"
});

export const openInstance = useDefineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
    };
  },
  {
    instanceUuid: string;
  }
>({
  url: "/api/protected_instance/open",
  method: "GET",
  forceRequest: true
});

export const stopInstance = useDefineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
    };
  },
  {
    instanceUuid: string;
  }
>({
  url: "/api/protected_instance/stop",
  method: "GET",
  forceRequest: true
});

export const restartInstance = useDefineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
    };
  },
  {
    instanceUuid: string;
  }
>({
  url: "/api/protected_instance/restart",
  method: "GET",
  forceRequest: true
});

export const killInstance = useDefineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
    };
  },
  {
    instanceUuid: string;
  }
>({
  url: "/api/protected_instance/kill",
  method: "GET",
  forceRequest: true
});

export const updateInstance = useDefineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
      task_name: string;
    };
    data: {
      time: number;
    };
  },
  boolean
>({
  url: "/api/protected_instance/asynchronous",
  method: "POST"
});

export const updateInstanceConfig = useDefineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
    };
    data: {
      terminalOption?: {
        haveColor: boolean;
        pty: boolean;
      };
      crlf?: number;
      ie?: string;
      oe?: string;
      tag?: string[];
      stopCommand?: string;
      eventTask?: {
        autoRestart: boolean;
        autoRestartMaxTimes: number;
        autoStart: boolean;
      };
      pingConfig?: {
        ip?: string;
        port?: number;
        type?: number;
      };
    };
  },
  {
    instanceUuid: string;
  }
>({
  url: "/api/protected_instance/instance_update",
  method: "PUT"
});

export const updateAnyInstanceConfig = useDefineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
    };
    data: IGlobalInstanceConfig;
  },
  {
    instanceUuid: string;
  }
>({
  url: "/api/instance",
  method: "PUT"
});

export const uploadAddress = useDefineApi<
  {
    params: {
      upload_dir: string;
      daemonId: string;
    };
    data: IGlobalInstanceConfig;
  },
  {
    instanceUuid: string;
    password: string;
    addr: string;
    remoteMappings: RemoteMappingEntry[];
  }
>({
  url: "/api/instance/upload",
  method: "POST"
});

export const uploadInstanceFile = useDefineApi<
  {
    params: {
      unzip: number;
      code: string;
    };
    data: FormData;
  },
  any
>({
  method: "POST",
  headers: { "Content-Type": "multipart/form-data" }
});

export const createInstance = useDefineApi<
  {
    params: {
      daemonId: string;
    };
    data: IGlobalInstanceConfig;
  },
  {
    instanceUuid: string;
    config: IGlobalInstanceConfig;
  }
>({
  method: "POST",
  url: "/api/instance"
});

export const minecraftServers = useDefineApi<{}, string[]>({
  url: "/api/instance/minecraft/servers",
  // Each selection owns its abort signal; metadata caching lives on the panel.
  forceRequest: true,
  timeout: 30000
});

export const minecraftVersions = useDefineApi<
  { params: { server: string } },
  { versions: string[]; description: string }
>({ url: "/api/instance/minecraft/versions", forceRequest: true, timeout: 30000 });

export const minecraftBuilds = useDefineApi<
  { params: { server: string; version: string } },
  string[]
>({ url: "/api/instance/minecraft/builds", forceRequest: true, timeout: 30000 });

export const createMinecraftInstance = useDefineApi<
  {
    params: { daemonId: string };
    data: { selection: MinecraftServerSelection; config: IGlobalInstanceConfig };
  },
  { instanceUuid: string; taskId: string; status: number }
>({ url: "/api/instance/minecraft", method: "POST", forceRequest: true, timeout: 60000 });

export const minecraftInstallCapability = useDefineApi<
  { params: { daemonId: string } },
  { supported: boolean }
>({ url: "/api/instance/minecraft/capability", forceRequest: true });

export const createAsyncTask = useDefineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
      task_name: string;
    };
    data: {
      time: number;
      newInstanceName: string;
      targetLink?: string;
      setupInfo?: JsonData;
    };
  },
  {
    instanceConfig: IGlobalInstanceConfig;
    instanceStatus: number;
    instanceUuid: string;
    status: number;
    taskId: string;
  }
>({
  url: "/api/protected_instance/asynchronous",
  method: "POST"
});

export const queryAsyncTask = useDefineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
      task_name: string;
    };
    data: {
      taskId: string;
    };
  },
  {
    taskId: string;
    status: number;
    detail: {
      instanceConfig: IGlobalInstanceConfig;
      instanceStatus: number;
      instanceUuid: string;
      status: number;
      taskId: string;
      downloadProgress?: {
        percentage: number;
        downloadedBytes: number;
        totalBytes: number;
        speed: number;
        eta: number;
      };
    };
  }
>({
  url: "/api/protected_instance/query_asynchronous",
  method: "POST"
});

export const getConfigFileList = useDefineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
    };
    data: {
      files: string[];
    };
  },
  {
    check: boolean;
    file: string;
  }[]
>({
  method: "POST",
  url: "/api/protected_instance/process_config/list"
});

export const getConfigFile = useDefineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
      fileName: string;
      type: string;
    };
  },
  any
>({
  method: "GET",
  url: "/api/protected_instance/process_config/file"
});

export const updateConfigFile = useDefineApi<
  {
    params: {
      uuid: string;
      daemonId: string;
      fileName: string;
      type: string;
    };
    data: any;
  },
  boolean
>({
  method: "PUT",
  url: "/api/protected_instance/process_config/file"
});

export const batchStart = useDefineApi<
  {
    data: {
      instanceUuid: string;
      daemonId: string;
    }[];
  },
  boolean
>({
  method: "POST",
  url: "/api/instance/multi_open"
});

export const batchStop = useDefineApi<
  {
    data: {
      instanceUuid: string;
      daemonId: string;
    }[];
  },
  boolean
>({
  method: "POST",
  url: "/api/instance/multi_stop"
});

export const batchKill = useDefineApi<
  {
    data: {
      instanceUuid: string;
      daemonId: string;
    }[];
  },
  boolean
>({
  method: "POST",
  url: "/api/instance/multi_kill"
});

export const batchRestart = useDefineApi<
  {
    data: {
      instanceUuid: string;
      daemonId: string;
    }[];
  },
  boolean
>({
  method: "POST",
  url: "/api/instance/multi_restart"
});

export interface InstanceDeleteResult {
  instances: { instanceUuid: string; nickname: string }[];
  errors?: { instanceUuid: string; error: string }[];
}

export const batchDelete = useDefineApi<
  {
    params: {
      daemonId: string;
    };
    data: {
      uuids: string[];
      deleteFile: boolean;
    };
  },
  InstanceDeleteResult
>({
  method: "DELETE",
  url: "/api/instance"
});

export const scheduleList = useDefineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
    };
  },
  Schedule[]
>({
  method: "GET",
  url: "/api/protected_schedule"
});

export const scheduleDelete = useDefineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
      task_name: string;
    };
  },
  boolean
>({
  method: "DELETE",
  url: "/api/protected_schedule"
});

export const scheduleCreate = useDefineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
    };
    data: NewScheduleTask & { replaceName?: string };
  },
  boolean
>({
  url: "/api/protected_schedule",
  method: "POST"
});

export const imageList = useDefineApi<
  {
    params: {
      daemonId: string;
      imageId?: string;
    };
    data?: {
      dockerFile: string;
      name: string;
      tag: string;
    };
    method: string;
  },
  ImageInfo[]
>({
  url: "/api/environment/image"
});

export const getNetworkModeList = useDefineApi<
  {
    params: {
      daemonId: string;
    };
  },
  DockerNetworkModes[]
>({
  url: "/api/environment/networkModes",
  method: "GET"
});

export const containerList = useDefineApi<
  {
    params: {
      daemonId: string;
      imageId?: string;
    };
  },
  ContainerInfo[]
>({
  url: "/api/environment/containers",
  method: "GET"
});

export const buildProgress = useDefineApi<
  {
    params: {
      daemonId: string;
    };
  },
  {
    [propsName: string]: number;
  }
>({
  url: "/api/environment/progress",
  method: "GET"
});

export const getImagePlatforms = useDefineApi<
  {
    params: {
      daemonId: string;
    };
    data: {
      imageName: string;
    };
  },
  string[]
>({
  url: "/api/environment/image_platforms",
  method: "POST"
});

export const getDockerHubImagePlatforms = useDefineApi<
  {
    data: {
      imageName: string;
    };
  },
  string[]
>({
  url: "/api/environment/dockerhub_image_platforms",
  method: "POST"
});
