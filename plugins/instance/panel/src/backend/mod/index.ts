import type { PanelPluginContext } from "../../../../../../core/panel/src/app/plugin";
import { ModManagerService } from "./mod_manager";
import { registerModManagerRoutes } from "./router";
import {
  isModSourcePreference,
  loadModManagerSettings,
  saveModManagerSettings,
  ModManagerSettings,
  MOD_REQUEST_LIMITS
} from "./settings";

const MOD_SETTING_MESSAGES: Record<
  keyof typeof MOD_REQUEST_LIMITS,
  { title: string; description: string; unit?: string }
> = {
  requestTimeoutMs: {
    title: "TXT_CODE_MOD_SETTING_REQUEST_TIMEOUT_MS",
    description: "TXT_CODE_MOD_SETTING_REQUEST_TIMEOUT_MS_DESC",
    unit: "ms"
  },
  requestRetries: {
    title: "TXT_CODE_MOD_SETTING_REQUEST_RETRIES",
    description: "TXT_CODE_MOD_SETTING_REQUEST_RETRIES_DESC"
  }
};

export function registerModManager(ctx: PanelPluginContext) {
  const manager = new ModManagerService(ctx);
  registerModManagerRoutes(ctx, manager);

  // Load saved settings before exposing the form so late reads cannot overwrite edits.
  ctx.inject(["storage"], async (scope) => {
    try {
      manager.setSettings(await loadModManagerSettings(scope));
    } catch (err) {
      scope.logger.warn("Failed to load the mod manager settings:", err);
    }
    scope.inject(["settingsForm"], (settingsScope) => {
      const $t = settingsScope.i18n.$t;
      settingsScope.settingsForm.declare({
        defaults: () => ({ ...new ModManagerSettings() }),
        page: () => ({ id: "mods", title: $t("TXT_CODE_SETTINGS_PAGE_MODS") }),
        fields: () => [
          {
            key: "sourcePreference",
            type: "select",
            title: $t("TXT_CODE_MOD_SOURCE_PREFERENCE"),
            description: $t("TXT_CODE_MOD_SOURCE_PREFERENCE_DESC"),
            options: [
              { value: "mirror", label: $t("TXT_CODE_MOD_SOURCE_MIRROR") },
              { value: "official", label: $t("TXT_CODE_MOD_SOURCE_OFFICIAL") }
            ]
          },
          ...Object.entries(MOD_REQUEST_LIMITS).map(([key, range]) => ({
            key,
            type: "number" as const,
            title: $t(MOD_SETTING_MESSAGES[key as keyof typeof MOD_REQUEST_LIMITS].title),
            description: $t(
              MOD_SETTING_MESSAGES[key as keyof typeof MOD_REQUEST_LIMITS].description
            ),
            unit: MOD_SETTING_MESSAGES[key as keyof typeof MOD_REQUEST_LIMITS].unit,
            min: range.min,
            max: range.max
          }))
        ],
        read: () => ({ ...manager.settings }),
        write: async (values) => {
          if (
            values.sourcePreference !== undefined &&
            !isModSourcePreference(values.sourcePreference)
          )
            throw new Error("Invalid mod source preference.");
          for (const [key, range] of Object.entries(MOD_REQUEST_LIMITS)) {
            const value = values[key];
            if (
              value !== undefined &&
              (!Number.isInteger(value) || Number(value) < range.min || Number(value) > range.max)
            )
              throw new Error(
                $t(MOD_SETTING_MESSAGES[key as keyof typeof MOD_REQUEST_LIMITS].description)
              );
          }
          const next = { ...manager.settings };
          if (values.sourcePreference !== undefined)
            next.sourcePreference = values.sourcePreference as typeof next.sourcePreference;
          for (const key of Object.keys(MOD_REQUEST_LIMITS) as Array<
            keyof typeof MOD_REQUEST_LIMITS
          >) {
            if (values[key] !== undefined) next[key] = Number(values[key]);
          }
          await saveModManagerSettings(scope, next);
          manager.setSettings(next);
        }
      });
    });
  });
}
