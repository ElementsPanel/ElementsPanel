import { useMountComponent } from "@/hooks/useMountComponent";
import type { DownloadFileConfigItem } from "@/types/fileManager";
import DownloadFileDialogVue from "./components/DownloadFileDialog.vue";
import UploadFileDialogVue from "./components/UploadFileDialog.vue";
import ImageViewerDialog from "./normal/ImageViewer.vue";

// The three dialogs the file manager mounts on demand. They used to live in the
// core's `components/fc` barrel, but `useFileManager` calls the image viewer and
// the viewer is this plugin's, so the barrel would have had to import a plugin
// component. They belong here, with everything else they touch.

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
