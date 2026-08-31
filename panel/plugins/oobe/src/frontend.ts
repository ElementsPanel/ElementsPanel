import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugin";
import { localeMessages } from "./i18n";
import InstallPage from "./Install.vue";

// First-run setup. Its route is public because nobody is logged in yet, and the
// panel backend reports whether it is still needed.

const ROLE_GUEST = 0;

export const inject = ["i18n", "routes"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);

  ctx.routes.add({
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
