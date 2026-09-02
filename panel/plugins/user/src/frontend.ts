import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugin";
import { UserOutlined } from "@ant-design/icons-vue";
import * as userApi from "./api";
import MyselfInfoDialog from "./components/MyselfInfoDialog.vue";
import DesktopLoginWindow from "./desktop/DesktopLoginWindow.vue";
import DesktopUserInfo from "./desktop/DesktopUserInfo.vue";
import DesktopUsers from "./desktop/DesktopUsers.vue";
import { localeMessages } from "./i18n";
import LoginPage from "./views/Login.vue";
import SsoBindLogin from "./views/SsoBindLogin.vue";
import UserAccessSettings from "./widgets/AccessSettings.vue";
import LoginCard from "./widgets/LoginCard.vue";
import UserInstanceList from "./widgets/UserInstanceList.vue";
import UserList from "./widgets/UserList.vue";
import UserStatusBlock from "./widgets/UserStatusBlock.vue";

const ROLE_ADMIN = 10;
const ROLE_USER = 1;
const ROLE_GUEST = 0;

export const inject = ["i18n", "routes", "ui"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);

  // Everything the panel core needs from the account API and the windows the
  // Desktop plugin mounts. Resolved at call time, so unloading this plugin
  // takes authentication with it.
  ctx.set("user", {
    api: userApi,
    desktopLoginWindow: DesktopLoginWindow,
    desktopUsers: DesktopUsers,
    desktopUserInfo: DesktopUserInfo,
    desktopStartMenuAvatar: UserOutlined
  });

  // Authentication settings are declared by this plugin's backend, so the plugin
  // manager renders them and this half contributes no form.

  ctx.ui.layoutCard("LoginCard", LoginCard);
  ctx.ui.layoutCard("UserList", UserList);
  ctx.ui.layoutCard("UserStatusBlock", UserStatusBlock);
  ctx.ui.layoutCard("UserInstanceList", UserInstanceList);
  ctx.ui.layoutCard("UserAccessSettings", UserAccessSettings);
  ctx.ui.globalComponent(MyselfInfoDialog);

  ctx.routes.add({
    path: "/login",
    name: t("TXT_CODE_24873a8a"),
    component: LoginPage,
    meta: {
      permission: ROLE_GUEST,
      onlyDisplayEditMode: true,
      customClass: ["nav-button-warning"]
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
    path: "/users",
    name: t("TXT_CODE_1deaa2dd"),
    component: () => import("@/views/LayoutContainer.vue"),
    meta: {
      mainMenu: true,
      permission: ROLE_ADMIN
    },
    children: [
      {
        path: "/users/resources",
        name: t("TXT_CODE_236f70aa"),
        component: () => import("@/views/LayoutContainer.vue"),
        meta: {
          permission: ROLE_ADMIN
        }
      }
    ]
  });

  ctx.routes.add({
    path: "/user",
    name: t("TXT_CODE_8c3164c9"),
    component: () => import("@/views/LayoutContainer.vue"),
    meta: {
      permission: ROLE_ADMIN,
      mainMenu: false
    }
  });
}

export { ROLE_ADMIN, ROLE_GUEST, ROLE_USER };
