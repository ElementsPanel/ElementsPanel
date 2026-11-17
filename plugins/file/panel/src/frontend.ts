import type { PanelFrontendInstanceActionContext, PanelFrontendPluginContext } from "@elements-panel/sdk";
import { isScopedInstance } from "@elementspanel/epanel-plugin-console/hooks/useInstanceActionAvailability";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { useAppStateStore } from "@elementspanel/epanel-plugin-console/stores/useAppStateStore";
import * as fileManagerApi from "./api";
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
import { localeMessages } from "./i18n";

// Publish file features through an optional service that callers resolve at use time.

const ROLE_USER = 1;
const ROLE_ADMIN = 10;

const isFileManagerAvailable = (context: PanelFrontendInstanceActionContext) => {
  if (!isScopedInstance(context)) return false;
  const { state, isAdmin } = useAppStateStore();
  return state.settings.canFileManager || isAdmin.value;
};

export const inject = ["console", "i18n", "slots", "actions", "routes"];

export function apply(ctx: PanelFrontendPluginContext) {
  ctx.i18n.define(localeMessages);
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

  ctx.routes.add({
    path: "/instances/terminal/files",
    name: t("TXT_CODE_COMMON_FILE_MANAGEMENT"),
    component: FileManager,
    meta: {
      permission: ROLE_USER,
      breadcrumbs: [
        {
          name: t("TXT_CODE_COMMON_INSTANCES"),
          path: "/instances",
          mainMenu: true,
          permission: ROLE_ADMIN
        },
        {
          name: t("TXT_CODE_COMMON_TERMINAL"),
          path: "/instances/terminal",
          permission: ROLE_USER
        }
      ]
    }
  });

  ctx.actions.instance({
    id: "file-manager",
    title: () => t("TXT_CODE_COMMON_FILE_MANAGEMENT"),
    icon: "mdi-folder-open-outline",
    mdiIcon: "mdi-folder-open-outline",
    normalComponent: FileManagerAction,
    desktopComponent: DesktopFileManagerAction,
    condition: isFileManagerAvailable,
    desktopInitialWidth: 900,
    desktopInitialHeight: 600
  });

}
