import { computed, onMounted, onUnmounted, ref } from "vue";
import type { DataType } from "@elementspanel/epanel-plugin-console/types/fileManager";
import type { useFileManager } from "./useFileManager";

type Manager = Pick<
  ReturnType<typeof useFileManager>,
  | "selectedRowKeys"
  | "selectionData"
  | "dataSource"
  | "currentTabs"
  | "setClipBoard"
  | "paste"
  | "deleteDialog"
  | "deleteFile"
>;

export function useDesktopFileSelection(manager: Manager) {
  const {
    selectedRowKeys,
    selectionData,
    dataSource,
    currentTabs,
    setClipBoard,
    paste,
    deleteDialog,
    deleteFile
  } = manager;
  const onDesktopSelectionChange = (keys: unknown[]) => {
    const normalized = (keys as string[]).map(String);
    selectedRowKeys.value = normalized;
    selectionData.value = (dataSource.value || []).filter((item) => normalized.includes(item.name));
  };

  const lastClickedIndex = ref(-1);

  const handleRowClick = (e: MouseEvent, record: DataType) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('input[type="checkbox"]') ||
      target.closest(".v-btn") ||
      target.closest(".v-menu") ||
      target.closest(".v-input")
    ) {
      return;
    }

    const key = record.name;
    const index = dataSource.value?.findIndex((d) => d.name === key) ?? -1;

    if (e.ctrlKey || e.metaKey) {
      const existingIdx = selectedRowKeys.value.indexOf(key);
      if (existingIdx > -1) {
        selectedRowKeys.value = selectedRowKeys.value.filter((k) => k !== key);
        if (selectionData.value) {
          selectionData.value = selectionData.value.filter((d) => d.name !== key);
        }
      } else {
        selectedRowKeys.value = [...selectedRowKeys.value, key];
        if (selectionData.value) {
          selectionData.value = [...selectionData.value, record];
        } else {
          selectionData.value = [record];
        }
      }
      lastClickedIndex.value = index;
      return;
    }

    if (e.shiftKey) {
      if (lastClickedIndex.value > -1 && dataSource.value) {
        const start = Math.min(lastClickedIndex.value, index);
        const end = Math.max(lastClickedIndex.value, index);
        const rangeKeys: string[] = [];
        const rangeRows: DataType[] = [];
        for (let i = start; i <= end; i++) {
          const row = dataSource.value[i];
          if (row) {
            rangeKeys.push(row.name);
            rangeRows.push(row);
          }
        }
        selectedRowKeys.value = rangeKeys;
        selectionData.value = rangeRows;
      } else {
        selectedRowKeys.value = [key];
        selectionData.value = [record];
        lastClickedIndex.value = index;
      }
      return;
    }

    selectedRowKeys.value = [key];
    selectionData.value = [record];
    lastClickedIndex.value = index;
    const rowEl = (e.currentTarget as HTMLElement)?.closest("tr");
    if (rowEl) {
      if (!rowEl.hasAttribute("tabindex")) {
        rowEl.setAttribute("tabindex", "-1");
      }
      rowEl.focus({ preventScroll: true });
    }
  };

  let lastShortcutKey = "";
  let lastShortcutTime = 0;
  const SHORTCUT_DEBOUNCE_MS = 200;

  const dfmRootRef = ref<HTMLElement | null>(null);
  const isDragSelecting = ref(false);
  const isDragAdditive = ref(false);
  const dragSelectStart = ref({ x: 0, y: 0 });
  const dragSelectRect = ref({ x: 0, y: 0, w: 0, h: 0 });
  const dragSelectVisible = ref(false);

  const dataSourceMap = computed(() => {
    const map = new Map<string, DataType>();
    if (dataSource.value) {
      for (const item of dataSource.value) {
        map.set(item.name, item);
      }
    }
    return map;
  });

  const getTableBodyEl = (): HTMLElement | null => {
    if (!dfmRootRef.value) return null;
    return dfmRootRef.value.querySelector(".dfm-table tbody");
  };

  const getRowEls = (): NodeListOf<HTMLElement> => {
    if (!dfmRootRef.value) return document.querySelectorAll("");
    return dfmRootRef.value.querySelectorAll(".dfm-table tbody tr");
  };

  const getRowDataKey = (rowEl: HTMLElement): string | null => {
    return rowEl.getAttribute("data-row-key");
  };

  const getTableWrapperEl = (): HTMLElement | null => {
    if (!dfmRootRef.value) return null;
    return dfmRootRef.value.querySelector(".dfm-table-wrapper");
  };

  const onTableMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (e.shiftKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    if (
      target.closest('input[type="checkbox"]') ||
      target.closest(".v-btn") ||
      target.closest(".v-menu") ||
      target.closest(".v-input") ||
      target.closest(".v-pagination") ||
      target.closest(".v-tabs") ||
      target.closest(".file-path-bar") ||
      target.closest(".dfm-toolbar") ||
      target.closest(".dfm-upload-progress")
    ) {
      return;
    }

    const tableBody = getTableBodyEl();
    if (!tableBody || !tableBody.contains(target)) return;

    const wrapper = getTableWrapperEl();
    if (!wrapper) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    isDragSelecting.value = true;
    isDragAdditive.value = e.ctrlKey;
    dragSelectStart.value = { x: e.clientX, y: e.clientY };
    dragSelectRect.value = {
      x: e.clientX - wrapperRect.left,
      y: e.clientY - wrapperRect.top,
      w: 0,
      h: 0
    };
    dragSelectVisible.value = true;

    if (!isDragAdditive.value) {
      selectedRowKeys.value = [];
      selectionData.value = [];
    }

    if (dfmRootRef.value) {
      if (!dfmRootRef.value.hasAttribute("tabindex")) {
        dfmRootRef.value.setAttribute("tabindex", "-1");
      }
      dfmRootRef.value.focus({ preventScroll: true });
    }

    e.preventDefault();
    e.stopPropagation();
  };

  let dragSelectRafId: number | null = null;

  const onTableMouseMove = (e: MouseEvent) => {
    if (!isDragSelecting.value) return;

    if (dragSelectRafId !== null) {
      cancelAnimationFrame(dragSelectRafId);
    }

    dragSelectRafId = requestAnimationFrame(() => {
      dragSelectRafId = null;
      performDragSelection(e);
    });
  };

  const performDragSelection = (e: MouseEvent) => {
    if (!isDragSelecting.value) return;

    const wrapper = getTableWrapperEl();
    if (!wrapper) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const currentX = e.clientX - wrapperRect.left;
    const currentY = e.clientY - wrapperRect.top;

    const startX = dragSelectStart.value.x - wrapperRect.left;
    const startY = dragSelectStart.value.y - wrapperRect.top;

    dragSelectRect.value = {
      x: Math.min(startX, currentX),
      y: Math.min(startY, currentY),
      w: Math.abs(currentX - startX),
      h: Math.abs(currentY - startY)
    };

    const selRect = {
      left: dragSelectRect.value.x,
      top: dragSelectRect.value.y,
      right: dragSelectRect.value.x + dragSelectRect.value.w,
      bottom: dragSelectRect.value.y + dragSelectRect.value.h
    };

    const rows = getRowEls();
    const newlySelected: string[] = [];
    const newlySelectedRows: DataType[] = [];
    const map = dataSourceMap.value;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowRect = row.getBoundingClientRect();
      const rowRelTop = rowRect.top - wrapperRect.top;
      const rowRelBottom = rowRect.bottom - wrapperRect.top;

      if (rowRelBottom > selRect.top && rowRelTop < selRect.bottom) {
        const key = getRowDataKey(row);
        if (key) {
          const found = map.get(key);
          if (found) {
            newlySelected.push(key);
            newlySelectedRows.push(found);
          }
        }
      }
    }

    if (isDragAdditive.value) {
      const existingKeys = selectedRowKeys.value;
      const existingRows = selectionData.value ?? [];
      const mergedKeys = [...existingKeys];
      const mergedRows = [...existingRows];
      for (let i = 0; i < newlySelected.length; i++) {
        if (!existingKeys.includes(newlySelected[i])) {
          mergedKeys.push(newlySelected[i]);
          mergedRows.push(newlySelectedRows[i]);
        }
      }
      if (mergedKeys.length !== existingKeys.length) {
        selectedRowKeys.value = mergedKeys;
        selectionData.value = mergedRows;
      }
    } else {
      const prevSelected = selectedRowKeys.value;
      if (
        prevSelected.length !== newlySelected.length ||
        prevSelected.some((k, i) => k !== newlySelected[i])
      ) {
        selectedRowKeys.value = newlySelected;
        selectionData.value = newlySelectedRows;
      }
    }
  };

  const finishDragSelection = (restoreFocus = true) => {
    if (isDragSelecting.value) {
      isDragSelecting.value = false;
      isDragAdditive.value = false;
      dragSelectVisible.value = false;
      if (dragSelectRafId !== null) {
        cancelAnimationFrame(dragSelectRafId);
        dragSelectRafId = null;
      }
      if (restoreFocus && dfmRootRef.value) {
        if (!dfmRootRef.value.hasAttribute("tabindex")) {
          dfmRootRef.value.setAttribute("tabindex", "-1");
        }
        dfmRootRef.value.focus({ preventScroll: true });
      }
    }
  };

  const onTableMouseUp = () => finishDragSelection();

  const handleWindowBlur = () => finishDragSelection(false);

  const handleKeyboardShortcut = (e: KeyboardEvent) => {
    if (!currentTabs.value.length) return;
    if (dfmRootRef.value && !dfmRootRef.value.contains(e.target as Node)) {
      return;
    }

    const shortcutSig = `${e.ctrlKey || e.metaKey ? "M" : ""}${e.shiftKey ? "S" : ""}${
      e.altKey ? "A" : ""
    }:${e.key}`;
    const now = Date.now();
    if (shortcutSig === lastShortcutKey && now - lastShortcutTime < SHORTCUT_DEBOUNCE_MS) {
      return;
    }
    lastShortcutKey = shortcutSig;
    lastShortcutTime = now;

    const target = e.target as HTMLElement;
    const tag = target?.tagName;
    const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    const isContentEditable = target?.isContentEditable;

    const isTableCheckbox =
      isInput &&
      tag === "INPUT" &&
      (target as HTMLInputElement)?.type === "checkbox" &&
      target.closest(".dfm .dfm-table");
    if (isInput && !isTableCheckbox) return;
    if (isContentEditable && !isTableCheckbox) return;

    const isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl && e.key === "c") {
      e.preventDefault();
      if (!selectionData.value || selectionData.value.length === 0) return;
      setClipBoard("copy");
      return;
    }

    if (isCtrl && e.key === "x") {
      e.preventDefault();
      if (!selectionData.value || selectionData.value.length === 0) return;
      setClipBoard("move");
      return;
    }

    if (isCtrl && e.key === "v") {
      e.preventDefault();
      paste();
      return;
    }

    if (isCtrl && e.key === "a") {
      e.preventDefault();
      if (!dataSource.value || dataSource.value.length === 0) return;
      const allKeys = dataSource.value.map((d) => d.name);
      const allRows = [...dataSource.value];
      selectedRowKeys.value = allKeys;
      selectionData.value = allRows;
      return;
    }

    if (e.key === "Delete" || e.key === "Del") {
      e.preventDefault();
      if (e.repeat || deleteDialog.value.show || deleteDialog.value.loading) return;
      if (!selectionData.value || selectionData.value.length === 0) return;
      finishDragSelection(false);
      const file = selectionData.value.length === 1 ? selectionData.value[0].name : undefined;
      void deleteFile(file);
      return;
    }
  };

  const bindSelectionEvents = () => {
    document.addEventListener("mousemove", onTableMouseMove);
    document.addEventListener("mouseup", onTableMouseUp);
    document.addEventListener("keydown", handleKeyboardShortcut);
  };
  onMounted(() => window.addEventListener("blur", handleWindowBlur));
  onUnmounted(() => {
    finishDragSelection(false);
    if (dragSelectRafId !== null) cancelAnimationFrame(dragSelectRafId);
    document.removeEventListener("mousemove", onTableMouseMove);
    document.removeEventListener("mouseup", onTableMouseUp);
    document.removeEventListener("keydown", handleKeyboardShortcut);
    window.removeEventListener("blur", handleWindowBlur);
  });
  return {
    onDesktopSelectionChange,
    lastClickedIndex,
    handleRowClick,
    SHORTCUT_DEBOUNCE_MS,
    dfmRootRef,
    isDragSelecting,
    isDragAdditive,
    dragSelectStart,
    dragSelectRect,
    dragSelectVisible,
    dataSourceMap,
    getTableBodyEl,
    getRowEls,
    getRowDataKey,
    getTableWrapperEl,
    onTableMouseDown,
    onTableMouseMove,
    performDragSelection,
    finishDragSelection,
    onTableMouseUp,
    handleWindowBlur,
    handleKeyboardShortcut,
    bindSelectionEvents
  };
}
