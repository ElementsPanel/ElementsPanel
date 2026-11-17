import { remove } from "cosmokit";
import { Service, type Context } from "cordis";
import i18next from "i18next";
import type { PanelI18nService, PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import { baseLocaleMessages } from "../messages";

const NAMESPACE = "translation";

const SUPPORTED_LANGUAGES = [
  { value: "en_us", label: "English" },
  { value: "zh_cn", label: "简体中文" },
  { value: "zh_tw", label: "繁體中文" },
  { value: "ja_jp", label: "日本語" },
  { value: "ru_ru", label: "Русский" },
  { value: "de_de", label: "Deutsch" },
  { value: "fr_fr", label: "Français" },
  { value: "pt_br", label: "Português Brasileiro" },
  { value: "th_th", label: "ภาษาไทย" },
  { value: "es_es", label: "Español" },
  { value: "ko_kr", label: "한국어" },
  { value: "tr_tr", label: "Türkçe" }
] as const;

const SUPPORTED_LANGUAGE_VALUES = new Set<string>(SUPPORTED_LANGUAGES.map((item) => item.value));

function normalizeLanguage(value: unknown, fallback = "en_us") {
  const normalized = String(value ?? "").replace(/-/g, "_").toLowerCase();
  return SUPPORTED_LANGUAGE_VALUES.has(normalized) ? normalized : fallback;
}

interface LocaleRegistration {
  locale: string;
  resources: Record<string, unknown>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class I18nService extends Service implements PanelI18nService {
  readonly $t = i18next.t;
  readonly i18next = i18next;

  private readonly base = new Map<string, Record<string, unknown>>();
  private readonly registrations: LocaleRegistration[] = [];

  constructor(ctx: Context) {
    super(ctx, "i18n", true);
  }

  define(messages: Record<string, Record<string, unknown>>) {
    const added = Object.entries(messages ?? {}).map(([locale, resources]) => ({
      locale,
      resources
    }));
    return this.ctx.effect(() => {
      for (const registration of added) {
        if (!this.base.has(registration.locale)) {
          this.base.set(
            registration.locale,
            clone(i18next.getResourceBundle(registration.locale, NAMESPACE) ?? {})
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
    i18next.removeResourceBundle(locale, NAMESPACE);
    i18next.addResourceBundle(locale, NAMESPACE, clone(this.base.get(locale) ?? {}), true, true);
    for (const registration of this.registrations) {
      if (registration.locale !== locale) continue;
      i18next.addResourceBundle(locale, NAMESPACE, registration.resources, true, true);
    }
  }
}

export async function apply(ctx: PanelPluginContext) {
  const resources: Record<string, { translation: Record<string, unknown> }> = {};
  for (const [locale, translation] of Object.entries(baseLocaleMessages)) {
    resources[locale] = { translation };
  }

  await i18next.init({
    interpolation: { escapeValue: false },
    lng: "en_us",
    fallbackLng: "en_us",
    resources
  });

  ctx.plugin(I18nService);

  // Wait for settings services while attributing the declaration to this plugin.
  ctx.plugin({
    name: "i18n",
    inject: ["i18n", "settings", "settingsForm"],
    apply(settingsCtx: PanelPluginContext) {
      const config = settingsCtx.settings.config;

      settingsCtx.settingsForm.declare({
        fields: () => [
          {
            key: "language",
            type: "select",
            title: settingsCtx.i18n.$t("TXT_CODE_a1a59b08"),
            options: SUPPORTED_LANGUAGES.map((item) => ({ ...item }))
          }
        ],
        read: () => ({ language: normalizeLanguage(config.language) }),
        write: async (values) => {
          const language = normalizeLanguage(values.language, normalizeLanguage(config.language));
          config.language = language;
          await i18next.changeLanguage(language);
          await settingsCtx.settings.save();

          // Connected daemons accept panel language updates according to their follow-panel-language setting.
          const remote = settingsCtx.get("remote");
          remote?.services.changeDaemonLanguage(language);
        }
      });
    }
  });
}
