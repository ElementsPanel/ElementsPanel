import type { I18n } from "vue-i18n";
import { ctx } from "@/plugin/context";
import type { FrontendI18nService, PanelLanguageOption } from "@/plugin";

export const LANGUAGE_KEY = "LANGUAGE";

export function toStandardLang(language?: string) {
  if (!language) return "en_us";
  return language.replace("-", "_").toLowerCase();
}

function service(): FrontendI18nService {
  const i18n = ctx.get("i18n");
  if (!i18n) throw new Error('Panel frontend plugin "i18n" is not loaded.');
  return i18n;
}

export function getI18nInstance(): I18n {
  return service().instance;
}

export function getSupportedLanguageOptions(): readonly PanelLanguageOption[] {
  return service().supportedLanguages;
}

export function getSupportLanguages(): string[] {
  return service().getSupportLanguages();
}

export function searchSupportLanguage(language: string): string {
  return service().searchSupportLanguage(language);
}

export function setLanguage(language: string, reload = true): void {
  service().setLanguage(language, reload);
}

export function getCurrentLang(): string {
  return service().getCurrentLang();
}

export function isCN(): boolean {
  return service().isCN();
}

export function isEN(): boolean {
  return service().isEN();
}

export function $t(...args: any[]): string {
  return service().translate(...args);
}

export const t = $t;
