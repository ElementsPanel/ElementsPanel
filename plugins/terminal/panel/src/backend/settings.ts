import type { PanelPluginContext } from "../../../../../core/panel/src/app/plugin";
import {
  TerminalSettings,
  TERMINAL_SETTINGS_LIMITS,
  normalizeTerminalSettings
} from "../../../shared/settings";

const CATEGORY = "TerminalSettings";
const UUID = "config";

export async function registerTerminalSettings(ctx: PanelPluginContext) {
  const storage = ctx.storage.getStorage();
  let settings = normalizeTerminalSettings(await storage.load(CATEGORY, TerminalSettings, UUID));

  ctx.inject(["settingsForm"], (scope) => {
    const $t = scope.i18n.$t;
    scope.settingsForm.declare({
      fields: () => [
        {
          key: "historyLimitKB",
          type: "number",
          title: $t("TXT_CODE_TERMINAL_HISTORY_LIMIT"),
          description: $t("TXT_CODE_TERMINAL_HISTORY_LIMIT_DESC"),
          ...TERMINAL_SETTINGS_LIMITS.historyLimitKB
        },
        {
          key: "scrollback",
          type: "number",
          title: $t("TXT_CODE_TERMINAL_SCROLLBACK"),
          description: $t("TXT_CODE_TERMINAL_SCROLLBACK_DESC"),
          ...TERMINAL_SETTINGS_LIMITS.scrollback
        },
        {
          key: "fontFamily",
          type: "string",
          title: $t("TXT_CODE_TERMINAL_FONT_FAMILY"),
          description: $t("TXT_CODE_TERMINAL_FONT_FAMILY_DESC")
        },
        {
          key: "fontSize",
          type: "number",
          title: $t("TXT_CODE_TERMINAL_FONT_SIZE"),
          description: $t("TXT_CODE_TERMINAL_FONT_SIZE_DESC"),
          ...TERMINAL_SETTINGS_LIMITS.fontSize
        },
        {
          key: "ctrlCProtection",
          type: "boolean",
          title: $t("TXT_CODE_TERMINAL_CTRL_C_PROTECTION"),
          description: $t("TXT_CODE_TERMINAL_CTRL_C_PROTECTION_DESC")
        },
        {
          key: "ctrlCIntervalMs",
          type: "number",
          title: $t("TXT_CODE_TERMINAL_CTRL_C_INTERVAL"),
          description: $t("TXT_CODE_TERMINAL_CTRL_C_INTERVAL_DESC"),
          visibleWhen: "ctrlCProtection",
          ...TERMINAL_SETTINGS_LIMITS.ctrlCIntervalMs
        }
      ],
      read: () => ({ ...settings }),
      write: async (values) => {
        const candidate = { ...settings, ...values };
        const next = normalizeTerminalSettings(candidate);
        if (
          (Object.keys(next) as Array<keyof TerminalSettings>).some((key) => next[key] !== candidate[key])
        )
          throw new Error($t("TXT_CODE_TERMINAL_INVALID_SETTINGS"));
        await storage.store(CATEGORY, UUID, next);
        settings = next;
      }
    });
  });
  return () => ({ ...settings });
}
