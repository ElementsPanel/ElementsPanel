import { useMountComponent } from "@/hooks/useMountComponent";
import AddJavaDialog from "./components/AddJavaDialog.vue";
import DownloadJavaDialog from "./components/DownloadJavaDialog.vue";
import type { AddJavaConfigItem, DownloadJavaConfigItem } from "./types";

export async function useAddJavaDialog() {
  return (await useMountComponent().mount<AddJavaConfigItem>(AddJavaDialog)) || undefined;
}

export async function useDownloadJavaDialog(daemonId: string, installedJavaList?: string[]) {
  return (
    (await useMountComponent({ daemonId, installedJavaList }).mount<DownloadJavaConfigItem>(
      DownloadJavaDialog
    )) || undefined
  );
}
