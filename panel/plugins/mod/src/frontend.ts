import { t } from "@/lang/i18n";
import type { PanelFrontendInstanceActionContext, PanelFrontendPluginContext } from "@/plugin";
import { useAppStateStore } from "@/stores/useAppStateStore";
import * as api from "./api";
import DesktopModManager from "./desktop/DesktopModManager.vue";
import { localeMessages } from "./i18n";
import ModManager from "./normal/ModManager.vue";
import ModManagerAction from "./normal/ModManagerAction.vue";
import ModManagerPage from "./normal/ModManagerPage.vue";

const isModManagerAvailable = ({
  daemon,
  instanceInfo,
  isGlobalTerminal
}: PanelFrontendInstanceActionContext) => {
  if (isGlobalTerminal || !(daemon as any)?.features?.modManager) return false;
  const type = String((instanceInfo as any)?.config?.type || "");
  if (!type.startsWith("minecraft/java") && !type.startsWith("minecraft/bedrock")) return false;
  const { state, isAdmin } = useAppStateStore();
  return state.settings.canFileManager || isAdmin.value;
};

export const inject = ["console", "i18n", "ui", "routes", "actions", "desktop", "instance", "file"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);
  ctx.set("mod", { api });
  ctx.ui.layoutCard("InstanceModManager", ModManager);
  ctx.routes.add({
    path: "/instances/terminal/mods",
    name: t("TXT_CODE_MOD_MANAGER"),
    component: ModManagerPage,
    meta: { permission: 1 }
  });
  ctx.actions.instance({
    id: "mod-manager",
    title: () => t("TXT_CODE_MOD_MANAGER"),
    icon: "mdi-package-variant-closed",
    mdiIcon: "mdi-package-variant-closed",
    normalComponent: ModManagerAction,
    desktopComponent: DesktopModManager,
    condition: isModManagerAvailable,
    desktopInitialWidth: 900,
    desktopInitialHeight: 600
  });
}
