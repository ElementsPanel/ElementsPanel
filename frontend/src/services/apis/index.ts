import { useDefineApi } from "@/stores/useDefineApi";
import type { InstanceDetail, PanelStatus, Settings } from "@/types";
export { addNode, connectNode, deleteNode, editNode, remoteNodeList } from "./node";
// Account APIs live in the "user" plugin; these are facades over its
// `user.api` service so existing call sites keep working.
export {
  addUser,
  bind2FA,
  confirm2FA,
  deleteUser,
  editUserInfo,
  getUserInfo,
  isUserPluginLoaded,
  loginPageInfo,
  loginUser,
  logoutUser,
  panelInstall,
  queryUsername,
  setUserApiKey,
  ssoBindCurrent,
  ssoBindLogin,
  ssoConfig,
  ssoUnbind,
  updatePassword,
  updateUserInstance,
  userInfoApi,
  userInfoApiAdvanced,
  type SsoPublicConfig
} from "./user";

export const panelStatus = useDefineApi<any, PanelStatus>({
  url: "/api/auth/status",
  method: "GET"
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

export const overviewInfo = useDefineApi<any, IPanelOverviewResponse>({
  url: "/api/overview"
});
