import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext, PanelFrontendPluginDefinition } from "@/plugins";
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
import PluginConfig from "./PluginConfig.vue";
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

export default {
  // Market source and install-permission settings are edited through the
  // `config` plugin's page rather than the panel Settings page.
  configuration: {
    component: PluginConfig
  },
  localeMessages,
  layoutCards: {
    Market,
    MarketEditor,
    McPreset
  },
  layoutCardPoolItems: marketCardPoolItems,
  terminalActions: [
    {
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
        isStopped &&
        !isGlobalTerminal &&
        (getAllowUsePreset() || useAppStateStore().isAdmin.value)
    }
  ],
  desktopApps: [
    {
      id: "market",
      label: () => t("TXT_CODE_27594db8"),
      icon: ShopOutlined,
      color: "#722ed1",
      route: "/market",
      component: DesktopMarket,
      condition: () => useAppStateStore().isAdmin.value,
      initialWidth: 1100,
      initialHeight: 680
    }
  ],
  setup(context: PanelFrontendPluginContext) {
    // Exposed so the core terminal bridge and other plugins can open the
    // package picker without importing this plugin's source.
    context.registerService("market.api", marketApi);
    context.registerService("market.openMarketDialog", openMarketDialog);
    context.registerService("market.useMarketPackages", useMarketPackages);

    context.registerRoute({
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
  },
  ready() {
    // The session exists by now, so the install permission can be resolved.
    void refreshMarketPermission();
  }
} satisfies PanelFrontendPluginDefinition;
