import { AppstoreAddOutlined } from "@ant-design/icons-vue";
import { t } from "@/lang/i18n";
import type { PanelFrontendPluginContext } from "@/plugins";
import { useAppStateStore } from "@/stores/useAppStateStore";
import ConfigPage from "./ConfigPage.vue";
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

export default {
  localeMessages,
  setup(context: PanelFrontendPluginContext) {
    context.registerRoute({
      path: "/plugins/config",
      name: t("TXT_CODE_PLUGIN_CONFIG"),
      component: ConfigPage,
      meta: {
        permission: 10,
        mainMenu: true,
        icon: AppstoreAddOutlined
      }
    });
  },
  desktopApps: [
    {
      id: "config",
      label: () => t("TXT_CODE_PLUGIN_CONFIG"),
      icon: AppstoreAddOutlined,
      color: "#1677ff",
      route: "/plugins/config",
      component: ConfigPage,
      condition: () => useAppStateStore().isAdmin.value
    }
  ]
};
