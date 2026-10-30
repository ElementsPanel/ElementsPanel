import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugin";
import { useAppStateStore } from "@/stores/useAppStateStore";
import DesktopPluginMarket from "./desktop/DesktopPluginMarket.vue";
import PluginMarket from "./normal/PluginMarket.vue";
import PluginMarketDetail from "./normal/PluginMarketDetail.vue";
import { localeMessages } from "./i18n";

const ROLE_ADMIN = 10;
export const inject = ["console", "i18n", "routes", "desktop"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);
  ctx.routes.add({
    path: "/market/plugins",
    name: t("TXT_CODE_PLUGIN_MARKET"),
    component: PluginMarket,
    meta: {
      mainMenu: true,
      permission: ROLE_ADMIN,
      icon: "mdi-puzzle-outline"
      // No `breadcrumbs`: this is a market of its own, not a page of the
      // application market, so the trail reads 管理面板 > 插件市场.
    }
  });

  ctx.routes.add({
    path: "/market/plugins/:pluginId",
    name: t("TXT_CODE_PLUGIN_MARKET_DETAIL"),
    component: PluginMarketDetail,
    meta: {
      mainMenu: false,
      permission: ROLE_ADMIN,
      breadcrumbs: [
        {
          name: t("TXT_CODE_PLUGIN_MARKET"),
          path: "/market/plugins",
          mainMenu: true,
          permission: ROLE_ADMIN
        }
      ]
    }
  });

  ctx.desktop.app({
    id: "plugin-market",
    label: () => t("TXT_CODE_PLUGIN_MARKET"),
    icon: "mdi-puzzle-outline",
    color: "#5c6bc0",
    route: "/market/plugins",
    component: DesktopPluginMarket,
    condition: () => useAppStateStore().isAdmin.value,
    initialWidth: 1100,
    initialHeight: 720
  });

}
