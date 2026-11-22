import { t } from "@elementspanel/epanel-plugin-i18n";
import { reportErrorMsg } from "@elementspanel/epanel-plugin-console/tools/validator";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import type { FileTarget } from "../types";
import { computed, onUnmounted, reactive, ref } from "vue";
import { removeTrail } from "@elementspanel/epanel-plugin-console/tools/string";
import type {
  DataType,
  FileStatus,
  OperationForm,
  Breadcrumb
} from "@elementspanel/epanel-plugin-console/types/fileManager";
import { fileList as getFileListApi, getFileStatus as getFileStatusApi } from "../api";
import type { FileTabState } from "../types";
import type { useFileSelection } from "./useFileSelection";

interface Options extends FileTarget {
  getTabs: () => FileTabState;
  selection: ReturnType<typeof useFileSelection>;
}

export function useFileBrowser(options: Options) {
  const { instanceId, daemonId, getTabs, selection } = options;

  const { selectedRowKeys, selectionData, clearSelected } = selection;
  const dataSource = ref<DataType[]>();
  let fileListRequest = 0;
  let disposed = false;
  const fileStatus = ref<FileStatus>();
  const currentDisk = ref("");
  const operationForm = ref<OperationForm>({
    name: "",
    current: 1,
    pageSize: 100,
    total: 0
  });

  const breadcrumbs = reactive<Breadcrumb[]>([]);
  breadcrumbs.push({
    path: "/",
    name: "/",
    disabled: false
  });
  const currentPath = computed(
    () => removeTrail(breadcrumbs[breadcrumbs.length - 1].path, "/") + "/"
  );

  const spinning = ref(false);
  const updateBreadcrumbs = (path: string) => {
    const breadcrumbPaths = parsePath(path);
    breadcrumbs.length = 0;

    if (breadcrumbPaths[0] !== "/") {
      currentDisk.value = breadcrumbPaths[0].toUpperCase();
      breadcrumbPaths[0] = "/";
      breadcrumbPaths.forEach((p, index) => {
        breadcrumbs.push({
          path: `${currentDisk.value}:${p}`,
          name: index === 0 ? `${currentDisk.value}:` : getLastNameFromPath(p),
          disabled: false
        });
      });
    } else {
      currentDisk.value = "";
      breadcrumbPaths.forEach((p) => {
        breadcrumbs.push({
          path: p,
          name: getLastNameFromPath(p),
          disabled: false
        });
      });
    }
  };

  const parsePath = (path: string) => {
    if (!path) return ["/"];

    const normalizedPath = path.replace(/\\/g, "/");
    const driveMatch = normalizedPath.match(/^([a-zA-Z]):/);
    const driveLetter = driveMatch ? driveMatch[1] : "";
    const pathPart = driveLetter ? normalizedPath.slice(2) : normalizedPath;

    const parts = pathPart.split("/").filter(Boolean);
    const result = driveLetter ? [driveLetter] : ["/"];

    parts.forEach((_, index) => {
      const _currentPath = "/" + parts.slice(0, index + 1).join("/");
      result.push(index < parts.length - 1 ? _currentPath + "/" : _currentPath);
    });

    return result;
  };

  const getLastNameFromPath = (path: string) => {
    if (path === "/") return "/";
    const cleanPath = path.endsWith("/") ? path.slice(0, -1) : path;
    const parts = cleanPath.split("/").filter((part) => part !== "");
    return parts.length > 0 ? parts[parts.length - 1] : "/";
  };

  const getFileList = async (throwErr = false, initPath?: string) => {
    const { tabList, currentTabKey, currentTabs, activeTab, ensureActiveTab } = getTabs();
    // An explicitly empty saved tab list must not be reopened by background refreshes.
    if (disposed || tabList.value[currentTabKey]?.length === 0) return false;
    const request = ++fileListRequest;
    spinning.value = true;
    const { execute } = getFileListApi();
    let thisTab = currentTabs.value.find((e) => e.key === activeTab.value);
    if (!thisTab) {
      thisTab = ensureActiveTab(initPath ?? currentPath.value);
      if (!initPath && thisTab.path !== currentPath.value) {
        updateBreadcrumbs(thisTab.path);
      }
    }

    try {
      clearSelected();
      let path;
      if (initPath) {
        path = initPath;
        updateBreadcrumbs(initPath);
      } else {
        path = currentPath.value;
      }
      const res = await execute({
        params: {
          daemonId: daemonId || "",
          uuid: instanceId || "",
          page: operationForm.value.current - 1,
          page_size: operationForm.value.pageSize,
          file_name: operationForm.value.name,
          target: path
        }
      });
      if (request !== fileListRequest) return false;
      dataSource.value = res.value?.items || [];
      operationForm.value.total = res.value?.total || 0;
      const absolutePath = res.value?.absolutePath;
      const driveMatch = absolutePath?.match(/^([a-zA-Z]):[\\/]/);
      if (absolutePath && driveMatch) {
        currentDisk.value = driveMatch[1].toUpperCase();
        if (fileStatus.value?.platform === "win32" && fileStatus.value.isGlobalInstance) {
          updateBreadcrumbs(absolutePath);
          thisTab.path = currentPath.value;
          thisTab.name = breadcrumbs[breadcrumbs.length - 1].name;
        }
      }
      return true;
    } catch (error: any) {
      if (request !== fileListRequest) return false;
      if (throwErr) throw error;
      reportErrorMsg(error.message);
      return false;
    } finally {
      if (request === fileListRequest) spinning.value = false;
    }
  };

  const reloadList = async () => {
    if (await getFileList()) message.success(t("TXT_CODE_COMMON_FILE_LIST_REFRESHED"));
  };

  const rowClickTable = async (item: string, type: number) => {
    const { currentTabs, activeTab } = getTabs();
    if (type === 1) return;
    try {
      const target = currentPath.value + item;

      breadcrumbs.push({
        path: target,
        name: item,
        disabled: false
      });
      operationForm.value.name = "";
      operationForm.value.current = 1;
      if (!(await getFileList(true))) return;

      const thisTab = currentTabs.value.find((e) => e.key === activeTab.value);
      if (thisTab) {
        thisTab.path = target;
        thisTab.name = item;
        return;
      }
    } catch (error: any) {
      breadcrumbs.splice(breadcrumbs.length - 1, 1);
      return reportErrorMsg(error.message);
    }
  };

  const handleChangeDir = async (dir: string) => {
    const { currentTabs, activeTab } = getTabs();
    if (breadcrumbs.findIndex((e) => e.path === dir) === -1)
      return reportErrorMsg(t("TXT_CODE_COMMON_PATH_NOT_FOUND"));
    breadcrumbs.splice(breadcrumbs.findIndex((e) => e.path === dir) + 1);
    operationForm.value.name = "";
    operationForm.value.current = 1;
    if (!(await getFileList())) return;

    const thisTab = currentTabs.value.find((e) => e.key === activeTab.value);
    if (thisTab) {
      thisTab.path = dir;
      thisTab.name = getLastNameFromPath(dir);
      return;
    }
  };

  const handleTableChange = (e: { current: number; pageSize: number }) => {
    selectedRowKeys.value = [];
    selectionData.value = [];
    operationForm.value.current = e.current;
    operationForm.value.pageSize = e.pageSize;
    getFileList();
  };

  const handleSearchChange = () => {
    operationForm.value.current = 1;
    getFileList();
  };

  const getFileStatus = async () => {
    if (disposed) return;
    const { state, execute } = getFileStatusApi();
    try {
      await execute({
        params: {
          daemonId: daemonId || "",
          uuid: instanceId || ""
        }
      });
      if (!disposed && state.value) {
        fileStatus.value = state.value;
      }
    } catch (err: any) {
      if (disposed) return;
      console.error(err);
      return reportErrorMsg(err.message);
    }
  };

  const toDisk = async (disk: string) => {
    const { currentTabs, activeTab } = getTabs();
    if (!fileStatus.value?.disks.includes(disk)) return;
    const diskName = `${disk}:/`;
    updateBreadcrumbs(diskName);
    operationForm.value.name = "";
    operationForm.value.current = 1;
    const thisTab = currentTabs.value.find((e) => e.key === activeTab.value);
    if (thisTab) {
      thisTab.name = `${disk}:`;
      thisTab.path = diskName;
    }
    await getFileList();
  };

  const invalidateList = () => {
    fileListRequest++;
  };
  onUnmounted(() => {
    disposed = true;
    invalidateList();
  });

  return {
    dataSource,
    fileStatus,
    currentDisk,
    operationForm,
    breadcrumbs,
    currentPath,
    spinning,
    updateBreadcrumbs,
    getLastNameFromPath,
    getFileList,
    reloadList,
    rowClickTable,
    handleChangeDir,
    handleTableChange,
    handleSearchChange,
    getFileStatus,
    toDisk,
    invalidateList,
    isDisposed: () => disposed
  };
}
