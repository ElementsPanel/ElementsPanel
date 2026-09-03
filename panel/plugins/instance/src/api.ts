import { useDefineApi } from "@/stores/useDefineApi";
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
  method: "GET"
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
  method: "GET"
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
  method: "GET"
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
  method: "GET"
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
  string[]
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
    data: NewScheduleTask;
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

export const getMcVersionsApi = useDefineApi<{}, string[]>({
  method: "GET",
  url: "/api/mod/mc_versions"
});

export const modListApi = useDefineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
      page?: number;
      pageSize?: number;
      folder?: string;
    };
  },
  {
    mods: any[];
    folders: string[];
    total: number;
    page: number;
    pageSize: number;
  }
>({
  method: "GET",
  url: "/api/mod/list"
});

export const toggleModApi = useDefineApi<
  {
    data: {
      daemonId: string;
      uuid: string;
      fileName: string;
    };
  },
  boolean
>({
  method: "POST",
  url: "/api/mod/toggle"
});

export const deleteModApi = useDefineApi<
  {
    data: {
      daemonId: string;
      uuid: string;
      fileName: string;
    };
  },
  boolean
>({
  method: "POST",
  url: "/api/mod/delete"
});

export const getModInfoApi = useDefineApi<
  {
    params: {
      hash: string;
    };
  },
  any
>({
  method: "GET",
  url: "/api/mod/info"
});

export const getModBatchInfoApi = useDefineApi<
  {
    data: {
      hashes: string[];
    };
  },
  Record<string, any>
>({
  method: "POST",
  url: "/api/mod/batch_info"
});

export const searchModsApi = useDefineApi<
  {
    params: {
      query: string;
      source?: string;
      version?: string;
      type?: string;
      loader?: string;
      environment?: string;
      offset?: number;
      limit?: number;
    };
  },
  any
>({
  method: "GET",
  url: "/api/mod/search"
});

export const getModVersionsApi = useDefineApi<
  {
    params: {
      projectId: string;
      source?: string;
    };
  },
  any[]
>({
  method: "GET",
  url: "/api/mod/versions"
});

export const downloadModApi = useDefineApi<
  {
    data: {
      daemonId: string;
      uuid: string;
      url: string;
      fileName: string;
      projectType?: string;
      fallbackUrl?: string;
    };
  },
  boolean
>({
  method: "POST",
  url: "/api/mod/download"
});

export const stopTransferApi = useDefineApi<
  {
    data: {
      daemonId: string;
      uuid: string;
      fileName: string;
      type: "download" | "upload";
      uploadId?: string;
    };
  },
  boolean
>({
  method: "POST",
  url: "/api/mod/stop_transfer"
});

export const getModConfigFilesApi = useDefineApi<
  {
    params: {
      daemonId: string;
      uuid: string;
      modId: string;
      type: string;
    };
  },
  any[]
>({
  method: "GET",
  url: "/api/mod/config_files"
});
