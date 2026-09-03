import type {
  FrontendI18nService,
  PanelFrontendPluginContext,
  PanelLanguageOption
} from "@/plugin";
import { LANGUAGE_KEY, toStandardLang } from "@/lang/i18n";
import { remove } from "cosmokit";
import { Service, type Context } from "cordis";
import { markRaw } from "vue";
import { createI18n, type I18n } from "vue-i18n";
import { baseLocaleMessages } from "./messages";

const SUPPORTED_LANGUAGES: PanelLanguageOption[] = [
  { label: "English", value: "en_us" },
  { label: "简体中文", value: "zh_cn" },
  { label: "繁體中文", value: "zh_tw" },
  { label: "日本語", value: "ja_jp" },
  { label: "Русский", value: "ru_ru" },
  { label: "Deutsch", value: "de_de" },
  { label: "Français", value: "fr_fr" },
  { label: "Português Brasileiro", value: "pt_br" },
  { label: "Thai", value: "th_th" },
  { label: "Español", value: "es_es" },
  { label: "한국어", value: "ko_kr" },
  { label: "Türkçe", value: "tr_tr" }
];

interface LocaleRegistration {
  locale: string;
  messages: Record<string, unknown>;
}

interface I18nServiceConfig {
  instance: I18n;
}

function cloneMessages<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

class I18nService extends Service implements FrontendI18nService {
  readonly instance: I18n;
  readonly supportedLanguages = SUPPORTED_LANGUAGES;

  private readonly base = new Map<string, Record<string, unknown>>();
  private readonly registrations: LocaleRegistration[] = [];

  constructor(ctx: Context, config: I18nServiceConfig) {
    super(ctx, "i18n", true);
    this.instance = markRaw(config.instance);
  }

  getSupportLanguages() {
    return this.supportedLanguages.map((item) => item.value);
  }

  searchSupportLanguage(language: string) {
    const normalized = toStandardLang(language);
    return this.getSupportLanguages().find((item) => item.includes(normalized)) ?? "en_us";
  }

  getCurrentLang() {
    return this.searchSupportLanguage(String((this.instance.global as any).locale).toLowerCase());
  }

  setLanguage(language: string, reload = true) {
    const normalized = toStandardLang(language);
    localStorage.setItem(LANGUAGE_KEY, normalized);
    (this.instance.global as any).locale = normalized;
    if (reload) window.location.reload();
  }

  isCN() {
    return (
      this.getCurrentLang() === "zh_cn" ||
      this.getCurrentLang() === "zh_tw" ||
      window.navigator.language.includes("zh")
    );
  }

  isEN() {
    return this.getCurrentLang() === "en_us";
  }

  translate(...args: any[]): string {
    return ((this.instance.global as any).t as Function)(...args);
  }

  define(messages: Record<string, Record<string, unknown>>) {
    const added = Object.entries(messages ?? {}).map(([locale, resources]) => ({
      locale,
      messages: cloneMessages(resources)
    }));
    return this.ctx.effect(() => {
      for (const registration of added) {
        if (!this.base.has(registration.locale)) {
          this.base.set(
            registration.locale,
            cloneMessages(
              (this.instance.global as any).getLocaleMessage(registration.locale) || {}
            )
          );
        }
        this.registrations.push(registration);
        this.reapply(registration.locale);
      }
      return () => {
        for (const registration of added) {
          remove(this.registrations, registration);
          this.reapply(registration.locale);
        }
      };
    });
  }

  private reapply(locale: string) {
    const global = this.instance.global as any;
    global.setLocaleMessage(locale, cloneMessages(this.base.get(locale) || {}));
    for (const registration of this.registrations) {
      if (registration.locale !== locale) continue;
      global.mergeLocaleMessage(locale, cloneMessages(registration.messages));
    }
  }
}

interface FrontendI18nPluginConfig {
  language?: string;
}

export function apply(ctx: PanelFrontendPluginContext, config?: FrontendI18nPluginConfig) {
  const language = toStandardLang(config?.language);
  const instance = createI18n({
    allowComposition: true,
    globalInjection: true,
    locale: language,
    fallbackLocale: "en_us",
    messages: cloneMessages(baseLocaleMessages) as any
  });

  // vue-i18n's inferred schema recursively expands through Cordis's plugin
  // constructor overloads, so keep that third-party generic at this boundary.
  ctx.plugin(I18nService as any, { instance });
  const service = ctx.get("i18n");
  if (!service) throw new Error("Failed to register the frontend i18n service.");
  ctx.effect(() => {
    const previous = (window as any).setLang;
    (window as any).setLang = (nextLanguage: string, reload = true) =>
      service.setLanguage(nextLanguage, reload);
    return () => {
      if (previous === undefined) delete (window as any).setLang;
      else (window as any).setLang = previous;
    };
  });
}
