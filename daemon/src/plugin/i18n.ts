import { Service, type Context } from "cordis";
import i18next from "i18next";
import { remove } from "cosmokit";
import { $t } from "../i18n";
import type { DaemonI18nService } from "./context";

const NAMESPACE = "translation";

/**
 * A deep copy, because `addResourceBundle` merges into the objects it is given:
 * a shallow snapshot of the base catalogue would let a plugin's nested keys
 * mutate the core's own bundle and outlive the plugin.
 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface LocaleRegistration {
  locale: string;
  resources: Record<string, unknown>;
}

/**
 * Translation for plugins.
 *
 * A plugin owns the strings only it uses and ships them in its own `src/i18n`,
 * so the shared `languages` catalogue keeps just what the core and more than one
 * plugin need. Registration is an effect: the bundles are removed again when the
 * plugin unloads.
 *
 * Removing one plugin's keys cannot be done by deletion, because two plugins may
 * define the same key and a plugin may deliberately override a core string. The
 * base catalogue is snapshotted the first time a locale is touched, and every
 * change re-applies that base plus the registrations still live — the same
 * algorithm the panel and the frontend use.
 */
export class I18nService extends Service implements DaemonI18nService {
  readonly $t = $t;

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
