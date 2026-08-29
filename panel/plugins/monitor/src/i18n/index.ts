import deDE from "./de_DE.json";
import enUS from "./en_US.json";
import esES from "./es_ES.json";
import frFR from "./fr_FR.json";
import jaJP from "./ja_JP.json";
import koKR from "./ko_KR.json";
import ptBR from "./pt_BR.json";
import ruRU from "./ru_RU.json";
import thTH from "./th_TH.json";
import trTR from "./tr_TR.json";
import zhCN from "./zh_CN.json";
import zhTW from "./zh_TW.json";

// Labels for the monitoring page: the status tiles, the panel/host figures and
// the chart titles. The backend registers the same catalogue so the plugin's own
// strings resolve there too.
export const localeMessages = {
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
