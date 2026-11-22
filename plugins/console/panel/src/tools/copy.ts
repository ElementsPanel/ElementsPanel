import { t } from "@elementspanel/epanel-plugin-i18n";
import { useClipboard } from "@vueuse/core";
import { message } from "@/tools/vuetifyToast";
import { Modal } from "@/tools/vuetifyModal";
import { h } from "vue";

const { copy, copied, isSupported } = useClipboard();

export const toCopy = async (sth: string | number) => {
  try {
    if (!isSupported.value) {
      const input = document.createElement("input");
      input.setAttribute("value", String(sth));
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      return message.success(t("TXT_CODE_COMMON_COPIED"));
    } else {
      await copy(String(sth));
      if (copied.value) return message.success(t("TXT_CODE_COMMON_COPIED"));
    }
  } catch (err: any) {
    console.error(err);
    Modal.warning({
      title: t("TXT_CODE_COMMON_YOUR_BROWSER_DOES_NOT_SUPPORT_CLIPBOARD_API"),
      content: [
        h("span", t("TXT_CODE_COMMON_PLEASE_MANUALLY_COPY_THE_FOLLOWING_CONTENT")),
        h("br"),
        h("span", sth)
      ]
    });
  }
};
