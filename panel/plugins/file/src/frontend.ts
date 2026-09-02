import type { PanelFrontendInstanceActionContext, PanelFrontendPluginContext } from "@/plugin";
import type { LayoutCardPoolItemFactory } from "@/config";
import { LayoutCardHeight } from "@/config/originLayoutConfig";
import { t } from "@/lang/i18n";
import { getRandomId } from "@/tools/randId";
import { NEW_CARD_TYPE } from "@/types";
import { FolderOpenOutlined } from "@ant-design/icons-vue";
import { useAppStateStore } from "@/stores/useAppStateStore";
import * as fileManagerApi from "./api";
import UploadBubble from "./components/UploadBubble.vue";
import { useDownloadFileDialog, useImageViewerDialog, useUploadFileDialog } from "./dialogs";
import DesktopFileEditor from "./desktop/DesktopFileEditor.vue";
import DesktopFileManager from "./desktop/DesktopFileManager.vue";
import DesktopImageViewer from "./desktop/DesktopImageViewer.vue";
import { getFileConfigAddr, useFileManager } from "./hooks/useFileManager";
import FileEditor from "./normal/FileEditor.vue";
import FileManagerAction from "./normal/FileManagerAction.vue";
import FileManager from "./normal/FileManager.vue";
import DesktopFileManagerAction from "./desktop/DesktopFileManagerAction.vue";
import ImageViewer from "./normal/ImageViewer.vue";
import uploadService, { UploadFiles } from "./services/uploadService";
import { filterFileName, getFileExtName, getFileIcon, isCompressFile } from "./tools/fileManager";

// The file manager, browser side. It owns the instance file card and its Desktop
// window, the file editor, the image viewer, the upload queue and the three
// dialogs the panel mounts on demand.
//
// Everything another plugin or the panel core needs of it is published as
// `ctx.set("file", ...)`: the upload dialog the settings page opens for a
// logo, the file editor the mod manager and the backup plugin open, the
// extension helpers the code editor uses. Those callers resolve it with
// `usePluginService` and degrade when it is absent, which is what makes this
// plugin removable.

const ROLE_USER = 1;

/** The design-mode picker entry for the file manager card. */
const fileManagerCard: LayoutCardPoolItemFactory = () => ({
  id: getRandomId(),
  permission: ROLE_USER,
  meta: {},
  type: "InstanceFileManager",
  title: t("TXT_CODE_72cce10b"),
  width: 12,
  description: t("TXT_CODE_f49b2787"),
  height: LayoutCardHeight.MEDIUM,
  category: NEW_CARD_TYPE.INSTANCE,
  params: [
    { field: "instanceId", label: t("TXT_CODE_e6a5c12b"), type: "string" },
    { field: "daemonId", label: t("TXT_CODE_72cfab69"), type: "string" },
    { field: "instance", label: t("TXT_CODE_cb043d10"), type: "instance" }
  ]
});

const isFileManagerAvailable = (_context: PanelFrontendInstanceActionContext) => {
  const { state, isAdmin } = useAppStateStore();
  return state.settings.canFileManager || isAdmin.value;
};

export const inject = ["ui", "actions"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.set("file", {
    api: fileManagerApi,
    useFileManager,
    getFileConfigAddr,
    uploadService,
    UploadFiles,
    getFileIcon,
    getFileExtName,
    filterFileName,
    isCompressFile,
    FileEditor,
    ImageViewer,
    DesktopFileManager,
    DesktopFileEditor,
    DesktopImageViewer,
    useUploadFileDialog,
    useDownloadFileDialog,
    useImageViewerDialog
  });

  // The card the layout engine renders for an instance's files. It was a core
  // card registered in `config/index.ts`; registering it by name here stacks it
  // over nothing and simply disappears with the plugin.
  ctx.ui.layoutCard("InstanceFileManager", FileManager);
  ctx.ui.layoutCardPoolItem(fileManagerCard);

  ctx.actions.instance({
    id: "file-manager",
    title: () => t("TXT_CODE_ae533703"),
    icon: FolderOpenOutlined,
    normalComponent: FileManagerAction,
    desktopComponent: DesktopFileManagerAction,
    condition: isFileManagerAvailable,
    desktopInitialWidth: 900,
    desktopInitialHeight: 600
  });

  // The upload progress bubble is an overlay that belongs to no route, and it
  // reports this plugin's own upload queue, so it is mounted for the plugin's
  // lifetime rather than by `App.vue`.
  ctx.ui.globalComponent(UploadBubble);
}
