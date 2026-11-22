import type { ComputedRef, Ref } from "vue";

export type Key = string | number;
export interface FileTarget {
  instanceId: string;
  daemonId: string;
}
export interface FileTab {
  name: string;
  path: string;
  closable: boolean;
  key: string;
  pushedTime: number;
}
export interface FileTabsMap {
  [key: string]: FileTab[];
}
export interface FileTabState {
  tabList: Ref<FileTabsMap>;
  currentTabKey: string;
  currentTabs: ComputedRef<FileTab[]>;
  activeTab: Ref<string>;
  ensureActiveTab: (path?: string) => FileTab;
}
export type OpenFileDialog = (
  title: string,
  info: string,
  defaultValue?: string,
  mode?: string,
  style?: object
) => Promise<string | undefined>;
export interface OverwriteDialogResult {
  confirmed: boolean;
  all: boolean;
  overwrite: boolean;
}
export type OverwriteDialogHandler = (params: {
  count: number;
  fileName: string;
}) => Promise<OverwriteDialogResult>;
