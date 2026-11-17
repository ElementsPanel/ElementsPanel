import { t } from "@elementspanel/epanel-plugin-i18n";
import { useAppStateStore } from "@elementspanel/epanel-plugin-console/stores/useAppStateStore";

export async function restoreSession() {
  try {
    await useAppStateStore().updateUserInfo();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const expectedAuthErrors = [
      t("TXT_CODE_PERMISSION_FORBIDDEN"),
      t("TXT_CODE_PERMISSION_FORBIDDEN_TOKEN_ERROR")
    ];
    if (!expectedAuthErrors.includes(message)) {
      console.error("Init user info Error:", error);
    }
  }
}
