import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugin";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";
import { DesktopOutlined } from "@ant-design/icons-vue";
import DesktopPage from "./Desktop.vue";
import DesktopWindow from "./widgets/desktop/DesktopWindow.vue";
import { localeMessages } from "./i18n";
import themeCss from "./theme.scss?inline";

// Desktop mode. It owns the window shell and the application registry, so a
// plugin contributes a Desktop app through `ctx.desktop` and only while this
// plugin is installed.

const openDesktop = () => {
  window.location.hash = "#/desktop";
};

export const inject = ["console", "i18n", "routes", "menus", "desktop", "terminal", "instance"];

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
    icon: DesktopOutlined,
    click: openDesktop,
    conditions: () => {
      const { isLogged } = useAppStateStore();
      const { containerState } = useLayoutContainerStore();
      return !containerState.isDesignMode && isLogged.value;
    },
    onlyPC: true
  });

  ctx.menus.login({
    title: () => t("TXT_CODE_DESKTOP_MODE"),
    icon: DesktopOutlined,
    click: openDesktop
  });
}
