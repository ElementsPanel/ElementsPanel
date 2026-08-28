import { ClusterOutlined } from "@ant-design/icons-vue";
import type { PanelFrontendPluginContext, PanelFrontendPluginDefinition } from "@/plugins";
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
import deDE from "./i18n/de_DE.json";
import enUS from "./i18n/en_US.json";
import esES from "./i18n/es_ES.json";
import frFR from "./i18n/fr_FR.json";
import jaJP from "./i18n/ja_JP.json";
import koKR from "./i18n/ko_KR.json";
import ptBR from "./i18n/pt_BR.json";
import ruRU from "./i18n/ru_RU.json";
import thTH from "./i18n/th_TH.json";
import trTR from "./i18n/tr_TR.json";
import zhCN from "./i18n/zh_CN.json";
import zhTW from "./i18n/zh_TW.json";

const localeMessages = {
  de_de: deDE,
  en_us: enUS,
  es_es: esES,
  fr_fr: frFR,
  ja_jp: jaJP,
  ko_kr: koKR,
  pt_br: ptBR,
  ru_ru: ruRU,
  th_th: thTH,
  tr_tr: trTR,
  zh_cn: zhCN,
  zh_tw: zhTW
};

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

export default {
  localeMessages,
  setup(context: PanelFrontendPluginContext) {
    context.registerService("node.api", nodeApi);
    context.registerService("node.useRemoteNode", useRemoteNode);
    context.registerRoute({
      path: "/node",
      name: t("TXT_CODE_e076d90b"),
      component: LayoutContainer,
      meta: {
        permission: ADMIN_PERMISSION,
        mainMenu: true,
        icon: ClusterOutlined
      }
    });
    context.registerRoute({
      path: "/node/image",
      name: t("TXT_CODE_e6c30866"),
      component: LayoutContainer,
      meta: {
        permission: ADMIN_PERMISSION,
        mainMenu: false,
        breadcrumbs: [
          {
            name: t("TXT_CODE_e076d90b"),
            path: "/node",
            mainMenu: true,
            permission: ADMIN_PERMISSION
          }
        ]
      }
    });
    context.registerRoute({
      path: "/node/image/new",
      name: t("TXT_CODE_3d09f0ac"),
      component: LayoutContainer,
      meta: {
        permission: ADMIN_PERMISSION,
        mainMenu: false,
        breadcrumbs: [
          {
            name: t("TXT_CODE_e076d90b"),
            path: "/node",
            mainMenu: true,
            permission: ADMIN_PERMISSION
          },
          {
            name: t("TXT_CODE_e6c30866"),
            path: "/node/image",
            permission: ADMIN_PERMISSION
          }
        ]
      }
    });
  },
  layoutCards: {
    NodeList,
    NodeItem,
    NodeOverview,
    ImageManager,
    NewImage
  },
  layoutCardPoolItems: nodeCardPoolItems,
  desktopApps: [
    {
      id: "nodes",
      label: () => t("TXT_CODE_e076d90b"),
      icon: ClusterOutlined,
      color: "#fa8c16",
      route: "/node",
      component: DesktopNodeManager,
      condition: () => useAppStateStore().isAdmin.value,
      initialWidth: 980,
      initialHeight: 580
    }
  ]
} satisfies PanelFrontendPluginDefinition;
