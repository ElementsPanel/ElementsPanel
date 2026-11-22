import { router } from "@elementspanel/epanel-plugin-console/config/router";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { ctx } from "@elements-panel/sdk";
import {
  loginPageInfo,
  loginUser,
  ssoConfig,
  type SsoPublicConfig
} from "@elementspanel/epanel-plugin-console/services/apis";
import { useAppStateStore } from "@elementspanel/epanel-plugin-console/stores/useAppStateStore";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import { Modal } from "@elementspanel/epanel-plugin-console/tools/vuetifyModal";
import { computed, onMounted, reactive, ref } from "vue";

export function useLogin() {
  const { state: pageInfoResult, execute } = loginPageInfo();
  const ssoInfo = ref<SsoPublicConfig | null>(null);

  const formData = reactive({
    username: "",
    password: "",
    code: ""
  });

  const { execute: login } = loginUser();
  const { updateUserInfo } = useAppStateStore();
  const loginActions = computed(() =>
    ctx.menus.loginActions
      .filter((action) =>
        typeof action.condition === "function"
          ? action.condition()
          : action.condition === undefined || action.condition
      )
      .map((action) => ({
        ...action,
        title: typeof action.title === "function" ? action.title() : action.title
      }))
  );

  const loading = ref(false);
  const is2Fa = ref(false);

  const handleLogin = async () => {
    if (!formData.username.trim() || !formData.password.trim()) {
      return message.error(t("TXT_CODE_COMMON_PLEASE_COMPLETE_YOUR_ACCOUNT_PROFILE"));
    }
    if (loading.value) return;
    loading.value = true;
    try {
      const result = await login({
        data: formData
      });
      if (result.value === "NEED_2FA") {
        is2Fa.value = true;
        return;
      }
      is2Fa.value = false;
      await handleNext();
    } catch (error: any) {
      reportErrorMsg(error);
    } finally {
      loading.value = false;
    }
  };

  const handleNext = async () => {
    try {
      await updateUserInfo();
      await loginSuccess();
    } catch (error: any) {
      console.error(error);
      Modal.error({
        title: t("TXT_CODE_COMMON_PAGE_NOT_FUNCTIONING_CORRECTLY"),
        content: t(
          "TXT_CODE_COMMON_UNABLE_TO_LOAD_LOGIN_INFORMATION_REFRESH_THE_PAGE_IF_IT_STILL_FAILS_CHECK_YOUR_NETWORK_OR"
        )
      });
    }
  };

  const loginSuccess = async () => {
    await router.replace({ path: "/" });
  };

  const handleSsoLogin = () => {
    window.location.href = "/api/auth/sso/authorize";
  };

  onMounted(async () => {
    await execute();

    try {
      const res = await ssoConfig().execute();
      if (res.value) ssoInfo.value = res.value;
    } catch {
      // Keep password login available when SSO settings cannot be loaded.
    }

    if (ssoInfo.value?.enabled && ssoInfo.value?.autoRedirect) {
      const query = router.currentRoute.value.query;
      if (!query.sso_error && query.ssoAutoRedirect !== "false") {
        handleSsoLogin();
        return;
      }
    }

    const ssoError = router.currentRoute.value.query.sso_error;
    if (ssoError) {
      const ssoErrorDesc = router.currentRoute.value.query.sso_error_desc;
      const errorCode = String(ssoError);
      const ssoErrorTitles: Record<string, string> = {
        sso_init_failed: t("TXT_CODE_SSO_ERROR_INIT_FAILED"),
        sso_auth_failed: t("TXT_CODE_SSO_ERROR_AUTH_FAILED"),
        session_expired: t("TXT_CODE_SSO_ERROR_SESSION_EXPIRED"),
        invalid_sso_session: t("TXT_CODE_SSO_ERROR_SESSION_EXPIRED"),
        sso_session_expired: t("TXT_CODE_SSO_ERROR_SESSION_EXPIRED")
      };
      Modal.error({
        title: ssoErrorTitles[errorCode] || `${t("TXT_CODE_SSO_ERROR")}: ${errorCode}`,
        content: ssoErrorDesc ? String(ssoErrorDesc) : t("TXT_CODE_SSO_CALLBACK_FAIL")
      });
    }
  });

  return {
    pageInfoResult,
    ssoInfo,
    formData,
    loginActions,
    loading,
    is2Fa,
    handleLogin,
    handleNext,
    loginSuccess,
    handleSsoLogin
  };
}
