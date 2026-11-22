import type { PanelFrontendPluginContext } from "@elements-panel/sdk";
import { t } from "@elementspanel/epanel-plugin-i18n";
import LoginPage from "../views/Login.vue";
import SsoBindLogin from "../views/SsoBindLogin.vue";
import { ROLE_GUEST } from "../roles";

export function registerLoginRoutes(ctx: PanelFrontendPluginContext) {
  ctx.routes.add({
    path: "/login",
    name: t("TXT_CODE_COMMON_LOGIN_PAGE"),
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
}
