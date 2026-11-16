import type { PanelPluginContext } from "../../../../../../core/panel/src/app/plugin";
import { ModManagerService } from "./mod_manager";
import { registerModManagerRoutes } from "./router";
import {
  isModSourcePreference,
  loadModManagerSettings,
  saveModManagerSettings,
  MOD_REQUEST_LIMITS
} from "./settings";

export function registerModManager(ctx: PanelPluginContext) {
  const manager = new ModManagerService(ctx);
  registerModManagerRoutes(ctx, manager);

  // Load before publishing the form, so a late startup read cannot overwrite a saved change.
  ctx.inject(["storage"], async (scope) => {
    try {
      manager.setSettings(await loadModManagerSettings(scope));
    } catch (err) {
      scope.logger.warn("Failed to load the mod manager settings:", err);
    }
    scope.inject(["settingsForm"], (settingsScope) => {
      const $t = settingsScope.i18n.$t;
      settingsScope.settingsForm.declare({
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
            title: $t(`TXT_CODE_MOD_SETTING_${key}`),
            description: $t(`TXT_CODE_MOD_SETTING_${key}_DESC`),
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
              throw new Error($t(`TXT_CODE_MOD_SETTING_${key}_DESC`));
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
