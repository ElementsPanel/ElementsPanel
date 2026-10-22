import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugin";
import { useAppStateStore } from "@/stores/useAppStateStore";
import ConfigPage from "./ConfigPage.vue";
import { localeMessages } from "./i18n";

// The plugin manager page. It renders each plugin's configuration from the
// description that plugin's backend declared, so plugin-specific settings never
// touch the panel's own Settings page — and a daemon plugin, which has no browser
// half at all, gets a form here too.

const ROLE_ADMIN = 10;

export const inject = ["console", "i18n", "routes", "desktop"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);

  ctx.routes.add({
    path: "/plugins/config",
    name: t("TXT_CODE_PLUGIN_CONFIG"),
    component: ConfigPage,
    meta: {
      permission: ROLE_ADMIN,
      mainMenu: true,
      icon: "mdi-cog-outline"
    }
  });

  ctx.desktop.app({
    id: "config",
    label: () => t("TXT_CODE_PLUGIN_CONFIG"),
    icon: "mdi-cog-outline",
    color: "#1677ff",
    route: "/plugins/config",
    component: ConfigPage,
    condition: () => useAppStateStore().isAdmin.value
  });

  ctx.desktop.view({
    id: "node-plugin-config",
    title: () => t("TXT_CODE_PLUGIN_CONFIG"),
    icon: "mdi-cog-outline",
    component: ConfigPage,
    initialWidth: 980,
    initialHeight: 580,
    condition: () => useAppStateStore().isAdmin.value,
    accepts: (props) =>
      props.scope === "node" && typeof props.daemonId === "string" && !!props.daemonId
  });
}
