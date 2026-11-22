import { onUnmounted, ref, watch } from "vue";
import { useFileDropzone } from "./useFileDropzone";
import { formatDroppedFiles } from "../tools/fileNames";
import type { OverwriteDialogResult as OverwriteResult } from "../types";
import type { useFileManager } from "./useFileManager";

type Manager = Pick<ReturnType<typeof useFileManager>, "currentTabs" | "selectedFiles">;

export function useDesktopFileUpload({ currentTabs, selectedFiles }: Manager) {
  let disposed = false;
  const uploadConfirmDialog = ref({
    show: false,
    files: null as FileList | null,
    name: ""
  });

  const { opacity, handleDragover, handleDragleave, handleDrop } = useFileDropzone({
    enabled: () => currentTabs.value.length > 0,
    onFiles: (files) => {
      uploadConfirmDialog.value = { show: true, files, name: formatDroppedFiles(files) };
    }
  });

  const overwriteDialog = ref({
    show: false,
    count: 0,
    fileName: "",
    all: false,
    overwrite: false,
    resolve: null as ((value: OverwriteResult) => void) | null
  });

  const createOverwriteHandler = () => {
    return (params: { count: number; fileName: string }) => {
      finishOverwrite(false, true);
      if (disposed) return Promise.resolve({ confirmed: false, all: true, overwrite: false });
      return new Promise<OverwriteResult>((resolve) => {
        overwriteDialog.value = {
          show: true,
          count: params.count,
          fileName: params.fileName,
          all: false,
          overwrite: false,
          resolve
        };
      });
    };
  };

  const handleUploadConfirmOk = () => {
    if (uploadConfirmDialog.value.files) {
      selectedFiles([...uploadConfirmDialog.value.files], undefined, createOverwriteHandler());
    }
    uploadConfirmDialog.value.show = false;
  };

  const handleUploadConfirmCancel = () => {
    uploadConfirmDialog.value.show = false;
  };

  const finishOverwrite = (confirmed: boolean, cancelAll = false) => {
    const resolve = overwriteDialog.value.resolve;
    overwriteDialog.value.resolve = null;
    overwriteDialog.value.show = false;
    resolve?.({
      confirmed,
      all: cancelAll || overwriteDialog.value.all,
      overwrite: overwriteDialog.value.overwrite
    });
  };

  const handleOverwriteOk = () => finishOverwrite(true);
  const handleOverwriteCancel = () => finishOverwrite(false);

  watch(
    () => overwriteDialog.value.show,
    (visible) => {
      if (!visible && overwriteDialog.value.resolve) handleOverwriteCancel();
    },
    { flush: "sync" }
  );

  const desktopFileInput = ref<HTMLInputElement | null>(null);
  const onDesktopFileInput = (event: Event) => {
    const files = (event.target as HTMLInputElement).files;
    if (!files?.length) return;
    const names = Array.from(files)
      .map((file) => file.name)
      .join(", ");
    uploadConfirmDialog.value = {
      show: true,
      files,
      name: names.length > 30 ? `${names.slice(0, 27)}...` : names
    };
    (event.target as HTMLInputElement).value = "";
  };

  onUnmounted(() => {
    disposed = true;
    finishOverwrite(false, true);
    uploadConfirmDialog.value.files = null;
  });
  return {
    uploadConfirmDialog,
    overwriteDialog,
    createOverwriteHandler,
    handleUploadConfirmOk,
    handleUploadConfirmCancel,
    finishOverwrite,
    handleOverwriteOk,
    handleOverwriteCancel,
    desktopFileInput,
    onDesktopFileInput,
    opacity,
    handleDragover,
    handleDragleave,
    handleDrop
  };
}
