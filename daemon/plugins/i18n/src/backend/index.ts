import { remove } from "cosmokit";
import { Service, type Context } from "cordis";
import i18next from "i18next";
import type { DaemonI18nService, DaemonPluginContext } from "../../../../src/plugin";
import { baseLocaleMessages } from "../messages";

const NAMESPACE = "translation";

const SUPPORTED_LANGUAGES = [
  { value: "en_us", label: "English" },
  { value: "zh_cn", label: "Simplified Chinese" },
  { value: "zh_tw", label: "Traditional Chinese" },
  { value: "ja_jp", label: "Japanese" },
  { value: "ru_ru", label: "Russian" },
  { value: "de_de", label: "Deutsch" },
  { value: "fr_fr", label: "French" },
  { value: "pt_br", label: "Brazilian Portuguese" },
  { value: "th_th", label: "Thai" },
  { value: "es_es", label: "Spanish" },
  { value: "ko_kr", label: "Korean" },
  { value: "tr_tr", label: "Turkish" }
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

class I18nService extends Service implements DaemonI18nService {
  readonly $t = i18next.t;

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

export async function apply(ctx: DaemonPluginContext) {
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

  // The foundation is loaded before the daemon installs its settings services;
  // wait for them while keeping the declaration attributed to this plugin.
  ctx.plugin({
    name: "i18n",
    inject: ["i18n", "settings", "settingsForm"],
    apply(settingsCtx: DaemonPluginContext) {
      const config = settingsCtx.settings.config;

      settingsCtx.settingsForm.declare({
        fields: () => [
          {
            key: "language",
            type: "select",
            title: settingsCtx.i18n.$t("TXT_CODE_I18N_LANGUAGE"),
            options: SUPPORTED_LANGUAGES.map((item) => ({ ...item }))
          },
          {
            key: "followPanelLanguage",
            type: "boolean",
            title: settingsCtx.i18n.$t("TXT_CODE_I18N_FOLLOW_PANEL")
          }
        ],
        read: () => ({
          language: normalizeLanguage(config.language),
          followPanelLanguage: config.followPanelLanguage !== false
        }),
        write: (values) => {
          const currentLanguage = normalizeLanguage(config.language);
          const language = normalizeLanguage(values.language, currentLanguage);
          if (values.language != null && language !== currentLanguage) {
            settingsCtx.settings.setLanguage(language);
          }
          if (values.followPanelLanguage != null) {
            config.followPanelLanguage = Boolean(values.followPanelLanguage);
          }
          settingsCtx.settings.save();
        }
      });
    }
  });
}
