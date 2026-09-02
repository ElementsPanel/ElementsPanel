// global configuration initialization

import SystemConfig from "./entity/setting";
import StorageSystem from "./common/system_storage";
import { i18next } from "./i18n";
let systemConfig: SystemConfig | null = null;

const SUPPORTED_LANGUAGES = new Set([
  "en_us",
  "zh_cn",
  "zh_tw",
  "ja_jp",
  "es_es",
  "fr_fr",
  "ru_ru",
  "ko_kr",
  "de_de",
  "pt_br",
  "th_th",
  "tr_tr"
]);

function normalizeSystemLocale(locale: string): string | null {
  const normalized = locale.trim().split(/[.:@]/, 1)[0].replace(/-/g, "_").toLowerCase();
  if (!normalized) return null;
  if (SUPPORTED_LANGUAGES.has(normalized)) return normalized;

  const parts = normalized.split("_");
  const language = parts[0];
  if (language === "zh") {
    return parts.some((part) => ["tw", "hk", "mo", "hant"].includes(part))
      ? "zh_tw"
      : "zh_cn";
  }
  if (language === "pt") return "pt_br";

  const fallbackByLanguage: Record<string, string> = {
    en: "en_us",
    ja: "ja_jp",
    es: "es_es",
    fr: "fr_fr",
    ru: "ru_ru",
    ko: "ko_kr",
    de: "de_de",
    th: "th_th",
    tr: "tr_tr"
  };
  return fallbackByLanguage[language] ?? null;
}

function detectSystemLanguage(): string {
  const localeCandidates = [
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
    process.env.LANG,
    process.env.LANGUAGE
  ];

  try {
    localeCandidates.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // Keep the English fallback when the runtime cannot resolve a system locale.
  }

  for (const candidate of localeCandidates) {
    if (!candidate) continue;
    for (const locale of candidate.split(":")) {
      const language = normalizeSystemLocale(locale);
      if (language) return language;
    }
  }
  return "en_us";
}

// System persistence configuration table
export function initSystemConfig() {
  systemConfig = StorageSystem.load("SystemConfig", SystemConfig, "config");
  if (!systemConfig) {
    systemConfig = new SystemConfig();
    systemConfig.language = detectSystemLanguage();
    StorageSystem.store("SystemConfig", "config", systemConfig);
  }
  if (systemConfig.language) i18next.changeLanguage(systemConfig.language);
}

export function saveSystemConfig(_systemConfig: SystemConfig) {
  StorageSystem.store("SystemConfig", "config", _systemConfig);
}

export { systemConfig };
