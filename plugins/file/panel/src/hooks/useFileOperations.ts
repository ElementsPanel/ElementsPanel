import { t } from "@elementspanel/epanel-plugin-i18n";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import type { FileTarget } from "../types";
import { ref, type Ref } from "vue";
import type {
  DataType,
  OperationForm
} from "@elementspanel/epanel-plugin-console/types/fileManager";
import {
  addFolder as addFolderApi,
  touchFile as touchFileApi,
  copyFile as copyFileApi,
  moveFile as moveFileApi,
  deleteFile as deleteFileApi
} from "../api";
import type { OpenFileDialog } from "../types";
import type { useFileDialogs } from "./useFileDialogs";

interface Options extends FileTarget {
  currentPath: Ref<string>;
  dataSource: Ref<DataType[] | undefined>;
  operationForm: Ref<OperationForm>;
  selectionData: Ref<DataType[] | undefined>;
  isMultiple: Ref<boolean | undefined>;
  clearSelected: () => void;
  openDialog: OpenFileDialog;
  deleteDialog: ReturnType<typeof useFileDialogs>["deleteDialog"];
  getFileList: (throwErr?: boolean, initPath?: string) => Promise<boolean>;
  isDisposed: () => boolean;
}

export function useFileOperations(options: Options) {
  const {
    instanceId,
    daemonId,
    currentPath,
    dataSource,
    operationForm,
    selectionData,
    isMultiple,
    clearSelected,
    openDialog,
    deleteDialog,
    getFileList,
    isDisposed
  } = options;

  const clipboard = ref<{
    type: "copy" | "move";
    value: string[];
  }>();

  const touchFile = async (dir?: boolean) => {
    clearSelected();
    const dirname = dir
      ? await openDialog(
          t("TXT_CODE_COMMON_NEW_DIR"),
          t("TXT_CODE_COMMON_PLEASE_PROVIDE_DIRECTORY_NAME")
        )
      : await openDialog(
          t("TXT_CODE_COMMON_NEW_FILE"),
          t("TXT_CODE_COMMON_PLEASE_PROVIDE_FILE_NAME")
        );
    if (dirname === undefined) return;
    const execute = dir ? addFolderApi().execute : touchFileApi().execute;

    try {
      await execute({
        params: {
          uuid: instanceId || "",
          daemonId: daemonId || ""
        },
        data: {
          target: currentPath.value + dirname
        }
      });
      await getFileList();
      message.success(t("TXT_CODE_COMMON_CREATE_SUCCESS"));
    } catch (error: any) {
      return reportErrorMsg(error.message);
    }
  };

  const setClipBoard = (type: "copy" | "move", file?: string) => {
    if (file) {
      clipboard.value = {
        type,
        value: [currentPath.value + file]
      };
    } else {
      if (!selectionData.value || selectionData.value.length === 0)
        return reportErrorMsg(t("TXT_CODE_COMMON_PLEASE_SELECT_A_FILE_FIRST"));
      clipboard.value = {
        type,
        value: selectionData.value?.map((e) => currentPath.value + e.name)
      };
    }
    message.success(t("TXT_CODE_COMMON_SAVED_TO_CLIPBOARD"));
    clearSelected();
  };

  const paste = async () => {
    if (!clipboard?.value?.type || !clipboard.value.value)
      return reportErrorMsg(t("TXT_CODE_COMMON_PLEASE_SELECT_A_FILE_FIRST"));
    const execute = clipboard.value.type == "copy" ? copyFileApi().execute : moveFileApi().execute;
    try {
      await execute({
        params: {
          uuid: instanceId || "",
          daemonId: daemonId || ""
        },
        data: {
          targets: clipboard.value.value.map((e) => [
            e,
            currentPath.value + e.split("/")[e.split("/").length - 1]
          ])
        }
      });
      await getFileList();
      message.success(t("TXT_CODE_COMMON_FILE_OPERATION_STARTED_IT_MAY_TAKE_SOME_TIME"));
      clearSelected();
      clipboard.value.value = [];
    } catch (error: any) {
      reportErrorMsg(error.message);
    }
  };

  const resetName = async (file: string) => {
    const newname = await openDialog(
      t("TXT_CODE_COMMON_RENAME"),
      t("TXT_CODE_COMMON_PLEASE_ENTER_A_NEW_NAME"),
      file
    );
    if (newname === undefined) return;
    try {
      const { execute } = moveFileApi();
      await execute({
        params: {
          uuid: instanceId || "",
          daemonId: daemonId || ""
        },
        data: {
          targets: [[currentPath.value + file, currentPath.value + newname]]
        }
      });
      message.success(t("TXT_CODE_COMMON_RENAME_SUCCESSFUL"));
      await getFileList();
    } catch (error: any) {
      reportErrorMsg(error.message);
    }
  };

  const deleteFile = async (file?: string) => {
    if (isDisposed() || deleteDialog.value.show || deleteDialog.value.loading) return;

    let files: string[];
    if (isMultiple.value) {
      files = selectionData.value?.map((item) => currentPath.value + item.name) ?? [];
    } else if (file) {
      files = [currentPath.value + file];
    } else {
      files = selectionData.value?.map((item) => currentPath.value + item.name) ?? [];
    }
    if (files.length === 0) return reportErrorMsg(t("TXT_CODE_COMMON_PLEASE_SELECT_A_FILE_FIRST"));

    deleteDialog.value.file = file;
    deleteDialog.value.show = true;
    const confirmed = await new Promise<boolean>((resolve) => {
      const finish = (value: boolean) => {
        if (deleteDialog.value.resolve !== finish) return;
        deleteDialog.value.resolve = null;
        deleteDialog.value.show = false;
        resolve(value);
      };
      deleteDialog.value.resolve = finish;
    });
    if (!confirmed || isDisposed()) return;

    deleteDialog.value.loading = true;
    const { execute } = deleteFileApi();
    try {
      await execute({
        params: {
          uuid: instanceId || "",
          daemonId: daemonId || ""
        },
        data: {
          targets: files
        }
      });
      await getFileList();
      message.success(t("TXT_CODE_COMMON_FILE_DELETION_STARTED_IT_MAY_TAKE_SOME_TIME"));
      if (dataSource?.value?.length === 0 && operationForm.value.current > 1) {
        operationForm.value.current -= 1;
        await getFileList();
      }
    } catch (error: any) {
      reportErrorMsg(error.message);
    } finally {
      deleteDialog.value.loading = false;
    }
  };

  return { clipboard, touchFile, setClipBoard, paste, resetName, deleteFile };
}
