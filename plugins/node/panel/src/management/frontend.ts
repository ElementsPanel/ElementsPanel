import type { PanelFrontendPluginContext } from "@elements-panel/sdk";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { useAppStateStore } from "@elementspanel/epanel-plugin-console/stores/useAppStateStore";
import NodeList from "../normal/NodeList.vue";
import DesktopNodeManager from "../desktop/DesktopNodeManager.vue";

const ADMIN_PERMISSION = 10;

export function registerNodeManagement(ctx: PanelFrontendPluginContext) {
  const nodeBreadcrumb = {
    name: t("TXT_CODE_COMMON_DAEMONS"),
    path: "/node",
    mainMenu: true,
    permission: ADMIN_PERMISSION
  };

  ctx.routes.add({
    path: "/node",
    name: t("TXT_CODE_COMMON_DAEMONS"),
    component: NodeList,
    meta: {
      permission: ADMIN_PERMISSION,
      mainMenu: true,
      icon: "mdi-sitemap-outline"
    }
  });

  return nodeBreadcrumb;
}

export function registerNodeDesktop(ctx: PanelFrontendPluginContext) {
  ctx.desktop.app({
    id: "nodes",
    label: () => t("TXT_CODE_COMMON_DAEMONS"),
    icon: "mdi-sitemap-outline",
    color: "#fa8c16",
    route: "/node",
    component: DesktopNodeManager,
    condition: () => useAppStateStore().isAdmin.value,
    initialWidth: 980,
    initialHeight: 580
  });
}
