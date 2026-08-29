import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugins";
import { localeMessages } from "./i18n";
import InstallPage from "./Install.vue";

const ROLE_GUEST = 0;

export default {
  localeMessages,
  setup(context: PanelFrontendPluginContext) {
    context.registerRoute({
      path: "/install",
      name: t("TXT_CODE_82d650be"),
      component: InstallPage,
      meta: {
        permission: ROLE_GUEST,
        mainMenu: false,
        public: true
      }
    });
  }
};
