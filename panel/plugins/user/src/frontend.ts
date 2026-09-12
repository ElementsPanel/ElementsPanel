import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugin";
import { useAppStateStore } from "@/stores/useAppStateStore";
import * as userApi from "./api";
import MyselfInfoDialog from "./components/MyselfInfoDialog.vue";
import DesktopLoginWindow from "./desktop/DesktopLoginWindow.vue";
import DesktopUserInfo from "./desktop/DesktopUserInfo.vue";
import DesktopUsers from "./desktop/DesktopUsers.vue";
import { localeMessages } from "./i18n";
import CustomerPage from "./views/CustomerPage.vue";
import LoginPage from "./views/Login.vue";
import SsoBindLogin from "./views/SsoBindLogin.vue";
import UserAccessSettings from "./widgets/AccessSettings.vue";
import UserList from "./widgets/UserList.vue";

const ROLE_ADMIN = 10;
const ROLE_USER = 1;
const ROLE_GUEST = 0;

export const inject = ["console", "i18n", "routes", "ui", "instance"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);

  // Everything the console implementation needs from the account API and the windows the
  // Desktop plugin mounts. Resolved at call time, so unloading this plugin
  // takes authentication with it.
  ctx.set("user", {
    api: userApi,
    desktopLoginWindow: DesktopLoginWindow,
    desktopUsers: DesktopUsers,
    desktopUserInfo: DesktopUserInfo,
    desktopStartMenuAvatar: "mdi-account-outline"
  });

  // Authentication settings are declared by this plugin's backend, so the plugin
  // manager renders them and this half contributes no form.

  ctx.ui.globalComponent(MyselfInfoDialog);

  ctx.routes.add({
    path: "/login",
    name: t("TXT_CODE_24873a8a"),
    component: LoginPage,
    meta: {
      permission: ROLE_GUEST,
      mainMenu: false
    }
  });

  ctx.routes.add({
    path: "/sso/bind",
    name: t("TXT_CODE_SSO_BIND_TITLE"),
    component: SsoBindLogin,
    meta: {
      permission: ROLE_GUEST,
      mainMenu: false
    }
  });

  ctx.routes.add({
    path: "/customer",
    name: t("TXT_CODE_ec299306"),
    component: CustomerPage,
    meta: {
      permission: ROLE_USER,
      mainMenu: true,
      icon: "mdi-account-outline",
      // Admins work from `/instances`; this page is the ordinary user's home.
      condition: () => !useAppStateStore().isAdmin.value
    }
  });

  ctx.routes.add({
    path: "/users",
    name: t("TXT_CODE_1deaa2dd"),
    component: UserList,
    meta: {
      mainMenu: true,
      permission: ROLE_ADMIN,
      icon: "mdi-account-group-outline"
    }
  });

  ctx.routes.add({
    path: "/users/resources",
    name: t("TXT_CODE_236f70aa"),
    component: UserAccessSettings,
    meta: {
      permission: ROLE_ADMIN,
      breadcrumbs: [
        {
          name: t("TXT_CODE_1deaa2dd"),
          path: "/users",
          mainMenu: true,
          permission: ROLE_ADMIN
        }
      ]
    }
  });
}

export { ROLE_ADMIN, ROLE_GUEST, ROLE_USER };
