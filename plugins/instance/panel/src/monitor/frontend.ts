import { hasInstanceContext } from "@elementspanel/epanel-plugin-console/hooks/useInstanceActionAvailability";
import { t } from "@elementspanel/epanel-plugin-i18n";
import type { PanelFrontendPluginContext } from "@elements-panel/sdk";
import { useAppStateStore } from "@elementspanel/epanel-plugin-console/stores/useAppStateStore";
import DesktopOverview from "./desktop/DesktopOverview.vue";
import DesktopInstanceOperationLog from "./desktop/InstanceOperationLog.vue";
import InstanceLogHost from "./InstanceLogHost.vue";
import { closeInstanceLog } from "./instanceLog";
import InstanceOperationLogAction from "./normal/InstanceOperationLogAction.vue";
import OverviewPage from "./normal/OverviewPage.vue";

const ROLE_ADMIN = 10;

export function apply(ctx: PanelFrontendPluginContext) {
  const { isAdmin } = useAppStateStore();

  ctx.slots.register("shell.overlay", InstanceLogHost, { id: "monitor-instance-log" });
  ctx.effect(() => () => closeInstanceLog());

  ctx.actions.instance({
    id: "operation-log",
    title: () => t("TXT_CODE_COMMON_OPERATION_LOG"),
    icon: "mdi-file-document-outline",
    mdiIcon: "mdi-file-document-outline",
    normalComponent: InstanceOperationLogAction,
    desktopComponent: DesktopInstanceOperationLog,
    condition: (context) => hasInstanceContext(context) && isAdmin.value,
    desktopInitialWidth: 680,
    desktopInitialHeight: 500
  });

  ctx.routes.add({
    path: "/overview",
    name: t("TXT_CODE_COMMON_OVERVIEW"),
    component: OverviewPage,
    meta: {
      mainMenu: true,
      permission: ROLE_ADMIN,
      icon: "mdi-chart-areaspline",
    }
  });

  ctx.desktop.app({
    id: "overview",
    label: () => t("TXT_CODE_COMMON_OVERVIEW"),
    icon: "mdi-view-dashboard-outline",
    color: "#52c41a",
    route: "/overview",
    component: DesktopOverview,
    condition: () => useAppStateStore().isAdmin.value,
    initialWidth: 1000,
    initialHeight: 640
  });
}
