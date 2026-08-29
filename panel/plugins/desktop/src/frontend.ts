import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugins";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";
import { DesktopOutlined } from "@ant-design/icons-vue";
import DesktopPage from "./Desktop.vue";
import DesktopWindow from "./widgets/desktop/DesktopWindow.vue";
import deDE from "./i18n/de_DE.json";
import enUS from "./i18n/en_US.json";
import esES from "./i18n/es_ES.json";
import frFR from "./i18n/fr_FR.json";
import jaJP from "./i18n/ja_JP.json";
import koKR from "./i18n/ko_KR.json";
import ptBR from "./i18n/pt_BR.json";
import ruRU from "./i18n/ru_RU.json";
import thTH from "./i18n/th_TH.json";
import trTR from "./i18n/tr_TR.json";
import zhCN from "./i18n/zh_CN.json";
import zhTW from "./i18n/zh_TW.json";
import themeCss from "./theme.scss?inline";

const localeMessages = {
  de_de: deDE,
  en_us: enUS,
  es_es: esES,
  fr_fr: frFR,
  ja_jp: jaJP,
  ko_kr: koKR,
  pt_br: ptBR,
  ru_ru: ruRU,
  th_th: thTH,
  tr_tr: trTR,
  zh_cn: zhCN,
  zh_tw: zhTW
};

const openDesktop = () => {
  window.location.hash = "#/desktop";
};

export default {
  localeMessages,
  setup(context: PanelFrontendPluginContext) {
    const style = document.createElement("style");
    style.dataset.panelPlugin = "desktop";
    style.textContent = themeCss;
    document.head.appendChild(style);

    context.registerRoute({
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

    context.registerService("desktop.window", DesktopWindow);

    return () => style.remove();
  },
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
