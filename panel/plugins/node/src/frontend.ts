import type { PanelFrontendPluginContext } from "@/plugin";
import { t } from "@/lang/i18n";
import { useAppStateStore } from "@/stores/useAppStateStore";
import NodeList from "./normal/NodeList.vue";
import ImageManager from "./image/index.vue";
import NewImage from "./image/NewImage.vue";
import DesktopNodeManager from "./desktop/DesktopNodeManager.vue";
import * as nodeApi from "./api";
import { useRemoteNode } from "./hooks/useRemoteNode";
import { localeMessages } from "./i18n";

const ADMIN_PERMISSION = 10;

export const inject = ["console", "i18n", "routes", "ui", "desktop", "instance"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);

  // The node API and the remote-node hook. `services/apis/node.ts` and
  // `hooks/useRemoteNode.ts` resolve these at call time, so the panel degrades
  // instead of breaking when this plugin is not installed.
  ctx.set("node", { api: nodeApi, useRemoteNode });

  const nodeBreadcrumb = {
    name: t("TXT_CODE_e076d90b"),
    path: "/node",
    mainMenu: true,
    permission: ADMIN_PERMISSION
  };

  ctx.routes.add({
    path: "/node",
    name: t("TXT_CODE_e076d90b"),
    component: NodeList,
    meta: {
      permission: ADMIN_PERMISSION,
      mainMenu: true,
      icon: "mdi-server-network-outline"
    }
  });

  ctx.routes.add({
    path: "/node/image",
    name: t("TXT_CODE_e6c30866"),
    component: ImageManager,
    meta: {
      permission: ADMIN_PERMISSION,
      mainMenu: false,
      breadcrumbs: [nodeBreadcrumb]
    }
  });

  ctx.routes.add({
    path: "/node/image/new",
    name: t("TXT_CODE_3d09f0ac"),
    component: NewImage,
    meta: {
      permission: ADMIN_PERMISSION,
      mainMenu: false,
      breadcrumbs: [
        nodeBreadcrumb,
        {
          name: t("TXT_CODE_e6c30866"),
          path: "/node/image",
          permission: ADMIN_PERMISSION
        }
      ]
    }
  });

  ctx.desktop.app({
    id: "nodes",
    label: () => t("TXT_CODE_e076d90b"),
    icon: "mdi-vector-link",
    color: "#fa8c16",
    route: "/node",
    component: DesktopNodeManager,
    condition: () => useAppStateStore().isAdmin.value,
    initialWidth: 980,
    initialHeight: 580
  });
}
