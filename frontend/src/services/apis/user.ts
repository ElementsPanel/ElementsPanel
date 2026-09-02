import { usePluginService } from "@/plugin/context";
import type { BaseUserInfo, EditUserInfo, LoginUserInfo, UserInstance } from "@/types/user";
import type { Ref } from "vue";

/**
 * Facade over the account API, which is owned by the "user" panel plugin.
 *
 * Panel core and other plugins keep importing these names from
 * `@/services/apis`; the real definitions are registered by the plugin as the
 * `user.api` service and resolved at call time, so unloading the plugin takes
 * the API with it. Without the plugin the panel runs unauthenticated and
 * nothing should be calling these — guard with `isUserPluginLoaded()` or with
 * `useAppStateStore().authEnabled`.
 *
 * Imports `@/plugin/context` rather than `@/plugin` on purpose: the barrel pulls
 * the whole card and route registry into the app entry graph.
 */

export interface ApiCall<P, T> {
  isLoading: Ref<boolean>;
  state: Ref<T | undefined>;
  isReady: Ref<boolean>;
  execute: (config?: P & Record<string, any>) => Promise<Ref<T | undefined>>;
}

export interface SsoPublicConfig {
  enabled: boolean;
  onlyMode: boolean;
  autoRedirect: boolean;
  providerName: string;
  iconUrl: string;
}

export interface UserPluginApi {
  loginUser: () => ApiCall<
    { data: { username: string; password: string; code?: string } } | undefined,
    string
  >;
  loginPageInfo: () => ApiCall<any, { loginInfo: string }>;
  logoutUser: () => ApiCall<any, any>;
  userInfoApi: () => ApiCall<any, LoginUserInfo>;
  userInfoApiAdvanced: () => ApiCall<
    { params: { uuid: string; advanced: boolean } },
    BaseUserInfo
  >;
  getUserInfo: () => ApiCall<
    { params: { userName: string; page: number; page_size: number; role: string } },
    { total: number; pageSize: number; page: number; maxPage: number; data: BaseUserInfo[] }
  >;
  deleteUser: () => ApiCall<{ data: string[] }, any>;
  addUser: () => ApiCall<
    { data: { username: string; password: string; permission: number } },
    { uuid: string }
  >;
  editUserInfo: () => ApiCall<{ data: { config: EditUserInfo; uuid: string } }, boolean>;
  updateUserInstance: () => ApiCall<
    { data: { config: { instances: UserInstance[] }; uuid: string } },
    boolean
  >;
  setUserApiKey: () => ApiCall<{ data: { enable: boolean } }, string>;
  updatePassword: () => ApiCall<{ data: { passWord: string } }, boolean>;
  bind2FA: () => ApiCall<any, string>;
  confirm2FA: () => ApiCall<{ data: { enable: boolean; TOTPCode: string } }, undefined>;
  queryUsername: () => ApiCall<
    { params: { username: string } },
    { uuid?: string; userName?: string }
  >;
  ssoConfig: () => ApiCall<any, SsoPublicConfig | null>;
  ssoBindLogin: () => ApiCall<
    { data: { username: string; password: string; code?: string } },
    string
  >;
  ssoBindCurrent: () => ApiCall<any, boolean>;
  ssoUnbind: () => ApiCall<{ data: { uuid: string } }, boolean>;
}

export function isUserPluginLoaded(): boolean {
  return usePluginService("user") != null;
}

function resolveUserApi(): UserPluginApi {
  const user = usePluginService<{ api: UserPluginApi }>("user");
  if (!user) {
    throw new Error('Panel frontend plugin "user" is not loaded.');
  }
  return user.api;
}

export const loginUser = () => resolveUserApi().loginUser();
export const loginPageInfo = () => resolveUserApi().loginPageInfo();
export const logoutUser = () => resolveUserApi().logoutUser();
export const userInfoApi = () => resolveUserApi().userInfoApi();
export const userInfoApiAdvanced = () => resolveUserApi().userInfoApiAdvanced();
export const getUserInfo = () => resolveUserApi().getUserInfo();
export const deleteUser = () => resolveUserApi().deleteUser();
export const addUser = () => resolveUserApi().addUser();
export const editUserInfo = () => resolveUserApi().editUserInfo();
export const updateUserInstance = () => resolveUserApi().updateUserInstance();
export const setUserApiKey = () => resolveUserApi().setUserApiKey();
export const updatePassword = () => resolveUserApi().updatePassword();
export const bind2FA = () => resolveUserApi().bind2FA();
export const confirm2FA = () => resolveUserApi().confirm2FA();
export const queryUsername = () => resolveUserApi().queryUsername();
export const ssoConfig = () => resolveUserApi().ssoConfig();
export const ssoBindLogin = () => resolveUserApi().ssoBindLogin();
export const ssoBindCurrent = () => resolveUserApi().ssoBindCurrent();
export const ssoUnbind = () => resolveUserApi().ssoUnbind();
