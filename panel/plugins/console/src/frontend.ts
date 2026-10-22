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
import Page404 from "./widgets/Page404.vue";
import ConsoleApp from "./ConsoleApp.vue";
import { setLoadingTitle } from "@/tools/dom";
import { installVuetify } from "./vuetify";
import BackgroundTasksSidebar from "./components/BackgroundTasksSidebar.vue";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { useBackgroundTasks } from "@/stores/useBackgroundTasks";
import { useThemeSwitch } from "@/hooks/useThemeSwitch";

/** `/` only ever redirects through its `meta.redirect`; it never renders. */
const RedirectShell = { render: () => null };

export const inject = ["i18n", "startup"];

export async function apply(parent: PanelFrontendPluginContext) {
  const { app, ctx } = await prepareApplication(parent);
  installVuetify(app);
  ctx.set("console", { root: ConsoleApp });
  // The header renders the button from this descriptor; only the sidebar is a
  // component overlay.
  ctx.slots.register(
    "shell.header.actions",
    {
      title: () => t("TXT_CODE_TASKS_TITLE"),
      mdiIcon: "mdi-progress-clock",
      badge: () => useBackgroundTasks().activeCount.value || undefined,
      click: () => {
        const { open, refresh } = useBackgroundTasks();
        open.value = !open.value;
        if (open.value) void refresh({ silent: true });
      }
    },
    {
      id: "console:background-tasks-button",
      order: 10,
      condition: () => useAppStateStore().isLogged.value
    }
  );
  ctx.slots.register("shell.overlay", BackgroundTasksSidebar, {
    id: "console:background-tasks-sidebar"
  });

  // The theme switcher is shell UI, described like any other header action.
  ctx.slots.register(
    "shell.header.actions",
    {
      title: () => useThemeSwitch().themeTitle.value,
      mdiIcon: () => useThemeSwitch().themeIcon.value,
      taskbar: false,
      click: () => useThemeSwitch().cycleTheme()
    },
    { id: "console:theme-button", order: 60 }
  );

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

  // The page title belongs to the shell. A temporary backend failure should not
  // prevent the shell and its routes from loading.
  try {
    setLoadingTitle("Initializing Appearance...");
    await initAppearance();
  } catch (error) {
    console.error("Failed to initialize panel appearance:", error);
  }
}
