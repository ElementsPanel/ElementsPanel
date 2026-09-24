import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugin";
import { useAppStateStore } from "@/stores/useAppStateStore";
import DesktopPage from "./Desktop.vue";
import DesktopWindow from "./widgets/desktop/DesktopWindow.vue";
import { localeMessages } from "./i18n";
import themeCss from "./theme.scss?inline";
import { h } from "vue";
import { VIcon } from "vuetify/components";


// Desktop mode owns the window shell. Console supplies the application/view
// registry, so feature plugins can contribute independently of this shell.

const openDesktop = () => {
  window.location.hash = "#/desktop";
};

export const inject = ["console", "i18n", "routes", "menus", "actions", "desktop"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);

  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.panelPlugin = "desktop";
    style.textContent = themeCss;
    document.head.appendChild(style);
    return () => style.remove();
  });

  ctx.desktop.provideWindow(DesktopWindow);

  ctx.routes.add({
    path: "/desktop",
    name: t("TXT_CODE_DESKTOP_MODE"),
    component: DesktopPage,
    meta: {
      permission: 0,
      mainMenu: false,
      public: true,
      immersive: true
    }
  });

  ctx.menus.app({
    title: () => t("TXT_CODE_DESKTOP_MODE"),
    mdiIcon: "mdi-monitor",
    click: openDesktop,
    conditions: () => {
      const { isLogged } = useAppStateStore();
      return isLogged.value;
    },
    onlyPC: true
  });

  ctx.menus.login({
    title: () => t("TXT_CODE_DESKTOP_MODE"),
    icon: () => h(VIcon, { icon: "mdi-monitor" }),
    click: openDesktop
  });
}
