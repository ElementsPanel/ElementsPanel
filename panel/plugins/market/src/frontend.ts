import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugin";
import { useAppStateStore } from "@/stores/useAppStateStore";
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

export const inject = ["console", "i18n", "routes", "ui", "actions", "desktop", "instance"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);

  // Exposed so the core terminal bridge and other plugins can open the package
  // picker without importing this plugin's source.
  ctx.set("market", { api: marketApi, openMarketDialog, useMarketPackages });

  // The market's own settings are declared by its backend, so the plugin manager
  // renders them with the generic form and this half contributes no page for them.

  // The Minecraft preset owns the second quick-start step, so its route lives
  // here rather than in the instance plugin that owns the first step.
  ctx.routes.add({
    path: "/quickstart/minecraft",
    name: t("TXT_CODE_88249aee"),
    component: McPreset,
    meta: { permission: ROLE_ADMIN, mainMenu: false }
  });

  ctx.actions.terminal({
    id: "market-reinstall",
    title: () => t("TXT_CODE_b19ed1dd"),
    icon: "mdi-gesture-tap-button",
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
    component: Market,
    meta: {
      mainMenu: true,
      permission: ROLE_ADMIN,
      icon: "mdi-storefront-outline"
    }
  });

  ctx.routes.add({
    path: "/market/editor",
    name: t("TXT_CODE_54275b9c"),
    component: MarketEditor,
    meta: {
      permission: ROLE_ADMIN,
      mainMenu: false,
      breadcrumbs: [
        {
          name: t("TXT_CODE_27594db8"),
          path: "/market",
          mainMenu: true,
          permission: ROLE_ADMIN
        }
      ]
    }
  });

  ctx.desktop.app({
    id: "market",
    label: () => t("TXT_CODE_27594db8"),
    icon: "mdi-store-outline",
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
