import { t } from "@/lang/i18n";
import { useAppStateStore } from "@/stores/useAppStateStore";

export async function restoreSession() {
  try {
    await useAppStateStore().updateUserInfo();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const expectedAuthErrors = [
      t("TXT_CODE_permission.forbidden"),
      t("TXT_CODE_permission.forbiddenTokenError")
    ];
    if (!expectedAuthErrors.includes(message)) {
      console.error("Init user info Error:", error);
    }
  }
}
