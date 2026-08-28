import { useDefineApi } from "@/stores/useDefineApi";
import type { InstanceDetail, PanelStatus, Settings } from "@/types";
import type { BaseUserInfo, EditUserInfo, LoginUserInfo, UserInstance } from "@/types/user";
export { addNode, connectNode, deleteNode, editNode, remoteNodeList } from "./node";

export const panelInstall = useDefineApi<
  {
    data: {
      username: string;
      password: string;
    };
  },
  any
>({
  url: "/api/auth/install",
  method: "POST"
});

export const updateSettings = useDefineApi<
  {
    data: {
      language: string;
    };
  },
  any
>({
  url: "/api/overview/install",
  method: "PUT"
});

export const panelStatus = useDefineApi<any, PanelStatus>({
  url: "/api/auth/status",
  method: "GET"
});

export const loginUser = useDefineApi<
  | {
    // Post
    data: {
      username: string;
      password: string;
    };
  }
  | undefined,
  // Response
  string
>({
  url: "/api/auth/login",
  method: "POST"
});

export const loginPageInfo = useDefineApi<
  any,
  {
    loginInfo: string;
  }
>({
  url: "/api/auth/login_info",
  method: "GET"
});

export const logoutUser = useDefineApi<any, any>({
  url: "/api/auth/logout",
  method: "GET"
});

export const userInfoApi = useDefineApi<any, LoginUserInfo>({
  url: "/api/auth/"
});

export const userInfoApiAdvanced = useDefineApi<
  {
    params: {
      uuid: string;
      advanced: boolean;
    };
  },
  BaseUserInfo
>({
  url: "/api/auth/"
});

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

export const settingInfo = useDefineApi<any, Settings>({
  url: "/api/overview/setting"
});

export const setSettingInfo = useDefineApi<
  | {
    data: Partial<Settings>;
  }
  | undefined,
  string
>({
  url: "/api/overview/setting",
  method: "PUT"
});

export const getUserInfo = useDefineApi<
  {
    params: {
      userName: string;
      page: number;
      page_size: number;
      role: string;
    };
  },
  { total: number; pageSize: number; page: number; maxPage: number; data: BaseUserInfo[] }
>({
  url: "/api/auth/search",
  method: "GET"
});

export const deleteUser = useDefineApi<
  {
    data: string[];
  },
  any
>({
  url: "/api/auth",
  method: "DELETE"
});

export const addUser = useDefineApi<
  {
    data: {
      username: string;
      password: string;
      permission: number;
    };
  },
  {
    uuid: string;
  }
>({
  url: "/api/auth",
  method: "POST"
});

export const editUserInfo = useDefineApi<
  {
    data: {
      config: EditUserInfo;
      uuid: string;
    };
  },
  boolean
>({
  url: "/api/auth",
  method: "PUT"
});

export const updateUserInstance = useDefineApi<
  {
    data: {
      config: {
        instances: UserInstance[];
      };
      uuid: string;
    };
  },
  boolean
>({
  url: "/api/auth",
  method: "PUT"
});

export const overviewInfo = useDefineApi<any, IPanelOverviewResponse>({
  url: "/api/overview"
});

export interface SsoPublicConfig {
  enabled: boolean;
  onlyMode: boolean;
  autoRedirect: boolean;
  providerName: string;
  iconUrl: string;
}

export const ssoConfig = useDefineApi<any, SsoPublicConfig | null>({
  url: "/api/auth/sso/config",
  method: "GET"
});

export const ssoBindLogin = useDefineApi<
  {
    data: {
      username: string;
      password: string;
      code?: string;
    };
  },
  string
>({
  url: "/api/auth/sso/bind",
  method: "POST"
});

export const ssoBindCurrent = useDefineApi<any, boolean>({
  url: "/api/auth/sso/bind-current",
  method: "POST"
});

export const ssoUnbind = useDefineApi<
  {
    data: {
      uuid: string;
    };
  },
  boolean
>({
  url: "/api/auth/sso/unbind",
  method: "PUT"
});
