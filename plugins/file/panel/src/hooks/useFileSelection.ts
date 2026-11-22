import { computed, ref } from "vue";
import type { DataType } from "@elementspanel/epanel-plugin-console/types/fileManager";
import type { Key } from "../types";

export function useFileSelection() {
  const selectedRowKeys = ref<Key[]>([]);
  const selectionData = ref<DataType[]>();
  const isMultiple = computed(() => selectionData.value && selectionData.value.length > 1);
  const selectChanged = (_selectedRowKeys: Key[], selectedRows: DataType[]) => {
    selectionData.value = selectedRows;
    selectedRowKeys.value = _selectedRowKeys;
  };

  const pushSelected = (key: Key, row: DataType) => {
    const index = selectedRowKeys.value.indexOf(key);
    if (index > -1) return;
    selectionData.value?.push(row);
    selectedRowKeys.value.push(key);
  };

  const oneSelected = (key: Key, row: DataType) => {
    const index = selectedRowKeys.value.indexOf(key);
    if (index > -1) return;
    selectionData.value = [row];
    selectedRowKeys.value = [key];
  };

  const clearSelected = () => {
    selectionData.value = [];
    selectedRowKeys.value = [];
  };
  return {
    selectedRowKeys,
    selectionData,
    isMultiple,
    selectChanged,
    pushSelected,
    oneSelected,
    clearSelected
  };
}
