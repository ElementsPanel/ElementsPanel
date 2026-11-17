import { t } from "@elementspanel/epanel-plugin-i18n";
import { getAppearance } from "./apis/appearance";

export async function initAppearance() {
  try {
    const { value } = await getAppearance().execute();
    document.title = value?.pageTitle || t("TXT_CODE_COMMON_ELEMENTS_PANEL");
  } catch (error) {
    console.error("init appearance error:", error);
  }
}
