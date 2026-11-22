import { reactive, ref } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { loginUser } from "@elementspanel/epanel-plugin-console/services/apis";
import { useAppStateStore } from "@elementspanel/epanel-plugin-console/stores/useAppStateStore";
import { sleep } from "@elementspanel/epanel-plugin-console/tools/common";
import {
  notifyDesktop,
  notifyDesktopError
} from "@elementspanel/epanel-plugin-console/tools/desktopNotice";

export function useDesktopLogin(onSuccess: () => void) {
  const formData = reactive({
    username: "",
    password: "",
    code: ""
  });

  const { execute: login } = loginUser();
  const { updateUserInfo } = useAppStateStore();
  const loginStep = ref(0);
  const is2Fa = ref(false);

  const handleLogin = async () => {
    if (!formData.username.trim() || !formData.password.trim()) {
      return notifyDesktop(t("TXT_CODE_COMMON_PLEASE_COMPLETE_YOUR_ACCOUNT_PROFILE"), "error");
    }
    try {
      loginStep.value = 1;
      await sleep(600);
      const result = await login({ data: formData });
      if (result.value === "NEED_2FA") {
        loginStep.value = 0;
        is2Fa.value = true;
        return;
      }
      is2Fa.value = false;
      await sleep(600);
      await handleNext();
    } catch (error: any) {
      loginStep.value = 0;
      notifyDesktopError(error);
    }
  };

  const handleNext = async () => {
    try {
      await updateUserInfo();
      onSuccess();
    } catch (error: any) {
      console.error(error);
      loginStep.value = 0;
      notifyDesktop(
        {
          message: t("TXT_CODE_COMMON_PAGE_NOT_FUNCTIONING_CORRECTLY"),
          description: t(
            "TXT_CODE_COMMON_UNABLE_TO_LOAD_LOGIN_INFORMATION_REFRESH_THE_PAGE_IF_IT_STILL_FAILS_CHECK_YOUR_NETWORK_OR"
          )
        },
        "error"
      );
    }
  };
  return { formData, loginStep, is2Fa, handleLogin, handleNext };
}
