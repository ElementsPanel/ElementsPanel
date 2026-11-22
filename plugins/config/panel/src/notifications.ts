import { t } from "@elementspanel/epanel-plugin-i18n";
import { getValidatorErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";

export const notify = (text: string, color: "success" | "error") => {
  if (color === "error") message.error(text);
  else message.success(text);
};

export const notifyError = (error: unknown) => {
  console.error("Plugin configuration error:", error);
  notify(getValidatorErrorMsg(error, t("TXT_CODE_COMMON_OPERATION_FAILED")), "error");
};
