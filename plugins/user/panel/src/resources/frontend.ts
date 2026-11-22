import type { PanelFrontendPluginContext } from "@elements-panel/sdk";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { useAppStateStore } from "@elementspanel/epanel-plugin-console/stores/useAppStateStore";
import CustomerPage from "../views/CustomerPage.vue";
import UserAccessSettings from "../widgets/AccessSettings.vue";
import { ROLE_ADMIN, ROLE_USER } from "../roles";

export function registerCustomerRoute(ctx: PanelFrontendPluginContext) {
  ctx.routes.add({
    path: "/customer",
    name: t("TXT_CODE_COMMON_MY_APPLICATION"),
    component: CustomerPage,
    meta: {
      permission: ROLE_USER,
      mainMenu: true,
      icon: "mdi-account-outline",
      // Admins work from `/instances`; this page is the ordinary user's home.
      condition: () => !useAppStateStore().isAdmin.value
    }
  });
}

export function registerUserResources(ctx: PanelFrontendPluginContext) {
  ctx.inject(["instance", "node"], (scope) =>
    scope.routes.add({
      path: "/users/resources",
      name: t("TXT_CODE_COMMON_CONFIGURATION"),
      component: UserAccessSettings,
      meta: {
        permission: ROLE_ADMIN,
        breadcrumbs: [
          {
            name: t("TXT_CODE_COMMON_USERS"),
            path: "/users",
            mainMenu: true,
            permission: ROLE_ADMIN
          }
        ]
      }
    })
  );
}
