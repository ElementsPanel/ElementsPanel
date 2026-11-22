import { useImageViewerDialog } from "../dialogs";
import type { DataType } from "@elementspanel/epanel-plugin-console/types/fileManager";
import { useFileSelection } from "./useFileSelection";
import { useFileBrowser } from "./useFileBrowser";
import { useFileTabs } from "./useFileTabs";
import { useFileDialogs } from "./useFileDialogs";
import { useFileOperations } from "./useFileOperations";
import { useFileArchives } from "./useFileArchives";
import { useFileTransfers } from "./useFileTransfers";
import { useFilePermissions } from "./useFilePermissions";

export { getFileConfigAddr } from "../tools/fileAddress";

export const useFileManager = (instanceId = "", daemonId = "", sessionId = "") => {
  const target = { instanceId, daemonId };
  const selection = useFileSelection();
  const {
    selectedRowKeys,
    selectionData,
    isMultiple,
    selectChanged,
    pushSelected,
    oneSelected,
    clearSelected
  } = selection;
  const browser = useFileBrowser({ ...target, selection, getTabs: () => tabs });
  const {
    dataSource,
    fileStatus,
    currentDisk,
    operationForm,
    breadcrumbs,
    currentPath,
    spinning,
    updateBreadcrumbs,
    getFileList,
    reloadList,
    rowClickTable,
    handleChangeDir,
    handleTableChange,
    handleSearchChange,
    getFileStatus,
    toDisk,
    invalidateList,
    isDisposed
  } = browser;
  const tabs = useFileTabs({
    ...target,
    sessionId,
    dataSource,
    currentDisk,
    currentPath,
    operationForm,
    spinning,
    updateBreadcrumbs,
    getFileList,
    invalidateList,
    clearSelected
  });
  const {
    tabList,
    currentTabKey,
    currentTabs,
    activeTab,
    onEditTabs,
    handleReorderTabs,
    handleChangeTab
  } = tabs;
  const { dialog, deleteDialog, openDialog } = useFileDialogs();
  const { clipboard, touchFile, setClipBoard, paste, resetName, deleteFile } = useFileOperations({
    ...target,
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
  });
  const { archivePreview, previewArchiveFile, closeArchivePreview, zipFile, unzipFile } =
    useFileArchives({ ...target, currentPath, selectionData, openDialog, dialog, getFileList });
  const { selectedFiles, getFileLink, downloadFromUrl, downloadFile } = useFileTransfers({
    ...target,
    currentPath,
    dataSource,
    getFileList,
    isDisposed
  });
  const { permission, changePermission } = useFilePermissions({
    ...target,
    currentPath,
    selectionData,
    isMultiple,
    openDialog,
    getFileList
  });
  const isImage = (extName: string) => {
    if (!extName) return;
    return ["JPG", "JPEG", "PNG", "GIF", "BMP", "WEBP", "ICO"].includes(extName.toUpperCase());
  };

  const showImage = (file: DataType) => {
    useImageViewerDialog(instanceId || "", daemonId || "", file.name, currentPath.value);
  };

  return {
    fileStatus,
    dialog,
    spinning,
    operationForm,
    dataSource,
    breadcrumbs,
    currentPath,
    permission,
    clipboard,
    selectedRowKeys,
    currentDisk,
    selectionData,
    selectChanged,
    isMultiple,
    tabList,
    currentTabKey,
    currentTabs,
    activeTab,
    onEditTabs,
    handleReorderTabs,
    handleChangeTab,
    openDialog,
    getFileList,
    touchFile,
    reloadList,
    setClipBoard,
    paste,
    resetName,
    deleteFile,
    deleteDialog,
    zipFile,
    unzipFile,
    selectedFiles,
    rowClickTable,
    downloadFile,
    getFileLink,
    downloadFromUrl,
    handleChangeDir,
    handleTableChange,
    handleSearchChange,
    getFileStatus,
    changePermission,
    toDisk,
    pushSelected,
    oneSelected,
    isImage,
    showImage,
    archivePreview,
    previewArchiveFile,
    closeArchivePreview
  };
};
