import { computed, onMounted, ref, type Ref } from "vue";
import { useLocalStorage } from "@vueuse/core";
import { v4 } from "uuid";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { message } from "@elementspanel/epanel-plugin-console/tools/vuetifyToast";
import type {
  DataType,
  OperationForm
} from "@elementspanel/epanel-plugin-console/types/fileManager";
import type { FileTarget, Key, FileTab as TabItem, FileTabsMap as TabsMap } from "../types";

const TAB_LIST_KEY = "FileManagerTabMap";

interface Options extends FileTarget {
  sessionId: string;
  dataSource: Ref<DataType[] | undefined>;
  currentDisk: Ref<string>;
  currentPath: Ref<string>;
  operationForm: Ref<OperationForm>;
  spinning: Ref<boolean>;
  updateBreadcrumbs: (path: string) => void;
  getFileList: (throwErr?: boolean, initPath?: string) => Promise<boolean>;
  invalidateList: () => void;
  clearSelected: () => void;
}

export function useFileTabs(options: Options) {
  const {
    instanceId,
    daemonId,
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
  } = options;

  const tabList = useLocalStorage<TabsMap>(TAB_LIST_KEY, {});
  const currentTabKey = instanceId + daemonId + sessionId;
  const currentTabs = computed(() => tabList.value[currentTabKey] ?? []);
  const activeTab = ref<string>("");

  const removeDuplicateDefaultTabs = (tabs: TabItem[]) => {
    let hasDefaultTab = false;
    return tabs.filter((tab) => {
      if (tab.closable) return true;
      if (hasDefaultTab) return false;
      hasDefaultTab = true;
      return true;
    });
  };

  const normalizeTabs = (key: string) => {
    const tabs = tabList.value[key];
    if (!tabs?.length) return;

    const normalizedTabs = removeDuplicateDefaultTabs(tabs);
    if (normalizedTabs.length !== tabs.length) {
      tabList.value[key] = normalizedTabs;
    }
  };

  const ensureActiveTab = (path = "/") => {
    tabList.value[currentTabKey] ||= [];
    normalizeTabs(currentTabKey);

    const tabs = currentTabs.value;
    let tab = tabs.find((item) => item.key === activeTab.value);
    if (!tab) {
      tab = tabs[0];
    }
    if (!tab) {
      tab = {
        key: v4(),
        path,
        name: path,
        pushedTime: 0,
        closable: false
      };
      tabs.push(tab);
    }

    activeTab.value = tab.key;
    return tab;
  };

  normalizeTabs(currentTabKey);

  onMounted(() => {
    const oneDayInMs = 1000 * 60 * 60 * 24;
    const now = Date.now();

    Object.keys(tabList.value).forEach((key) => {
      const tabs = tabList.value[key];
      if (tabs && tabs.length > 0) {
        tabList.value[key] = removeDuplicateDefaultTabs(tabs).filter((tab) => {
          if (!tab.pushedTime) return true;
          return now - tab.pushedTime < oneDayInMs;
        });

        if (tabList.value[key].length === 0) {
          delete tabList.value[key];
        }
      }
    });
  });

  const handleRemoveTab = (key: string) => {
    const index = currentTabs.value.findIndex((tab) => tab.key === key);
    if (index !== -1) {
      currentTabs.value.splice(index, 1);
      if (!currentTabs.value.length) {
        // Invalidate pending requests before publishing the empty workspace.
        invalidateList();
        activeTab.value = "";
        dataSource.value = [];
        clearSelected();
        operationForm.value.name = "";
        operationForm.value.current = 1;
        operationForm.value.total = 0;
        spinning.value = false;
        updateBreadcrumbs("/");
        return;
      }

      if (activeTab.value === key) {
        const prevIndex = index > 0 ? index - 1 : currentTabs.value.length - 1;
        const nextKey = currentTabs.value[prevIndex]?.key || "";
        activeTab.value = nextKey;
        handleChangeTab(nextKey);
      }
    }
  };

  const onEditTabs = (targetKey: MouseEvent | Key | KeyboardEvent, action: "remove" | "add") => {
    if (action === "add") {
      if (currentTabs.value.length >= 10) {
        message.warning(
          t(
            "TXT_CODE_COMMON_YOU_CAN_OPEN_A_MAXIMUM_OF_10_TABS_AT_THE_SAME_TIME_PLEASE_CLOSE_OTHER_TABS"
          )
        );
        return;
      }
      const path = "/";
      const key = v4();
      tabList.value[currentTabKey] ||= [];
      currentTabs.value.push({
        name: path,
        path,
        closable: true,
        key,
        pushedTime: Date.now()
      });
      activeTab.value = key;
      currentDisk.value = "";
      handleChangeTab(key);
    } else {
      handleRemoveTab(targetKey as string);
    }
  };

  const handleReorderTabs = (keys: string[]) => {
    const tabs = currentTabs.value;
    if (keys.length !== tabs.length || new Set(keys).size !== tabs.length) return;
    const byKey = new Map(tabs.map((tab) => [tab.key, tab]));
    const reordered: TabItem[] = [];
    for (const key of keys) {
      const tab = byKey.get(key);
      if (!tab) return;
      reordered.push(tab);
    }
    tabs.splice(0, tabs.length, ...reordered);
  };

  const handleChangeTab = async (key: string) => {
    const tab = currentTabs.value.find((tab) => tab.key === key);
    if (!tab) return;
    const path = tab.path || "/";
    activeTab.value = key;
    updateBreadcrumbs(path);

    operationForm.value.name = "";
    operationForm.value.current = 1;
    await getFileList();
  };

  return {
    tabList,
    currentTabKey,
    currentTabs,
    activeTab,
    ensureActiveTab,
    onEditTabs,
    handleReorderTabs,
    handleChangeTab
  };
}
