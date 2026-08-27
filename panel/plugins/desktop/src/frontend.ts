import { t } from "@/lang/i18n";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";
import { DesktopOutlined } from "@ant-design/icons-vue";
import DesktopPage from "./Desktop.vue";
import "./theme.scss";

const openDesktop = () => {
  window.location.hash = "#/desktop";
};

export default {
  routes: [
    {
      path: "/desktop",
      name: t("TXT_CODE_DESKTOP_MODE"),
      component: DesktopPage,
      meta: {
        permission: 0,
        mainMenu: false,
        public: true,
        immersive: true
      }
    }
  ],
  appMenus: [
    {
      title: () => t("TXT_CODE_DESKTOP_MODE"),
      icon: DesktopOutlined,
      click: openDesktop,
      conditions: () => {
        const { isLogged } = useAppStateStore();
        const { containerState } = useLayoutContainerStore();
        return !containerState.isDesignMode && isLogged.value;
      },
      onlyPC: true
    }
  ],
  loginActions: [
    {
      title: () => t("TXT_CODE_DESKTOP_MODE"),
      icon: DesktopOutlined,
      click: openDesktop
    }
  ]
};
