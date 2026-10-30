import { t } from "@/lang/i18n";
import { getAppearance } from "./apis/appearance";

/** Applies the configured page title before the shell renders. */
export async function initAppearance() {
  try {
    const { value } = await getAppearance().execute();
    document.title = value?.pageTitle || t("TXT_CODE_47ae8ee6");
  } catch (error) {
    console.error("init appearance error:", error);
  }
}
