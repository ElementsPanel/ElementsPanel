import { AppstoreAddOutlined } from "@ant-design/icons-vue";
import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugin";
import { useAppStateStore } from "@/stores/useAppStateStore";
import ConfigPage from "./ConfigPage.vue";
import { localeMessages } from "./i18n";

// The plugin settings page. It renders the forms other plugins contribute
// through `ctx.settings.page()`, so plugin-specific settings never touch the
// panel's own Settings page.

const ROLE_ADMIN = 10;

export const inject = ["i18n", "routes", "desktop", "settings"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);

  ctx.routes.add({
    path: "/plugins/config",
    name: t("TXT_CODE_PLUGIN_CONFIG"),
    component: ConfigPage,
    meta: {
      permission: ROLE_ADMIN,
      mainMenu: true,
      icon: AppstoreAddOutlined
    }
  });

  ctx.desktop.app({
    id: "config",
    label: () => t("TXT_CODE_PLUGIN_CONFIG"),
    icon: AppstoreAddOutlined,
    color: "#1677ff",
    route: "/plugins/config",
    component: ConfigPage,
    condition: () => useAppStateStore().isAdmin.value
  });
}
