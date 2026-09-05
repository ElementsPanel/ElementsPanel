import { useDefineApi } from "@/stores/useDefineApi";
import type { PanelStatus, Settings } from "@/types";
export { addNode, connectNode, deleteNode, editNode, remoteNodeList } from "./node";
export { remoteInstances } from "./instance";
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
