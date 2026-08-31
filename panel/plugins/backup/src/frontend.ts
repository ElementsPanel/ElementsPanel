import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugin";
import { CloudDownloadOutlined } from "@ant-design/icons-vue";
import DesktopInstanceBackup from "./desktop/DesktopInstanceBackup.vue";
import { localeMessages } from "./i18n";
import InstanceBackupModal from "./normal/InstanceBackupModal.vue";

export const inject = ["i18n", "actions"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);

  ctx.actions.schedule({
    type: "backup",
    title: () => t("TXT_CODE_INSTANCE_BACKUP")
  });

  ctx.actions.instance({
    id: "backup",
    title: () => t("TXT_CODE_INSTANCE_BACKUP"),
    icon: CloudDownloadOutlined,
    normalComponent: InstanceBackupModal,
    desktopComponent: DesktopInstanceBackup,
    // The node has to provide the feature, which means its backup plugin has to
    // be installed there too.
    condition: ({ daemon, isGlobalTerminal }) =>
      !isGlobalTerminal && Boolean((daemon as any)?.features?.instanceBackup),
    desktopInitialWidth: 700,
    desktopInitialHeight: 500
  });
}
