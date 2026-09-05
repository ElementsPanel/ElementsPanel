import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugin";
import type { LayoutCardPoolItemFactory } from "@/config";
import { LayoutCardHeight } from "@/config/originLayoutConfig";
import LayoutContainer from "@/views/LayoutContainer.vue";
import { getRandomId } from "@/tools/randId";
import { NEW_CARD_TYPE } from "@/types";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { AreaChartOutlined, DashboardOutlined, FileTextOutlined } from "@ant-design/icons-vue";
import DesktopOverview from "./desktop/DesktopOverview.vue";
import DesktopInstanceOperationLog from "./desktop/InstanceOperationLog.vue";
import InstanceLogHost from "./InstanceLogHost.vue";
import { closeInstanceLog } from "./instanceLog";
import { localeMessages } from "./i18n";
import InstanceChart from "./normal/InstanceChart.vue";
import InstanceOperationLogAction from "./normal/InstanceOperationLogAction.vue";
import OperationLogCard from "./normal/OperationLogCard.vue";
import DataOverview from "./normal/PanelOverview.vue";
import RequestChart from "./normal/RequestChart.vue";
import StatusBlock from "./normal/StatusBlock.vue";

const ROLE_ADMIN = 10;

/** One status tile. `meta.type` picks which figure the card reads. */
const statusBlock = (title: () => string, type: string): LayoutCardPoolItemFactory => {
  return () => ({
    id: getRandomId(),
    permission: ROLE_ADMIN,
    type: "StatusBlock",
    title: title(),
    meta: { type },
    width: 3,
    description: t("TXT_CODE_55ade942"),
    height: LayoutCardHeight.SMALL,
    category: NEW_CARD_TYPE.DATA
  });
};

const cardPoolItems: LayoutCardPoolItemFactory[] = [
  statusBlock(() => t("TXT_CODE_b4a9d04a"), "node"),
  statusBlock(() => t("TXT_CODE_88e9361a"), "instance"),
  statusBlock(() => t("TXT_CODE_db64faf6"), "users"),
  statusBlock(() => t("TXT_CODE_48382669"), "system"),
  () => ({
    id: getRandomId(),
    permission: ROLE_ADMIN,
    type: "RequestChart",
    title: t("TXT_CODE_a4037a98"),
    meta: {},
    width: 6,
    description: t("TXT_CODE_6f659da2"),
    height: LayoutCardHeight.MINI,
    category: NEW_CARD_TYPE.DATA
  }),
  () => ({
    id: getRandomId(),
    permission: ROLE_ADMIN,
    type: "InstanceChart",
    title: t("TXT_CODE_d6d9c42c"),
    meta: {},
    width: 6,
    description: t("TXT_CODE_6f659da2"),
    height: LayoutCardHeight.MINI,
    category: NEW_CARD_TYPE.DATA
  }),
  () => ({
    id: getRandomId(),
    permission: ROLE_ADMIN,
    type: "OperationLogCard",
    title: t("TXT_CODE_f6a33629"),
    meta: {},
    width: 3,
    description: t("TXT_CODE_9e8c176e"),
    height: LayoutCardHeight.MEDIUM,
    category: NEW_CARD_TYPE.DATA
  }),
  () => ({
    id: getRandomId(),
    permission: ROLE_ADMIN,
    type: "DataOverview",
    title: t("TXT_CODE_721157a3"),
    meta: {},
    width: 8,
    description: t("TXT_CODE_55ade942"),
    height: LayoutCardHeight.MEDIUM,
    category: NEW_CARD_TYPE.DATA
  })
];

export const inject = ["console", "i18n", "routes", "ui", "desktop", "actions"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);

  ctx.ui.layoutCard("DataOverview", DataOverview);
  ctx.ui.layoutCard("StatusBlock", StatusBlock);
  ctx.ui.layoutCard("RequestChart", RequestChart);
  ctx.ui.layoutCard("InstanceChart", InstanceChart);
  ctx.ui.layoutCard("OperationLogCard", OperationLogCard);
  cardPoolItems.forEach((createItem) => ctx.ui.layoutCardPoolItem(createItem));
  ctx.ui.globalComponent(InstanceLogHost);
  ctx.effect(() => () => closeInstanceLog());

  ctx.actions.instance({
    id: "operation-log",
    title: () => t("TXT_CODE_f6a33629"),
    icon: FileTextOutlined,
    normalComponent: InstanceOperationLogAction,
    desktopComponent: DesktopInstanceOperationLog,
    condition: ({ instanceId, daemonId }) => Boolean(instanceId && daemonId),
    desktopInitialWidth: 680,
    desktopInitialHeight: 500
  });

  ctx.routes.add({
    path: "/overview",
    name: t("TXT_CODE_84fbe277"),
    component: LayoutContainer,
    meta: {
      mainMenu: true,
      permission: ROLE_ADMIN,
      icon: AreaChartOutlined
    }
  });

  ctx.desktop.app({
    id: "overview",
    label: () => t("TXT_CODE_84fbe277"),
    icon: DashboardOutlined,
    color: "#52c41a",
    route: "/overview",
    component: DesktopOverview,
    condition: () => useAppStateStore().isAdmin.value,
    initialWidth: 1000,
    initialHeight: 640
  });
}
