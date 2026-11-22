import { t } from "@elementspanel/epanel-plugin-i18n";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import type { FileTarget } from "../types";
import { createVNode, ref, type Ref } from "vue";
import { Modal } from "@elementspanel/epanel-plugin-console/tools/vuetifyModal";
import { parseForwardAddress } from "@elementspanel/epanel-plugin-console/tools/protocol";
import type {
  DataType,
  DownloadFileConfigItem
} from "@elementspanel/epanel-plugin-console/types/fileManager";
import OverwriteFilesPopUpContent from "../components/OverwriteFilesPopUpContent.vue";
import { uploadAddress, downloadAddress, downloadFromUrl as downloadFromUrlAPI } from "../api";
import uploadService from "../services/uploadService";
import { getFileConfigAddr } from "../tools/fileAddress";
import type { OverwriteDialogResult, OverwriteDialogHandler } from "../types";

interface Options extends FileTarget {
  currentPath: Ref<string>;
  dataSource: Ref<DataType[] | undefined>;
  getFileList: (throwErr?: boolean, initPath?: string) => Promise<boolean>;
  isDisposed: () => boolean;
}

export function useFileTransfers(options: Options) {
  const { instanceId, daemonId, currentPath, dataSource, getFileList, isDisposed } = options;

  const selectedFiles = async (
    files: File[],
    overridePath?: string,
    overwriteDialogHandler?: OverwriteDialogHandler
  ) => {
    if (isDisposed()) return;
    const { state: missionCfg, execute: getUploadMissionCfg } = uploadAddress();
    const fileSet = new Set(files.map((f) => ({ file: f, overwrite: false })));
    const existingFiles: typeof fileSet = new Set();

    for (const f of fileSet) {
      if (dataSource.value?.find((dataType) => dataType.name === f.file.name)) {
        existingFiles.add(f);
      }
    }

    for (const f of existingFiles) {
      let confirmResult: OverwriteDialogResult;

      if (overwriteDialogHandler) {
        confirmResult = await overwriteDialogHandler({
          count: existingFiles.size,
          fileName: f.file.name
        });
      } else {
        confirmResult = await new Promise<OverwriteDialogResult>((resolve) => {
          const allRef = ref(false);
          const overwriteRef = ref(false);
          Modal.confirm({
            title: t("TXT_CODE_COMMON_OVERWRITING_FILE"),
            content: createVNode(
              OverwriteFilesPopUpContent,
              {
                count: existingFiles.size,
                fileName: f.file.name,
                all: allRef,
                overwrite: overwriteRef,
                "onUpdate:all": (val: boolean) => (allRef.value = val),
                "onUpdate:overwrite": (val: boolean) => (overwriteRef.value = val)
              },
              null
            ),
            okText: t("TXT_CODE_COMMON_UPLOAD"),
            cancelText: t("TXT_CODE_COMMON_SKIP"),
            onOk() {
              resolve({
                confirmed: true,
                all: allRef.value,
                overwrite: overwriteRef.value
              });
            },
            onCancel() {
              resolve({
                confirmed: false,
                all: allRef.value,
                overwrite: overwriteRef.value
              });
            }
          });
        });
      }

      if (isDisposed()) return;
      if (confirmResult.confirmed) {
        if (confirmResult.all) {
          for (const ef of existingFiles) {
            ef.overwrite = confirmResult.overwrite;
          }
          break;
        }
        f.overwrite = confirmResult.overwrite;
        existingFiles.delete(f);
      } else {
        if (confirmResult.all) {
          for (const ef of existingFiles) {
            fileSet.delete(ef);
          }
          break;
        }
        existingFiles.delete(f);
        fileSet.delete(f);
      }
    }

    for (const f of fileSet) {
      if (isDisposed()) return;
      try {
        await getUploadMissionCfg({
          params: {
            upload_dir: overridePath || currentPath.value,
            daemonId: daemonId!,
            uuid: instanceId!,
            file_name: f.file.name
          }
        });
        if (isDisposed()) return;
        if (!missionCfg.value) throw new Error(t("TXT_CODE_COMMON_FAILED_TO_GET_UPLOAD_ADDRESS"));

        const addr = parseForwardAddress(getFileConfigAddr(missionCfg.value), "http");
        uploadService.append(
          f.file,
          addr,
          missionCfg.value.password,
          {
            overwrite: f.overwrite
          },
          (task) => {
            task.instanceInfo = {
              instanceId: instanceId || "",
              daemonId: daemonId || ""
            };
          }
        );
      } catch (err: any) {
        console.error(err);
        return reportErrorMsg(err.response?.data || err.message);
      }
    }
  };

  const getFileLink = async (fileName: string, frontDir?: string) => {
    frontDir = frontDir || currentPath.value;
    const { state: downloadCfg, execute: getDownloadCfg } = downloadAddress();

    try {
      await getDownloadCfg({
        params: {
          file_name: frontDir + fileName,
          daemonId: daemonId || "",
          uuid: instanceId || ""
        }
      });
      if (!downloadCfg.value) return null;
      const addr = parseForwardAddress(getFileConfigAddr(downloadCfg.value), "http");
      const path = `/download/${encodeURIComponent(
        downloadCfg.value.password
      )}/${encodeURIComponent(fileName)}`;
      return addr + path;
    } catch (err: any) {
      console.error(err);
      return reportErrorMsg(err.message);
    }
  };

  const downloadFromUrl = async (
    downloadConfig: DownloadFileConfigItem,
    _showLoadingDialog = true
  ) => {
    if (!downloadConfig.url) throw new Error(t("TXT_CODE_FILE_DOWNLOAD_URL_REQUIRED"));
    if (!downloadConfig.fileName) throw new Error(t("TXT_CODE_FILE_DOWNLOAD_NAME_REQUIRED"));

    const { execute } = downloadFromUrlAPI();
    message.info(t("TXT_CODE_TASKS_SUBMITTED"));
    try {
      await execute({
        params: {
          uuid: instanceId || "",
          daemonId: daemonId || ""
        },
        data: {
          url: downloadConfig.url,
          file_name: currentPath.value + downloadConfig.fileName
        }
      });
      message.success(t("TXT_CODE_COMMON_TASK_COMPLETED"));
      await getFileList();
    } catch (error: any) {
      message.error(t("TXT_CODE_COMMON_DOWNLOAD_FAILED"));
      reportErrorMsg(error.message);
    }
  };

  const downloadFile = async (fileName: string) => {
    const link = await getFileLink(fileName);
    if (!link) throw new Error(t("TXT_CODE_COMMON_FAILED_TO_GET_DOWNLOAD_ADDRESS"));
    window.open(link);
  };

  return { selectedFiles, getFileLink, downloadFromUrl, downloadFile };
}
