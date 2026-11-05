import { t } from "@/lang/i18n";
import type { PanelFrontendInstanceActionContext, PanelFrontendPluginContext } from "@/plugin";
import {
  hasNodeFeature,
  isMinecraftInstance,
  isScopedInstance
} from "@/hooks/useInstanceActionAvailability";
import { useAppStateStore } from "@/stores/useAppStateStore";
import DesktopModManager from "./desktop/DesktopModManager.vue";
import ModManager from "./normal/ModManager.vue";
import ModManagerAction from "./normal/ModManagerAction.vue";

const isModManagerAvailable = (context: PanelFrontendInstanceActionContext) => {
  if (!isScopedInstance(context) || !hasNodeFeature(context, "modManager")) return false;
  if (!isMinecraftInstance(context)) return false;
  const { state, isAdmin } = useAppStateStore();
  return state.settings.canFileManager || isAdmin.value;
};

export function registerModManager(ctx: PanelFrontendPluginContext) {
  ctx.inject(["file"], (scope) => registerViews(scope));
}

function registerViews(ctx: PanelFrontendPluginContext) {
  ctx.routes.add({
    path: "/instances/terminal/mods",
    name: t("TXT_CODE_MOD_MANAGER"),
    component: ModManager,
    meta: {
      permission: 1,
      breadcrumbs: [
        {
          name: t("TXT_CODE_e21473bc"),
          path: "/instances",
          mainMenu: true,
          permission: 10
        },
        {
          name: t("TXT_CODE_524e3036"),
          path: "/instances/terminal",
          permission: 1
        }
      ]
    }
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
