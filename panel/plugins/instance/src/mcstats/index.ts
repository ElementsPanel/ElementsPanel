import type { PanelFrontendPluginContext } from "@/plugin";
import {
  hasNodeFeature,
  isMinecraftInstance,
  isScopedInstance
} from "@/hooks/useInstanceActionAvailability";
import { t } from "@/lang/i18n";
import DesktopMcPing from "./desktop/DesktopMcPing.vue";
import McPingSettings from "./normal/McPingSettings.vue";

export function registerMinecraftStatus(ctx: PanelFrontendPluginContext) {
  ctx.actions.instance({
    id: "mcstats",
    title: () => t("TXT_CODE_40241d8e"),
    icon: "mdi-chart-line",
    mdiIcon: "mdi-chart-line",
    normalComponent: McPingSettings,
    desktopComponent: DesktopMcPing,
    condition: (context) =>
      isScopedInstance(context) &&
      hasNodeFeature(context, "mcstats") &&
      isMinecraftInstance(context),
    desktopInitialWidth: 500,
    desktopInitialHeight: 400
  });
}
