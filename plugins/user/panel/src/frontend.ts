import { restoreSession } from "./session";
import type { PanelFrontendPluginContext } from "@elements-panel/sdk";
import * as userApi from "./api";
import DesktopLoginWindow from "./desktop/DesktopLoginWindow.vue";
import DesktopUserInfo from "./desktop/DesktopUserInfo.vue";
import DesktopUsers from "./desktop/DesktopUsers.vue";
import { localeMessages } from "./i18n";
import { registerAccountActions, registerUserAccounts } from "./accounts/frontend";
import { registerLoginRoutes } from "./auth/frontend";
import { registerCustomerRoute, registerUserResources } from "./resources/frontend";

export { ROLE_ADMIN, ROLE_GUEST, ROLE_USER } from "./roles";

export const inject = ["console", "i18n", "routes", "slots"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);
  // Resolve account APIs and window providers at call time so unloading removes authentication.
  ctx.set("user", {
    api: userApi,
    restoreSession,
    desktopLoginWindow: DesktopLoginWindow,
    desktopUsers: DesktopUsers,
    desktopUserInfo: DesktopUserInfo,
    desktopStartMenuAvatar: "mdi-account-outline"
  });

  registerAccountActions(ctx);
  registerLoginRoutes(ctx);
  registerCustomerRoute(ctx);
  registerUserAccounts(ctx);
  registerUserResources(ctx);
}
