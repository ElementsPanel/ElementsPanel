import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugins";
import { CloudDownloadOutlined } from "@ant-design/icons-vue";
import DesktopInstanceBackup from "./desktop/DesktopInstanceBackup.vue";
import { localeMessages } from "./i18n";
import InstanceBackupModal from "./normal/InstanceBackupModal.vue";

export default {
  localeMessages,
  setup(context: PanelFrontendPluginContext) {
    context.registerScheduleAction({
      type: "backup",
      title: () => t("TXT_CODE_INSTANCE_BACKUP")
    });
    context.registerInstanceAction({
      id: "backup",
      title: () => t("TXT_CODE_INSTANCE_BACKUP"),
      icon: CloudDownloadOutlined,
      normalComponent: InstanceBackupModal,
      desktopComponent: DesktopInstanceBackup,
      condition: ({ daemon, isGlobalTerminal }) =>
        !isGlobalTerminal && Boolean((daemon as any)?.features?.instanceBackup),
      desktopInitialWidth: 700,
      desktopInitialHeight: 500
    });
  }
};
