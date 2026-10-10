import { prepareApplication } from "./bootstrap";
import "@/assets/base.scss";
import "@/assets/tools.scss";
import "@/assets/variables.scss";
import "@/assets/variables-dark.scss";
import "@/assets/global.scss";
import "@/assets/bg-extend-theme.scss";
import "@/initLib";

import { ROLE } from "@/config/router";
import { initAppearance } from "@/services/appearance";
import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugin";
import type { LoginUserInfo } from "@/types/user";
import AboutPage from "./views/AboutPage.vue";
import Page404 from "./widgets/Page404.vue";
import ConsoleApp from "./ConsoleApp.vue";
import { setLoadingTitle } from "@/tools/dom";
import { installVuetify } from "./vuetify";

/** `/` only ever redirects through its `meta.redirect`; it never renders. */
const RedirectShell = { render: () => null };

export const inject = ["i18n", "startup"];

export async function apply(parent: PanelFrontendPluginContext) {
  const { app, ctx } = await prepareApplication(parent);
  installVuetify(app);
  ctx.set("console", { root: ConsoleApp });

  ctx.routes.add({
    path: "/",
    name: "",
    component: RedirectShell,
    meta: {
      mainMenu: true,
      redirect: (user: LoginUserInfo | undefined) => {
        if (user?.permission === ROLE.ADMIN) return "/instances";
        if (user?.permission && user.permission >= ROLE.USER) return "/customer";
        return "/login";
      },
      permission: ROLE.USER
    }
  });

  ctx.routes.add({
    path: "/404",
    name: t("TXT_CODE_393c816c"),
    component: Page404,
    meta: { permission: ROLE.GUEST, mainMenu: false }
  });

  ctx.routes.add({
    path: "/about",
    name: t("TXT_CODE_3b4b656d"),
    component: AboutPage,
    meta: { permission: ROLE.GUEST, mainMenu: false }
  });

  // The page title belongs to the shell. A temporary backend failure should not
  // prevent the shell and its routes from loading.
  try {
    setLoadingTitle("Initializing Appearance...");
    await initAppearance();
  } catch (error) {
    console.error("Failed to initialize panel appearance:", error);
  }
}
