import { useDefineApi } from "@/stores/useDefineApi";
import type { BaseUserInfo, EditUserInfo, LoginUserInfo, UserInstance } from "@/types/user";
import type { SsoPublicConfig } from "@/services/apis/user";

// The real /api/auth definitions. The console plugin re-exports facades over
// these (see plugins/console/src/services/apis/user.ts) so nothing outside this plugin has
// to know they exist.

export const loginUser = useDefineApi<
  | {
      data: {
        username: string;
        password: string;
        code?: string;
      };
    }
  | undefined,
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

export const setUserApiKey = useDefineApi<
  {
    data: {
      enable: boolean;
    };
  },
  string
>({
  url: "/api/auth/api",
  method: "PUT"
});

export const updatePassword = useDefineApi<
  {
    data: {
      passWord: string;
    };
  },
  boolean
>({
  url: "/api/auth/update",
  method: "PUT"
});

export const bind2FA = useDefineApi<any, string>({
  url: "/api/auth/bind2fa",
  method: "POST"
});

export const confirm2FA = useDefineApi<
  {
    data: {
      enable: boolean;
      TOTPCode: string;
    };
  },
  undefined
>({
  url: "/api/auth/confirm2fa",
  method: "POST"
});

export const queryUsername = useDefineApi<
  {
    params: {
      username: string;
    };
  },
  {
    uuid?: string;
    userName?: string;
  }
>({
  url: "/api/auth/query_username",
  method: "GET"
});

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



export type { SsoPublicConfig };
