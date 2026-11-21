import type { PanelFrontendPluginContext } from "@elements-panel/sdk";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { useAppStateStore } from "@elementspanel/epanel-plugin-console/stores/useAppStateStore";
import NodeList from "./normal/NodeList.vue";
import ImageManager from "./image/index.vue";
import NewImage from "./image/NewImage.vue";
import DesktopNodeManager from "./desktop/DesktopNodeManager.vue";
import * as nodeApi from "./api";
import { useRemoteNode } from "./hooks/useRemoteNode";

const ADMIN_PERMISSION = 10;

export function apply(ctx: PanelFrontendPluginContext) {

  ctx.set("node", { api: nodeApi, useRemoteNode });

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

  ctx.routes.add({
    path: "/node/image",
    name: t("TXT_CODE_COMMON_MANAGE_IMAGES"),
    component: ImageManager,
    meta: {
      permission: ADMIN_PERMISSION,
      mainMenu: false,
      breadcrumbs: [nodeBreadcrumb]
    }
  });

  ctx.routes.add({
    path: "/node/image/new",
    name: t("TXT_CODE_COMMON_CREATE_IMAGE"),
    component: NewImage,
    meta: {
      permission: ADMIN_PERMISSION,
      mainMenu: false,
      breadcrumbs: [
        nodeBreadcrumb,
        {
          name: t("TXT_CODE_COMMON_MANAGE_IMAGES"),
          path: "/node/image",
          permission: ADMIN_PERMISSION
        }
      ]
    }
  });

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
