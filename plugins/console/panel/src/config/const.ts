import { t } from "@elementspanel/epanel-plugin-i18n";

export const GLOBAL_INSTANCE_NAME = "__MCSM_GLOBAL_INSTANCE__";

export const GLOBAL_INSTANCE_UUID = "global0001";

export const PERMISSION_MAP: Record<string, string> = {
  "1": t("TXT_CODE_COMMON_USER"),
  "10": t("TXT_CODE_COMMON_ADMIN"),
  "-1": t("TXT_CODE_COMMON_BANNED")
};
