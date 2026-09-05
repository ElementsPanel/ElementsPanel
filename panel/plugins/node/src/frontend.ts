import { ClusterOutlined } from "@ant-design/icons-vue";
import type { PanelFrontendPluginContext } from "@/plugin";
import type { LayoutCardPoolItemFactory } from "@/config";
import LayoutContainer from "@/views/LayoutContainer.vue";
import { t } from "@/lang/i18n";
import { NEW_CARD_TYPE } from "@/types";
import { LayoutCardHeight } from "@/config/originLayoutConfig";
import { getRandomId } from "@/tools/randId";
import { useAppStateStore } from "@/stores/useAppStateStore";
import NodeList from "./normal/NodeList.vue";
import NodeItem from "./normal/node/NodeItem.vue";
import NodeOverview from "./normal/NodeOverview.vue";
import ImageManager from "./image/index.vue";
import NewImage from "./image/NewImage.vue";
import DesktopNodeManager from "./desktop/DesktopNodeManager.vue";
import * as nodeApi from "./api";
import { useRemoteNode } from "./hooks/useRemoteNode";
import { localeMessages } from "./i18n";

const ADMIN_PERMISSION = 10;

const nodeCardPoolItems: LayoutCardPoolItemFactory[] = [
  () => ({
    id: getRandomId(),
    permission: ADMIN_PERMISSION,
    type: "NodeOverview",
    title: t("TXT_CODE_4bedec2a"),
    meta: {},
    width: 12,
    description: t("TXT_CODE_2a8dc13f"),
    height: LayoutCardHeight.BIG,
    category: NEW_CARD_TYPE.DATA
  }),
  () => ({
    id: getRandomId(),
    permission: ADMIN_PERMISSION,
    meta: {},
    type: "NodeItem",
    title: t("TXT_CODE_def287e0"),
    width: 6,
    description: t("TXT_CODE_abe0862e"),
    height: LayoutCardHeight.MEDIUM,
    category: NEW_CARD_TYPE.INSTANCE,
    params: [
      {
        field: "daemonId",
        label: t("TXT_CODE_72cfab69"),
        type: "string"
      },
      {
        field: "instance",
        label: t("TXT_CODE_e7cad65f"),
        type: "instance"
      }
    ]
  })
];

export const inject = ["console", "i18n", "routes", "ui", "desktop", "instance"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);

  // The node API and the remote-node hook. `services/apis/node.ts` and
  // `hooks/useRemoteNode.ts` resolve these at call time, so the panel degrades
  // instead of breaking when this plugin is not installed.
  ctx.set("node", { api: nodeApi, useRemoteNode });

  ctx.ui.layoutCard("NodeList", NodeList);
  ctx.ui.layoutCard("NodeItem", NodeItem);
  ctx.ui.layoutCard("NodeOverview", NodeOverview);
  ctx.ui.layoutCard("ImageManager", ImageManager);
  ctx.ui.layoutCard("NewImage", NewImage);
  nodeCardPoolItems.forEach((createItem) => ctx.ui.layoutCardPoolItem(createItem));

  const nodeBreadcrumb = {
    name: t("TXT_CODE_e076d90b"),
    path: "/node",
    mainMenu: true,
    permission: ADMIN_PERMISSION
  };

  ctx.routes.add({
    path: "/node",
    name: t("TXT_CODE_e076d90b"),
    component: LayoutContainer,
    meta: {
      permission: ADMIN_PERMISSION,
      mainMenu: true,
      icon: ClusterOutlined
    }
  });

  ctx.routes.add({
    path: "/node/image",
    name: t("TXT_CODE_e6c30866"),
    component: LayoutContainer,
    meta: {
      permission: ADMIN_PERMISSION,
      mainMenu: false,
      breadcrumbs: [nodeBreadcrumb]
    }
  });

  ctx.routes.add({
    path: "/node/image/new",
    name: t("TXT_CODE_3d09f0ac"),
    component: LayoutContainer,
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
    icon: ClusterOutlined,
    color: "#fa8c16",
    route: "/node",
    component: DesktopNodeManager,
    condition: () => useAppStateStore().isAdmin.value,
    initialWidth: 980,
    initialHeight: 580
  });
}
