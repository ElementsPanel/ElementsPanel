import { t } from "@elementspanel/epanel-plugin-i18n";
import { computed, type Ref } from "vue";

export function useXhrPollError(error: Ref<Error | undefined>) {
  const xhrErrorMsg = t(
    "TXT_CODE_COMMON_IT_LOOKS_LIKE_YOU_ARE_TRYING_TO_USE_HTTPS_BUT_WE_CANNOT_CONNECT_TO_THE_DAEMON"
  );
  const xhrErrorMsg2 = t("TXT_CODE_PANEL_BACKEND_CONNECTION_TROUBLESHOOTING_HINT");

  const isXhrPollError = computed(() => {
    return error.value?.message.toLowerCase().includes("xhr poll error");
  });
  const xhrPollErrorReason = computed(() => {
    if (window.location.protocol.includes("https")) {
      return xhrErrorMsg;
    }
    return xhrErrorMsg2;
  });

  return {
    isXhrPollError,
    xhrPollErrorReason
  };
}
