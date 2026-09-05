import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugin";
import type { LayoutCardPoolItemFactory } from "@/config";
import { LayoutCardHeight } from "@/config/originLayoutConfig";
import LayoutContainer from "@/views/LayoutContainer.vue";
import { getRandomId } from "@/tools/randId";
import { NEW_CARD_TYPE } from "@/types";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { InteractionOutlined, ShopOutlined } from "@ant-design/icons-vue";
import * as marketApi from "./api";
import DesktopMarket from "./desktop/DesktopMarket.vue";
import { useMarketPackages } from "./hooks/useMarketPackages";
import { localeMessages } from "./i18n";
import { openMarketDialog } from "./market-dialog";
import Market from "./normal/Market.vue";
import MarketEditor from "./normal/MarketEditor.vue";
import McPreset from "./normal/McPreset.vue";
import { getAllowUsePreset, refreshMarketPermission } from "./runtime";

const ROLE_ADMIN = 10;

const marketCardPoolItems: LayoutCardPoolItemFactory[] = [
  () => ({
    id: getRandomId(),
    permission: ROLE_ADMIN,
    meta: {},
    type: "Market",
    title: t("TXT_CODE_27594db8"),
    width: 12,
    description: t("TXT_CODE_9b45858c"),
    height: LayoutCardHeight.BIG,
    category: NEW_CARD_TYPE.OTHER
  }),
  () => ({
    id: getRandomId(),
    permission: ROLE_ADMIN,
    meta: {},
    type: "MarketEditor",
    title: t("TXT_CODE_54275b9c"),
    width: 12,
    description: t("TXT_CODE_94f55150"),
    height: LayoutCardHeight.BIG,
    category: NEW_CARD_TYPE.OTHER
  })
];

export const inject = ["console", "i18n", "routes", "ui", "actions", "desktop", "instance"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);

  // Exposed so the core terminal bridge and other plugins can open the package
  // picker without importing this plugin's source.
  ctx.set("market", { api: marketApi, openMarketDialog, useMarketPackages });

  // The market's own settings are declared by its backend, so the plugin manager
  // renders them with the generic form and this half contributes no page for them.

  ctx.ui.layoutCard("Market", Market);
  ctx.ui.layoutCard("MarketEditor", MarketEditor);
  ctx.ui.layoutCard("McPreset", McPreset);
  marketCardPoolItems.forEach((createItem) => ctx.ui.layoutCardPoolItem(createItem));

  ctx.actions.terminal({
    id: "market-reinstall",
    title: () => t("TXT_CODE_b19ed1dd"),
    icon: InteractionOutlined,
    click: async ({ daemonId, instanceId, isDockerMode, clearTerminal }) => {
      try {
        clearTerminal();
        await openMarketDialog(daemonId, instanceId, {
          autoInstall: true,
          onlyDockerTemplate: isDockerMode
        });
      } catch (error: any) {
        // Closing the picker is not an error.
      }
    },
    condition: ({ isStopped, isGlobalTerminal }) =>
      isStopped && !isGlobalTerminal && (getAllowUsePreset() || useAppStateStore().isAdmin.value)
  });

  ctx.routes.add({
    path: "/market",
    name: t("TXT_CODE_27594db8"),
    component: LayoutContainer,
    meta: {
      mainMenu: true,
      permission: ROLE_ADMIN,
      icon: ShopOutlined
    },
    children: [
      {
        path: "editor",
        name: t("TXT_CODE_54275b9c"),
        component: LayoutContainer,
        meta: {
          permission: ROLE_ADMIN
        }
      }
    ]
  });

  ctx.desktop.app({
    id: "market",
    label: () => t("TXT_CODE_27594db8"),
    icon: ShopOutlined,
    color: "#722ed1",
    route: "/market",
    component: DesktopMarket,
    condition: () => useAppStateStore().isAdmin.value,
    initialWidth: 1100,
    initialHeight: 680
  });

  // The session exists once the app has started, so the install permission can
  // be resolved then and not before.
  ctx.on("ready", () => void refreshMarketPermission());
}
