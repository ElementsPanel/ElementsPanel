import { onUnmounted, ref, watch, type VNodeRef } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";

export function useFileDialogs() {
  let resolveDialog: ((value: string | undefined) => void) | undefined;
  const dialog = ref({
    show: false,
    title: "Dialog",
    loading: false,
    value: "",
    info: "",
    mode: "",
    unzipmode: "0",
    code: "utf-8",
    ref: ref<VNodeRef>(),
    ok: () => {},
    cancel: () => {
      resolveDialog?.(undefined);
      resolveDialog = undefined;
      dialog.value.value = "";
      dialog.value.show = false;
    },
    style: {}
  });

  watch(
    () => dialog.value.show,
    (visible) => {
      if (!visible) dialog.value.cancel();
    }
  );

  const deleteDialog = ref({
    show: false,
    loading: false,
    file: undefined as string | undefined,
    resolve: null as ((value: boolean) => void) | null
  });

  watch(
    () => deleteDialog.value.show,
    (visible) => {
      if (!visible) deleteDialog.value.resolve?.(false);
    },
    { flush: "sync" }
  );

  const openDialog = (
    title: string,
    info: string,
    defaultValue?: string,
    mode?: string,
    style?: object
  ): Promise<string | undefined> => {
    resolveDialog?.(undefined);
    dialog.value.style = style || {};
    dialog.value.value = defaultValue || "";
    dialog.value.mode = mode || "";

    dialog.value.title = title;
    dialog.value.info = info;
    dialog.value.show = true;

    (dialog.value?.ref as any)?.focus();

    return new Promise((resolve) => {
      resolveDialog = resolve;
      dialog.value.ok = () => {
        if (
          dialog.value.value == "" &&
          dialog.value.mode != "unzip" &&
          dialog.value.mode != "permission"
        ) {
          return reportErrorMsg(t("TXT_CODE_COMMON_PLEASE_ENTER_CONTENT"));
        }
        resolve(dialog.value.value);
        resolveDialog = undefined;
        dialog.value.show = false;
        dialog.value.value = "";
        dialog.value.info = "";
        dialog.value.mode = "";
        dialog.value.style = {};
        dialog.value.ok = () => {};
      };
    });
  };

  onUnmounted(() => {
    dialog.value.cancel();
    deleteDialog.value.resolve?.(false);
  });
  return { dialog, deleteDialog, openDialog };
}
