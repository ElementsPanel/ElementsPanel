import { computed, watch } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import uploadService from "../services/uploadService";
import type { FileTarget } from "../types";

interface Options {
  target: () => FileTarget;
  refresh: () => unknown;
}

export function useFileUploadProgress({ target, refresh }: Options) {
  let uploading = false;
  const progress = computed(() => {
    const current = uploadService.uiData.value.current;
    return current ? (current[0] * 100) / current[1] : 0;
  });
  const uploadData = uploadService.uiData;
  const uploadInstanceTag = computed(() => {
    const { instanceId, daemonId } = target();
    if (
      !uploadData.value.instanceInfo ||
      uploadData.value.instanceInfo.instanceId != instanceId ||
      uploadData.value.instanceInfo.daemonId != daemonId
    ) {
      return `(${t("TXT_CODE_COMMON_UPLOADING_TO_OTHER_INSTANCES")})`;
    }
    return "";
  });
  watch(
    () => uploadService.uiData.value,
    (value) => {
      if (value.current) uploading = true;
      else if (uploading) {
        uploading = false;
        refresh();
      }
    },
    { immediate: true }
  );
  return { progress, uploadData, uploadInstanceTag, uploadService };
}
