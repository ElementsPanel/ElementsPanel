import type { PanelFrontendPluginContext } from "@elements-panel/sdk";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { useAppStateStore } from "@elementspanel/epanel-plugin-console/stores/useAppStateStore";
import { useAppToolsStore } from "@elementspanel/epanel-plugin-console/stores/useAppToolsStore";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { Modal } from "@elementspanel/epanel-plugin-console/tools/vuetifyModal";
import * as userApi from "../api";
import MyselfInfoDialog from "../components/MyselfInfoDialog.vue";
import UserList from "../widgets/UserList.vue";
import { ROLE_ADMIN } from "../roles";

export function registerAccountActions(ctx: PanelFrontendPluginContext) {
  ctx.slots.register("shell.overlay", MyselfInfoDialog, { id: "user-self-dialog" });

  const accountVisible = () => {
    const { authEnabled, isLogged } = useAppStateStore();
    return authEnabled.value && isLogged.value;
  };
  ctx.slots.register(
    "shell.header.actions",
    {
      title: () => t("TXT_CODE_COMMON_PROFILE"),
      mdiIcon: "mdi-account-outline",
      taskbar: false,
      click: () => {
        useAppToolsStore().state.showUserInfoDialog = true;
      }
    },
    { id: "user:profile-button", order: 40, condition: accountVisible }
  );
  ctx.slots.register(
    "shell.header.actions",
    {
      title: () => t("TXT_CODE_COMMON_LOGOUT"),
      mdiIcon: "mdi-logout",
      customClass: "nav-button-danger",
      taskbar: false,
      click: async () => {
        Modal.confirm({
          title: t("TXT_CODE_COMMON_LOGOUT"),
          content: t("TXT_CODE_COMMON_ARE_YOU_SURE_YOU_WANT_TO_LOG_OUT_THIS_USER"),
          async onOk() {
            await userApi.logoutUser().execute();
            message.success(t("TXT_CODE_COMMON_SUCCESSFULLY_LOGGED_OUT"));
            setTimeout(() => (window.location.href = "/"), 400);
          }
        });
      }
    },
    { id: "user:logout-button", order: 50, condition: accountVisible }
  );
}

export function registerUserAccounts(ctx: PanelFrontendPluginContext) {
  ctx.routes.add({
    path: "/users",
    name: t("TXT_CODE_COMMON_USERS"),
    component: UserList,
    meta: {
      mainMenu: true,
      permission: ROLE_ADMIN,
      icon: "mdi-account-group-outline"
    }
  });
}
