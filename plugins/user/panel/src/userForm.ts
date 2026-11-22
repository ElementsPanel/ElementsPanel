import type { BaseUserInfo, EditUserInfo } from "@elementspanel/epanel-plugin-console/types/user";

export const createUserDraft = (): EditUserInfo => ({
  uuid: "",
  userName: "",
  passWord: "",
  loginTime: "",
  registerTime: "",
  instances: [],
  permission: 1,
  apiKey: "",
  isInit: false,
  secret: "",
  open2FA: false,
  ssoSub: "",
  ssoBound: false
});

export const createUserEdit = (
  user: BaseUserInfo,
  changes: Pick<EditUserInfo, "userName" | "passWord" | "permission">
): EditUserInfo => ({
  uuid: user.uuid,
  userName: changes.userName,
  passWord: changes.passWord,
  permission: changes.permission,
  loginTime: user.loginTime,
  registerTime: user.registerTime,
  instances: user.instances || [],
  apiKey: user.apiKey || "",
  isInit: user.isInit || false,
  secret: user.secret || "",
  open2FA: user.open2FA || false,
  ssoSub: user.ssoSub || "",
  ssoBound: user.ssoBound || false
});
