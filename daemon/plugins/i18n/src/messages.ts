import deDE from "./languages/de_DE.json";
import enUS from "./languages/en_US.json";
import esES from "./languages/es_ES.json";
import frFR from "./languages/fr_FR.json";
import jaJP from "./languages/ja_JP.json";
import koKR from "./languages/ko_KR.json";
import ptBR from "./languages/pt_BR.json";
import ruRU from "./languages/ru_RU.json";
import thTH from "./languages/th_TH.json";
import trTR from "./languages/tr_TR.json";
import zhCN from "./languages/zh_CN.json";
import zhTW from "./languages/zh_TW.json";

export const baseLocaleMessages: Record<string, Record<string, unknown>> = {
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
