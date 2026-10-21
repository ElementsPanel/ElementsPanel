import type { PanelPluginContext } from "../../../../src/app/plugin";
import { localeMessages } from "../i18n";
import { ModManagerService } from "./mod_manager";
import { registerModManagerRoutes } from "./router";
import { isModSourcePreference, loadSourcePreference, saveSourcePreference } from "./settings";

export const inject = ["koa", "i18n", "remote", "middleware", "roles", "identity"];

export function apply(ctx: PanelPluginContext) {
  ctx.i18n.define(localeMessages);
  const manager = new ModManagerService(ctx);
  registerModManagerRoutes(ctx, manager);

  // The stored preference arrives with `storage`, which is foundational, so the
  // service runs with the saved choice from the first request onwards.
  ctx.inject(["storage"], async (scope) => {
    try {
      manager.setSourcePreference(await loadSourcePreference(scope));
    } catch (err) {
      scope.logger.warn("Failed to load the mod source preference:", err);
    }
  });

  // The form belongs to the config plugin, which loads long after this one, so
  // it is declared when that service appears rather than held as a dependency.
  // Without it the preference simply stays at its current value.
  ctx.inject(["settingsForm"], (scope) => {
    const $t = scope.i18n.$t;
    scope.settingsForm.declare({
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
        }
      ],
      read: () => ({ sourcePreference: manager.sourcePreference }),
      write: async (values) => {
        // The form layer validates against the declared options first; this
        // guard only keeps a direct call from persisting a network-affecting
        // value the service could not interpret.
        const preference = values.sourcePreference;
        if (!isModSourcePreference(preference)) throw new Error("Invalid mod source preference.");
        await saveSourcePreference(scope, preference);
        manager.setSourcePreference(preference);
      }
    });
  });
}
