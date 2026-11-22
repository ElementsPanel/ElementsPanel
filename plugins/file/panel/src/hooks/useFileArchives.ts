import { t } from "@elementspanel/epanel-plugin-i18n";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import type { FileTarget } from "../types";
import { ref, type Ref } from "vue";
import type {
  ArchiveEntry,
  DataType
} from "@elementspanel/epanel-plugin-console/types/fileManager";
import { compressFile as compressFileApi, previewArchive as previewArchiveApi } from "../api";
import type { OpenFileDialog } from "../types";
import type { useFileDialogs } from "./useFileDialogs";

interface Options extends FileTarget {
  currentPath: Ref<string>;
  selectionData: Ref<DataType[] | undefined>;
  openDialog: OpenFileDialog;
  dialog: ReturnType<typeof useFileDialogs>["dialog"];
  getFileList: (throwErr?: boolean, initPath?: string) => Promise<boolean>;
}

export function useFileArchives(options: Options) {
  const { instanceId, daemonId, currentPath, selectionData, openDialog, dialog, getFileList } =
    options;

  const archivePreview = ref({
    show: false,
    loading: false,
    title: "",
    entries: [] as ArchiveEntry[]
  });

  const previewArchiveFile = async (name: string) => {
    archivePreview.value = {
      show: true,
      loading: true,
      title: name,
      entries: []
    };
    try {
      const { execute } = previewArchiveApi();
      const res = await execute({
        params: {
          daemonId: daemonId || "",
          uuid: instanceId || "",
          target: currentPath.value + name,
          code: "utf-8"
        }
      });
      archivePreview.value.entries = res.value?.items || [];
    } catch (error: any) {
      archivePreview.value.show = false;
      reportErrorMsg(error.message);
    } finally {
      archivePreview.value.loading = false;
    }
  };

  const closeArchivePreview = () => {
    archivePreview.value.show = false;
  };

  const zipFile = async (_showLoadingDialog = true) => {
    if (!selectionData.value || selectionData.value.length === 0)
      return reportErrorMsg(t("TXT_CODE_COMMON_PLEASE_SELECT_A_FILE_FIRST"));
    const filename = await openDialog(
      t("TXT_CODE_COMMON_COMPRESS_FILES"),
      t("TXT_CODE_COMMON_PLEASE_ENTER_THE_NAME_FOR_THE_ARCHIVE"),
      "",
      "zip"
    );
    if (filename === undefined) return;
    const { execute } = compressFileApi();
    message.info(t("TXT_CODE_TASKS_SUBMITTED"));
    try {
      await execute({
        params: {
          uuid: instanceId || "",
          daemonId: daemonId || ""
        },
        data: {
          type: 1,
          code: "utf-8",
          source: currentPath.value + filename + ".zip",
          targets: selectionData.value.map((e) => currentPath.value + e.name)
        }
      });
      message.success(t("TXT_CODE_COMMON_TASK_COMPLETED"));
      await getFileList();
    } catch (error: any) {
      message.error(t("TXT_CODE_COMMON_COMPRESSION_FAILED"));
      reportErrorMsg(error.message);
    }
  };

  const unzipFile = async (name: string, _showLoadingDialog = true) => {
    const dirname = await openDialog(t("TXT_CODE_COMMON_UNZIP_FILES"), "", "", "unzip");
    if (dirname === undefined) return;
    const { execute } = compressFileApi();
    message.info(t("TXT_CODE_TASKS_SUBMITTED"));
    try {
      await execute({
        params: {
          uuid: instanceId || "",
          daemonId: daemonId || ""
        },
        data: {
          type: 2,
          code: dialog.value.code,
          source: currentPath.value + name,
          targets: dialog.value.unzipmode == "0" ? currentPath.value : currentPath.value + dirname
        }
      });
      message.success(t("TXT_CODE_COMMON_TASK_COMPLETED"));
      await getFileList();
    } catch (error: any) {
      message.error(t("TXT_CODE_FILE_DECOMPRESSION_TASK_FAILED"));
      reportErrorMsg(error.message);
    }
  };

  return { archivePreview, previewArchiveFile, closeArchivePreview, zipFile, unzipFile };
}
