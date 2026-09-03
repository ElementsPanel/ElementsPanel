import { remove } from "cosmokit";
import { Service, type Context } from "cordis";
import i18next from "i18next";
import type { DaemonI18nService, DaemonPluginContext } from "../../../../src/plugin";
import { baseLocaleMessages } from "../messages";

const NAMESPACE = "translation";

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
}
