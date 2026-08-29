import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugins";
import { UserOutlined } from "@ant-design/icons-vue";
import * as userApi from "./api";
import PluginConfig from "./PluginConfig.vue";
import MyselfInfoDialog from "./components/MyselfInfoDialog.vue";
import DesktopLoginWindow from "./desktop/DesktopLoginWindow.vue";
import DesktopUserInfo from "./desktop/DesktopUserInfo.vue";
import DesktopUsers from "./desktop/DesktopUsers.vue";
import InstallPage from "./views/Install.vue";
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

export default {
  // Authentication settings are edited through the `config` plugin's page.
  configuration: {
    component: PluginConfig
  },
  layoutCards: {
    LoginCard,
    UserList,
    UserStatusBlock,
    UserInstanceList,
    UserAccessSettings
  },
  globalComponents: [MyselfInfoDialog],
  setup(context: PanelFrontendPluginContext) {
    // Everything the panel core needs from the account API, resolved lazily so
    // unloading this plugin takes authentication with it. The Desktop plugin
    // picks up the three windows below through the same registry.
    context.registerService("user.api", userApi);
    context.registerService("user.desktopLoginWindow", DesktopLoginWindow);
    context.registerService("user.desktopUsers", DesktopUsers);
    context.registerService("user.desktopUserInfo", DesktopUserInfo);
    context.registerService("user.desktopStartMenuAvatar", UserOutlined);

    context.registerRoute({
      path: "/login",
      name: t("TXT_CODE_24873a8a"),
      component: LoginPage,
      meta: {
        permission: ROLE_GUEST,
        onlyDisplayEditMode: true,
        customClass: ["nav-button-warning"]
      }
    });

    context.registerRoute({
      path: "/install",
      name: t("TXT_CODE_82d650be"),
      component: InstallPage,
      meta: {
        permission: ROLE_GUEST,
        mainMenu: false
      }
    });

    context.registerRoute({
      path: "/sso/bind",
      name: t("TXT_CODE_SSO_BIND_TITLE"),
      component: SsoBindLogin,
      meta: {
        permission: ROLE_GUEST,
        mainMenu: false
      }
    });

    context.registerRoute({
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

    context.registerRoute({
      path: "/user",
      name: t("TXT_CODE_8c3164c9"),
      component: () => import("@/views/LayoutContainer.vue"),
      meta: {
        permission: ROLE_ADMIN,
        mainMenu: false
      }
    });
  }
};

export { ROLE_ADMIN, ROLE_GUEST, ROLE_USER };
