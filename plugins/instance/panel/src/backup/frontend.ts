import {
  hasNodeFeature,
  isScopedInstance
} from "@elementspanel/epanel-plugin-console/hooks/useInstanceActionAvailability";
import { t } from "@elementspanel/epanel-plugin-i18n";
import type { PanelFrontendPluginContext } from "@elements-panel/sdk";
import DesktopInstanceBackup from "./desktop/DesktopInstanceBackup.vue";
import InstanceBackupModal from "./normal/InstanceBackupModal.vue";

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.actions.schedule({
    type: "backup",
    title: () => t("TXT_CODE_INSTANCE_BACKUP")
  });

  ctx.actions.instance({
    id: "backup",
    title: () => t("TXT_CODE_INSTANCE_BACKUP"),
    icon: "mdi-cloud-outline",
    mdiIcon: "mdi-cloud-outline",
    normalComponent: InstanceBackupModal,
    desktopComponent: DesktopInstanceBackup,
    condition: (context) => isScopedInstance(context) && hasNodeFeature(context, "instanceBackup"),
    desktopInitialWidth: 700,
    desktopInitialHeight: 500
  });
}
