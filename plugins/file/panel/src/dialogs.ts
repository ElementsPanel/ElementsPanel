import { useMountComponent } from "@elementspanel/epanel-plugin-console/hooks/useMountComponent";
import type { DownloadFileConfigItem } from "@elementspanel/epanel-plugin-console/types/fileManager";
import DownloadFileDialogVue from "./components/DownloadFileDialog.vue";
import UploadFileDialogVue from "./components/UploadFileDialog.vue";
import ImageViewerDialog from "./normal/ImageViewer.vue";

// File-manager dialogs are owned and mounted by this plugin.

export async function useDownloadFileDialog() {
  return (
    (await useMountComponent().mount<DownloadFileConfigItem>(DownloadFileDialogVue)) || undefined
  );
}

export async function useUploadFileDialog() {
  return (await useMountComponent().mount<string>(UploadFileDialogVue)) || "";
}

export async function useImageViewerDialog(
  instanceId: string,
  daemonId: string,
  fileName: string,
  frontDir: string
) {
  return await useMountComponent({ instanceId, daemonId, fileName, frontDir }).mount(
    ImageViewerDialog
  );
}
