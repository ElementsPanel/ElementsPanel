<script setup lang="ts">
import { useFileManager } from "../hooks/useFileManager";
import ArchivePreview from "@/components/ArchivePreview.vue";
import { t } from "@/lang/i18n";
import uploadService from "../services/uploadService";
import { filterFileName, getFileExtName, isCompressFile } from "../tools/fileManager";
import { convertFileSize } from "@/tools/fileSize";
import type { DataType } from "@/types/fileManager";
import dayjs from "dayjs";
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { notifyDesktopError } from "../../../desktop/src/desktopNotice";
import { VAlert, VBtn, VCard, VCardText, VCardTitle, VCheckbox, VDataTableServer, VDialog, VIcon, VList, VListItem, VMenu, VProgressCircular, VProgressLinear, VRadio, VRadioGroup, VSelect, VSpacer, VTabs, VTab, VTextField } from "vuetify/components";

/**
 * The shell Desktop mode mounts a component inside. `plugins/desktop` supplies it
 * through the core-owned registry, so this plugin never reaches into another
 * plugin's source tree for it.
 */
const desktopVuetifyMode = true;

const props = defineProps<{
    instanceId: string;
    daemonId: string;
    sessionId?: string;
}>();

const emit = defineEmits<{
    (e: "open-file-editor", filePath: string, fileName: string): void;
    (e: "open-image-viewer", filePath: string, fileName: string): void;
}>();

const {
    dialog,
    spinning,
    fileStatus,
    permission,
    selectedRowKeys,
    operationForm,
    dataSource,
    breadcrumbs,
    currentPath,
    clipboard,
    currentDisk,
    isMultiple,
    activeTab,
    currentTabs,
    onEditTabs,
    getFileList,
    touchFile,
    reloadList,
    setClipBoard,
    paste,
    resetName,
    deleteFile,
    zipFile,
    unzipFile,
    downloadFile,
    downloadFromUrl,
    handleChangeDir,
    handleSearchChange,
    selectedFiles,
    rowClickTable,
    handleTableChange,
    getFileStatus,
    changePermission,
    toDisk,
    oneSelected,
    isImage,
    selectionData,
    loadingWindow,
    archivePreview,
    previewArchiveFile,
    closeArchivePreview,
    deleteDialog
} = useFileManager(props.instanceId, props.daemonId, props.sessionId || "");

const isShowDiskList = computed(
    () =>
        fileStatus.value?.disks.length &&
        fileStatus.value?.platform === "win32" &&
        fileStatus.value?.isGlobalInstance
);

const desktopFileHeaders = computed(() => {
    const headers = [
        { title: t("TXT_CODE_94c193de"), key: "name", value: "name", sortable: false },
        { title: t("TXT_CODE_67d68dd1"), key: "type", value: "type", sortable: false },
        { title: t("TXT_CODE_94bb113a"), key: "size", value: "size", sortable: false },
        { title: t("TXT_CODE_d3b29478"), key: "time", value: "time", sortable: false }
    ];
    if (fileStatus.value?.platform !== "win32") {
        headers.push({ title: t("TXT_CODE_511aea70"), key: "mode", value: "mode", sortable: false });
    }
    if (!isMultiple.value) {
        headers.push({ title: t("TXT_CODE_fe731dfc"), key: "action", value: "action", sortable: false });
    }
    return headers;
});

const getDesktopFileIcon = (name: string, type: number) => {
    if (type === 0) return "mdi-folder-outline";
    const ext = getFileExtName(name);
    if (["zip", "tar", "gz", "bz2", "xz", "7z", "rar", "iso", "cab"].includes(ext)) return "mdi-archive-outline";
    if (["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico"].includes(ext)) return "mdi-file-image-outline";
    if (["mp3", "wav", "ogg", "flac", "aac", "mp4", "mov", "avi", "mkv"].includes(ext)) return "mdi-file-music-outline";
    if (["js", "ts", "vue", "css", "scss", "html", "json", "xml", "yml", "yaml", "php", "py", "sh", "bat"].includes(ext)) return "mdi-file-code-outline";
    if (["pdf"].includes(ext)) return "mdi-file-pdf-box";
    return "mdi-file-outline";
};

let uploading = false;
const progress = computed(() => {
    if (uploadService.uiData.value.current) {
        return (uploadService.uiData.value.current[0] * 100) / uploadService.uiData.value.current[1];
    }
    return 0;
});
const uploadData = uploadService.uiData;
const uploadInstanceTag = computed(() => {
    if (
        !uploadData.value.instanceInfo ||
        uploadData.value.instanceInfo.instanceId != props.instanceId ||
        uploadData.value.instanceInfo.daemonId != props.daemonId
    ) {
        return `(${t("TXT_CODE_59c0c994")})`;
    }
    return "";
});
watch(
    () => uploadService.uiData.value,
    (newValue) => {
        if (newValue.current) {
            uploading = true;
        } else if (uploading) {
            uploading = false;
            getFileList();
        }
    },
    { immediate: true }
);

let task: ReturnType<typeof setInterval> | undefined;
task = setInterval(async () => {
    await getFileStatus();
}, 3000);

const opacity = ref(false);
const handleDragover = (e: DragEvent) => {
    e.preventDefault();
    opacity.value = true;
};

const handleDragleave = (e: DragEvent) => {
    e.preventDefault();
    opacity.value = false;
};

const uploadConfirmDialog = ref({
    show: false,
    files: null as FileList | null,
    name: ""
});

const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    opacity.value = false;
    if (!files) return;
    if (files.length === 0) return;
    let name = "";
    if (files.length === 1) {
        name = files[0].name;
    } else {
        for (const file of files) {
            name += file.name + ", ";
        }
        name = name.slice(0, -2);
    }
    if (name.length > 30) {
        name = name.slice(0, 27) + "...";
    }
    if (files.length > 1) {
        name += ` (${files.length})`;
    }
    uploadConfirmDialog.value = {
        show: true,
        files,
        name
    };
};

const overwriteDialog = ref({
    show: false,
    count: 0,
    fileName: "",
    all: false,
    overwrite: false,
    resolve: null as ((value: { confirmed: boolean; all: boolean; overwrite: boolean }) => void) | null
});

const createOverwriteHandler = () => {
    return (params: { count: number; fileName: string }) => {
        return new Promise<{ confirmed: boolean; all: boolean; overwrite: boolean }>((resolve) => {
            overwriteDialog.value = {
                show: true,
                count: params.count,
                fileName: params.fileName,
                all: false,
                overwrite: false,
                resolve
            };
        });
    };
};

const handleUploadConfirmOk = () => {
    if (uploadConfirmDialog.value.files) {
        selectedFiles([...uploadConfirmDialog.value.files], undefined, createOverwriteHandler());
    }
    uploadConfirmDialog.value.show = false;
};

const handleUploadConfirmCancel = () => {
    uploadConfirmDialog.value.show = false;
};

const handleOverwriteOk = () => {
    if (overwriteDialog.value.resolve) {
        overwriteDialog.value.resolve({
            confirmed: true,
            all: overwriteDialog.value.all,
            overwrite: overwriteDialog.value.overwrite
        });
    }
    overwriteDialog.value.show = false;
};

const handleOverwriteCancel = () => {
    if (overwriteDialog.value.resolve) {
        overwriteDialog.value.resolve({
            confirmed: false,
            all: overwriteDialog.value.all,
            overwrite: overwriteDialog.value.overwrite
        });
    }
    overwriteDialog.value.show = false;
};

const desktopFileInput = ref<HTMLInputElement | null>(null);
const onDesktopFileInput = (event: Event) => {
    const files = (event.target as HTMLInputElement).files;
    if (!files?.length) return;
    const names = Array.from(files).map((file) => file.name).join(", ");
    uploadConfirmDialog.value = { show: true, files, name: names.length > 30 ? `${names.slice(0, 27)}...` : names };
    (event.target as HTMLInputElement).value = "";
};

const onDesktopSelectionChange = (keys: unknown[]) => {
    const normalized = (keys as string[]).map(String);
    selectedRowKeys.value = normalized;
    selectionData.value = (dataSource.value || []).filter((item) => normalized.includes(item.name));
};

const desktopContextMenu = reactive({ open: false, x: 0, y: 0, record: null as DataType | null });

const handleDesktopRightClickRow = (e: MouseEvent, record: DataType) => {
    e.preventDefault();
    e.stopPropagation();
    oneSelected(record.name, record);
    desktopContextMenu.open = false;
    desktopContextMenu.x = e.clientX;
    desktopContextMenu.y = e.clientY;
    desktopContextMenu.record = record;
    nextTick(() => (desktopContextMenu.open = true));
};

const getDesktopRowProps = ({ item }: { item: unknown }) => {
    const record = ((item as any)?.raw ?? item) as DataType;
    return {
        "data-row-key": record.name,
        onClick: (e: MouseEvent) => handleRowClick(e, record),
        onDblclick: (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('input[type="checkbox"]') || target.closest('.v-btn') || target.closest('.v-menu')) return;
            void handleClickFile(record);
        },
        onContextmenu: (e: MouseEvent) => handleDesktopRightClickRow(e, record)
    };
};

const runDesktopMenuAction = (action: { action: () => void }) => {
    action.action();
    desktopContextMenu.open = false;
};

const desktopRowMenu = (record: DataType) => [
    { title: t("TXT_CODE_ARCHIVE_PREVIEW"), icon: "mdi-archive-outline", show: !isMultiple.value && record.type === 1 && isCompressFile(record.name), action: () => previewArchiveFile(record.name) },
    { title: t("TXT_CODE_a64f3007"), icon: "mdi-package-up", show: record.type === 1 && isCompressFile(record.name), action: () => unzipFile(record.name, false) },
    { title: t("TXT_CODE_ad207008"), icon: "mdi-pencil-outline", show: !isMultiple.value && record.type === 1, action: () => editFile(record.name) },
    { title: t("TXT_CODE_65b21404"), icon: "mdi-download-outline", show: !isMultiple.value && record.type === 1, action: () => downloadFile(record.name) },
    { title: t("TXT_CODE_46c4169b"), icon: "mdi-content-cut", show: true, action: () => setClipBoard("move") },
    { title: t("TXT_CODE_13ae6a93"), icon: "mdi-content-copy", show: true, action: () => setClipBoard("copy") },
    { title: t("TXT_CODE_c83551f5"), icon: "mdi-form-textbox", show: !isMultiple.value, action: () => resetName(record.name) },
    { title: t("TXT_CODE_16853efe"), icon: "mdi-key-outline", show: fileStatus.value?.platform !== "win32", action: () => changePermission(record.name, record.mode) },
    { title: t("TXT_CODE_88122886"), icon: "mdi-package-down", show: true, action: () => zipFile(false) },
    { title: t("TXT_CODE_ecbd7449"), icon: "mdi-delete-outline", show: true, action: () => deleteFile(record.name), color: "error" }
].filter((item) => item.show);

const editFile = (fileName: string) => {
    const path = currentPath.value + fileName;
    emit("open-file-editor", path, fileName);
};

const handleClickFile = async (file: DataType) => {
    if (file.type === 0) return rowClickTable(file.name, file.type);
    if (isCompressFile(file.name)) return previewArchiveFile(file.name);
    const fileExtName = getFileExtName(file.name);
    if (isImage(fileExtName)) {
        const path = currentPath.value + file.name;
        return emit("open-image-viewer", path, file.name);
    }
    return editFile(file.name);
};

const downloadDialog = ref({
    show: false,
    url: "",
    fileName: ""
});

const getFileNameFromUrl = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    try {
        const urlObject = new URL(url);
        const pathSegments = urlObject.pathname.split("/").filter(Boolean);
        const lastPathSegment = pathSegments.pop() || "";
        return decodeURIComponent(lastPathSegment);
    } catch (_) {
        return undefined;
    }
};

watch(
    () => downloadDialog.value.url,
    (newUrl, oldUrl) => {
        if (newUrl == oldUrl) return;
        const fileName = getFileNameFromUrl(newUrl);
        if (!fileName) return;
        downloadDialog.value.fileName = fileName;
    }
);

const downloadFromURLFile = async () => {
    downloadDialog.value.url = "";
    downloadDialog.value.fileName = "";
    downloadDialog.value.show = true;
};

const submitDownloadDialog = async () => {
    if (!downloadDialog.value.url) return notifyDesktopError(t("TXT_CODE_b5095a15"));
    if (!downloadDialog.value.fileName) return notifyDesktopError(t("TXT_CODE_de1b06cd"));
    try {
        new URL(downloadDialog.value.url);
    } catch (_) {
        return notifyDesktopError(t("TXT_CODE_a4a960b9"));
    }
    downloadDialog.value.show = false;
    await downloadFromUrl({
        url: downloadDialog.value.url,
        fileName: downloadDialog.value.fileName
    }, false);
};

const cancelDownloadDialog = () => {
    downloadDialog.value.show = false;
};

const lastClickedIndex = ref(-1);

const handleRowClick = (e: MouseEvent, record: DataType) => {
    const target = e.target as HTMLElement;
    if (target.closest('input[type="checkbox"]') ||
        target.closest('.v-btn') ||
        target.closest('.v-menu') ||
        target.closest('.v-input')) {
        return;
    }

    const key = record.name;
    const index = dataSource.value?.findIndex(d => d.name === key) ?? -1;

    if (e.ctrlKey || e.metaKey) {
        const existingIdx = selectedRowKeys.value.indexOf(key);
        if (existingIdx > -1) {
            selectedRowKeys.value = selectedRowKeys.value.filter(k => k !== key);
            if (selectionData.value) {
                selectionData.value = selectionData.value.filter(d => d.name !== key);
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
    const rowEl = (e.currentTarget as HTMLElement)?.closest('tr');
    if (rowEl) {
        if (!rowEl.hasAttribute('tabindex')) {
            rowEl.setAttribute('tabindex', '-1');
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
    return dfmRootRef.value.querySelector('.dfm-table tbody');
};

const getRowEls = (): NodeListOf<HTMLElement> => {
    if (!dfmRootRef.value) return document.querySelectorAll('');
    return dfmRootRef.value.querySelectorAll('.dfm-table tbody tr');
};

const getRowDataKey = (rowEl: HTMLElement): string | null => {
    return rowEl.getAttribute('data-row-key');
};

const getTableWrapperEl = (): HTMLElement | null => {
    if (!dfmRootRef.value) return null;
    return dfmRootRef.value.querySelector('.dfm-table-wrapper');
};

const onTableMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (e.shiftKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    if (target.closest('.dfm-table .v-data-table__td:last-child') ||
        target.closest('input[type="checkbox"]') ||
        target.closest('.v-btn') ||
        target.closest('.v-menu') ||
        target.closest('.v-input') ||
        target.closest('.v-pagination') ||
        target.closest('.v-tabs') ||
        target.closest('.dfm-breadcrumbs') ||
        target.closest('.dfm-toolbar') ||
        target.closest('.dfm-nav') ||
        target.closest('.dfm-upload-progress')) {
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
        if (!dfmRootRef.value.hasAttribute('tabindex')) {
            dfmRootRef.value.setAttribute('tabindex', '-1');
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
        if (prevSelected.length !== newlySelected.length || prevSelected.some((k, i) => k !== newlySelected[i])) {
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
            if (!dfmRootRef.value.hasAttribute('tabindex')) {
                dfmRootRef.value.setAttribute('tabindex', '-1');
            }
            dfmRootRef.value.focus({ preventScroll: true });
        }
    }
};

const onTableMouseUp = () => finishDragSelection();

const windowWidth = ref(window.innerWidth);
const windowHeight = ref(window.innerHeight);
const updateWindowSize = () => {
    windowWidth.value = window.innerWidth;
    windowHeight.value = window.innerHeight;
};
const handleWindowBlur = () => finishDragSelection(false);

const handleKeyboardShortcut = (e: KeyboardEvent) => {
    if (dfmRootRef.value && !dfmRootRef.value.contains(e.target as Node)) {
        return;
    }

    const shortcutSig = `${e.ctrlKey || e.metaKey ? "M" : ""}${e.shiftKey ? "S" : ""}${e.altKey ? "A" : ""}:${e.key}`;
    const now = Date.now();
    if (shortcutSig === lastShortcutKey && now - lastShortcutTime < SHORTCUT_DEBOUNCE_MS) {
        return;
    }
    lastShortcutKey = shortcutSig;
    lastShortcutTime = now;

    const target = e.target as HTMLElement;
    const tag = target?.tagName;
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    const isContentEditable = target?.isContentEditable;

    const isTableCheckbox = isInput && tag === 'INPUT' && (target as HTMLInputElement)?.type === 'checkbox' && target.closest('.dfm .dfm-table');
    if (isInput && !isTableCheckbox) return;
    if (isContentEditable && !isTableCheckbox) return;

    const isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl && e.key === 'c') {
        e.preventDefault();
        if (!selectionData.value || selectionData.value.length === 0) return;
        setClipBoard('copy');
        return;
    }

    if (isCtrl && e.key === 'x') {
        e.preventDefault();
        if (!selectionData.value || selectionData.value.length === 0) return;
        setClipBoard('move');
        return;
    }

    if (isCtrl && e.key === 'v') {
        e.preventDefault();
        paste();
        return;
    }

    if (isCtrl && e.key === 'a') {
        e.preventDefault();
        if (!dataSource.value || dataSource.value.length === 0) return;
        const allKeys = dataSource.value.map(d => d.name);
        const allRows = [...dataSource.value];
        selectedRowKeys.value = allKeys;
        selectionData.value = allRows;
        return;
    }

    if (e.key === 'Delete' || e.key === 'Del') {
        e.preventDefault();
        if (e.repeat || deleteDialog.value.show || deleteDialog.value.loading) return;
        if (!selectionData.value || selectionData.value.length === 0) return;
        finishDragSelection(false);
        const file = selectionData.value.length === 1 ? selectionData.value[0].name : undefined;
        void deleteFile(file);
        return;
    }
};

onMounted(async () => {
    window.addEventListener('resize', updateWindowSize);
    window.addEventListener('blur', handleWindowBlur);

    await getFileStatus();
    dialog.value.loading = true;

    if (currentTabs.value.length) {
        const thisTab = currentTabs.value[0];
        activeTab.value = thisTab.key;
        await getFileList(false, thisTab.path);
    } else {
        await getFileList(false);
    }

    dialog.value.loading = false;

    document.addEventListener('mousemove', onTableMouseMove);
    document.addEventListener('mouseup', onTableMouseUp);
    document.addEventListener('keydown', handleKeyboardShortcut);
});

onUnmounted(() => {
    if (task) clearInterval(task);
    task = undefined;
    finishDragSelection(false);
    if (dragSelectRafId !== null) {
        cancelAnimationFrame(dragSelectRafId);
        dragSelectRafId = null;
    }
    document.removeEventListener('mousemove', onTableMouseMove);
    document.removeEventListener('mouseup', onTableMouseUp);
    document.removeEventListener('keydown', handleKeyboardShortcut);
    window.removeEventListener('resize', updateWindowSize);
    window.removeEventListener('blur', handleWindowBlur);
});
</script>

<template>
    <template v-if="desktopVuetifyMode">
        <div ref="dfmRootRef" class="dfm dfm-vuetify" :class="{ 'dfm-vuetify--dragging': opacity }" @dragover.prevent="handleDragover" @dragleave.prevent="handleDragleave" @drop.prevent="handleDrop">
            <div class="dfm-toolbar">
                <VTextField v-model="operationForm.name" :placeholder="t('TXT_CODE_7cad42a5')" prepend-inner-icon="mdi-magnify" variant="solo" density="compact" rounded="xl" hide-details clearable @update:model-value="handleSearchChange()" />
                <VSpacer />
                <VBtn variant="text" rounded="xl" @click="downloadFromURLFile"><VIcon icon="mdi-cloud-download-outline" />{{ t("TXT_CODE_5b364aef") }}</VBtn>
                <VBtn variant="text" rounded="xl" @click="desktopFileInput?.click()"><VIcon icon="mdi-upload-outline" />{{ t("TXT_CODE_e00c858c") }}</VBtn>
                <input ref="desktopFileInput" type="file" multiple hidden @change="onDesktopFileInput" />
                <VBtn v-if="clipboard?.value?.length" color="primary" variant="text" rounded="xl" @click="paste"><VIcon icon="mdi-content-paste" />{{ t("TXT_CODE_f0260e51") }}</VBtn>
                <VBtn v-else variant="text" rounded="xl" @click="reloadList"><VIcon icon="mdi-refresh" />{{ t("TXT_CODE_a53573af") }}</VBtn>
                <VMenu location="bottom end">
                    <template #activator="{ props: menuProps }"><VBtn v-bind="menuProps" color="primary" variant="text" rounded="xl"><VIcon icon="mdi-plus" />{{ t("TXT_CODE_b147fabc") }}</VBtn></template>
                    <VCard rounded="xl"><VCardText class="dfm-menu-list"><VBtn variant="text" block @click="touchFile(true)"><VIcon icon="mdi-folder-plus-outline" />{{ t("TXT_CODE_cfc657db") }}</VBtn><VBtn variant="text" block @click="touchFile()"><VIcon icon="mdi-file-plus-outline" />{{ t("TXT_CODE_1e0b63b6") }}</VBtn></VCardText></VCard>
                </VMenu>
            </div>
            <VProgressLinear v-if="uploadData.current" :model-value="progress" color="primary" height="4" rounded="xl" />
            <div v-if="uploadData.current" class="dfm-upload-progress__info"><span>{{ `${uploadData.currentFile} ${uploadInstanceTag}`.trim() }}</span><span>({{ uploadData.files[0] }}/{{ uploadData.files[1] }})</span><VBtn icon variant="text" size="small" rounded="xl" @click="uploadData.suspending ? uploadService.unsuspend() : uploadService.suspend()"><VIcon :icon="uploadData.suspending ? 'mdi-play' : 'mdi-pause'" /></VBtn><VBtn icon variant="text" size="small" rounded="xl" @click="uploadService.stop()"><VIcon icon="mdi-close" /></VBtn></div>
            <div class="dfm-body" :style="{ opacity: opacity ? 0.4 : undefined }" @dragover.prevent="handleDragover" @dragleave.prevent="handleDragleave" @drop.prevent="handleDrop">
            <VTabs v-model="activeTab" class="dfm-tabs" color="primary">
                <VTab v-for="tab in currentTabs" :key="tab.key" :value="tab.key">{{ tab.name }}<VBtn icon variant="text" size="x-small" rounded="xl" class="dfm-tab-close" @click.stop="onEditTabs(tab.key, 'remove')"><VIcon icon="mdi-close" /></VBtn></VTab>
            </VTabs>
            <div class="dfm-nav">
                <VSelect v-if="isShowDiskList" v-model="currentDisk" :items="[{ title: t('TXT_CODE_28124988'), value: '/' }, ...(fileStatus?.disks || []).map((disk: string) => ({ title: disk, value: disk }))]" width="125" variant="solo" density="compact" rounded="xl" hide-details @update:model-value="toDisk" />
                <div class="dfm-breadcrumbs"><VBtn v-for="(item, index) in breadcrumbs" :key="item.path" variant="text" size="small" rounded="xl" @click="handleChangeDir(item.path)">{{ item.name }}<span v-if="index < breadcrumbs.length - 1" class="dfm-breadcrumb-separator">&gt;</span></VBtn></div>
            </div>
            <VAlert v-if="(fileStatus?.downloadFileFromURLTask || 0) > 0" type="info" variant="tonal" rounded="xl" density="compact"><VIcon icon="mdi-loading" class="desktop-icon-spin" />{{ t("TXT_CODE_8b7fe641", { count: fileStatus?.downloadFileFromURLTask || 0 }) }}</VAlert>
            <VAlert v-if="(fileStatus?.instanceFileTask || 0) > 0" type="info" variant="tonal" rounded="xl" density="compact"><VIcon icon="mdi-loading" class="desktop-icon-spin" />{{ t("TXT_CODE_dd06dea2") + (fileStatus?.instanceFileTask || 0) + t("TXT_CODE_3e959ce7") }}</VAlert>
            <div class="dfm-table-wrapper" @mousedown="onTableMouseDown">
            <VDataTableServer v-model="selectedRowKeys" class="dfm-table" :headers="desktopFileHeaders" :items="dataSource || []" item-value="name" :loading="spinning" :items-length="operationForm.total" :items-per-page="operationForm.pageSize || 20" :page="operationForm.current || 1" :items-per-page-options="[25, 50, 100, 200]" show-select density="comfortable" :row-props="getDesktopRowProps" @update:model-value="onDesktopSelectionChange" @update:page="(page) => handleTableChange({ current: page, pageSize: operationForm.pageSize || 20 })" @update:items-per-page="(size) => handleTableChange({ current: operationForm.current || 1, pageSize: size })">
                <template #loading><VProgressCircular indeterminate size="24" width="2" /></template>
                <template #item.name="{ item }"><span class="dfm-file-name"><VIcon :icon="getDesktopFileIcon(item.name, item.type)" size="small" />{{ item.name }}</span></template>
                <template #item.type="{ item }">{{ item.type === 1 ? filterFileName(item.name) : t("TXT_CODE_e5f949c") }}</template>
                <template #item.size="{ item }">{{ item.size ? convertFileSize(String(item.size)) : "--" }}</template>
                <template #item.time="{ item }">{{ item.time ? dayjs(item.time).format("YYYY-MM-DD HH:mm:ss") : "--" }}</template>
                <template #item.mode="{ item }">{{ item.mode ?? "--" }}</template>
                <template #item.action="{ item }"><VMenu location="bottom end"><template #activator="{ props: menuProps }"><VBtn v-bind="menuProps" icon variant="text" size="small" rounded="xl"><VIcon icon="mdi-dots-vertical" /></VBtn></template><VCard rounded="xl"><VCardText class="dfm-menu-list"><VBtn v-for="action in desktopRowMenu(item)" :key="action.title" variant="text" block :color="action.color" @click="action.action()"><VIcon :icon="action.icon" />{{ action.title }}</VBtn></VCardText></VCard></VMenu></template>
                <template #no-data><div class="dfm-empty"><VIcon icon="mdi-folder-open-outline" size="42" /><span>{{ t("TXT_CODE_DESKTOP_FM_NO_FILES") }}</span></div></template>
            </VDataTableServer>
            <div v-if="dragSelectVisible" class="dfm-drag-select-rect" :style="{ left: dragSelectRect.x + 'px', top: dragSelectRect.y + 'px', width: dragSelectRect.w + 'px', height: dragSelectRect.h + 'px' }"></div>
            </div>
            </div>
        </div>

        <VMenu v-model="desktopContextMenu.open" :target="[desktopContextMenu.x, desktopContextMenu.y]" location="bottom start">
            <VList v-if="desktopContextMenu.record" min-width="190">
                <VListItem v-for="action in desktopRowMenu(desktopContextMenu.record)" :key="action.title" :title="action.title" :prepend-icon="action.icon" :base-color="action.color" @click="runDesktopMenuAction(action)" />
            </VList>
        </VMenu>

        <VDialog v-model="archivePreview.show" max-width="960" scrollable><VCard rounded="xl"><VCardTitle>{{ `${t('TXT_CODE_ARCHIVE_PREVIEW')}: ${archivePreview.title}` }}</VCardTitle><VCardText><ArchivePreview compact :entries="archivePreview.entries" :loading="archivePreview.loading" /></VCardText><VCardText class="dfm-v-dialog-actions"><VBtn variant="text" rounded="xl" @click="closeArchivePreview">{{ t("TXT_CODE_a0451c97") }}</VBtn></VCardText></VCard></VDialog>
        <VDialog v-model="dialog.show" max-width="520" scrollable><VCard rounded="xl"><VCardTitle>{{ dialog.title }}</VCardTitle><VCardText><p>{{ dialog.info }}</p><VTextField v-if="dialog.mode === '' || dialog.mode === 'zip'" v-model="dialog.value" variant="solo" density="compact" hide-details :placeholder="t('TXT_CODE_4ea93630')" /><template v-if="dialog.mode === 'unzip'"><div class="dfm-dialog-label">{{ t("TXT_CODE_a6453188") }}</div><VRadioGroup v-model="dialog.unzipmode" inline><VRadio value="0" :label="t('TXT_CODE_7907c99')" /><VRadio value="1" :label="t('TXT_CODE_329fb904')" /></VRadioGroup><VTextField v-if="dialog.unzipmode === '1'" v-model="dialog.value" variant="solo" density="compact" hide-details :placeholder="t('TXT_CODE_377e5535')" /><div class="dfm-dialog-label">{{ t("TXT_CODE_2841f4a") }}</div><VRadioGroup v-model="dialog.code" inline><VRadio value="utf-8" label="UTF-8" /><VRadio value="gbk" label="GBK" /><VRadio value="big5" label="BIG5" /></VRadioGroup></template><template v-if="dialog.mode === 'permission'"><VProgressCircular v-if="permission.loading" indeterminate /><div v-for="item in permission.item" :key="item.key" class="dfm-permission"><strong>{{ item.key }}</strong><VCheckbox v-model="permission.data[item.role]" value="4" :label="t('TXT_CODE_798f592e')" hide-details /><VCheckbox v-model="permission.data[item.role]" value="2" :label="t('TXT_CODE_46c4e9ac')" hide-details /><VCheckbox v-model="permission.data[item.role]" value="1" :label="t('TXT_CODE_e97669d8')" hide-details /></div><VCheckbox v-model="permission.deep" :label="t('TXT_CODE_74fd665e')" hide-details /></template></VCardText><VCardText class="dfm-v-dialog-actions"><VBtn variant="text" rounded="xl" @click="dialog.cancel()">{{ t("TXT_CODE_a0451c97") }}</VBtn><VBtn color="primary" variant="text" rounded="xl" :loading="dialog.loading" @click="dialog.ok()">{{ t("TXT_CODE_abfe9512") }}</VBtn></VCardText></VCard></VDialog>
        <VDialog v-model="downloadDialog.show" max-width="520" scrollable><VCard rounded="xl"><VCardTitle>{{ t("TXT_CODE_f27b68b3") }}</VCardTitle><VCardText><VTextField v-model="downloadDialog.url" :label="t('TXT_CODE_ab8dd5a0')" variant="solo" density="compact" hide-details class="mb-4" /><VTextField v-model="downloadDialog.fileName" :label="t('TXT_CODE_2eace3d5')" variant="solo" density="compact" hide-details /></VCardText><VCardText class="dfm-v-dialog-actions"><VBtn variant="text" rounded="xl" @click="cancelDownloadDialog">{{ t("TXT_CODE_a0451c97") }}</VBtn><VBtn color="primary" variant="text" rounded="xl" @click="submitDownloadDialog">{{ t("TXT_CODE_d507abff") }}</VBtn></VCardText></VCard></VDialog>
        <VDialog v-model="loadingWindow.show" max-width="420" persistent><VCard rounded="xl"><VCardTitle>{{ loadingWindow.title }}</VCardTitle><VCardText class="dfm-loading-dialog"><VProgressCircular indeterminate size="34" /><span>{{ loadingWindow.text }}</span></VCardText></VCard></VDialog>
        <VDialog v-model="uploadConfirmDialog.show" max-width="520" scrollable><VCard rounded="xl"><VCardTitle>{{ t("TXT_CODE_52bc24ec") }}</VCardTitle><VCardText>{{ t("TXT_CODE_52bc24ec") }} {{ uploadConfirmDialog.name }}?</VCardText><VCardText class="dfm-v-dialog-actions"><VBtn variant="text" rounded="xl" @click="handleUploadConfirmCancel">{{ t("TXT_CODE_a0451c97") }}</VBtn><VBtn color="primary" variant="text" rounded="xl" @click="handleUploadConfirmOk">{{ t("TXT_CODE_d507abff") }}</VBtn></VCardText></VCard></VDialog>
        <VDialog v-model="overwriteDialog.show" max-width="520" scrollable><VCard rounded="xl"><VCardTitle>{{ t("TXT_CODE_99ca8563") }}</VCardTitle><VCardText>{{ t("TXT_CODE_58a55f17", { name: overwriteDialog.fileName }) }}<VCheckbox v-model="overwriteDialog.overwrite" :label="t('TXT_CODE_5bf41818')" hide-details /><VCheckbox v-if="overwriteDialog.count > 1" v-model="overwriteDialog.all" :label="t('TXT_CODE_5445f34b', { num: overwriteDialog.count - 1 })" hide-details /></VCardText><VCardText class="dfm-v-dialog-actions"><VBtn variant="text" rounded="xl" @click="handleOverwriteCancel">{{ t("TXT_CODE_518528d0") }}</VBtn><VBtn color="primary" variant="text" rounded="xl" @click="handleOverwriteOk">{{ t("TXT_CODE_ae09d79d") }}</VBtn></VCardText></VCard></VDialog>
        <VDialog v-model="deleteDialog.show" max-width="520" scrollable><VCard rounded="xl"><VCardTitle>{{ t("TXT_CODE_71155575") }}</VCardTitle><VCardText>{{ t("TXT_CODE_6a10302d") }}</VCardText><VCardText class="dfm-v-dialog-actions"><VBtn variant="text" rounded="xl" @click="deleteDialog.resolve && deleteDialog.resolve(false)">{{ t("TXT_CODE_a0451c97") }}</VBtn><VBtn color="error" variant="text" rounded="xl" @click="deleteDialog.resolve && deleteDialog.resolve(true)">{{ t("TXT_CODE_d507abff") }}</VBtn></VCardText></VCard></VDialog>
    </template>
</template>

<style lang="scss" scoped>
.dfm {
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--desktop-window-text);
    font-size: 13px;
    overflow: hidden;

}

.dfm-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    flex-shrink: 0;
    flex-wrap: wrap;

    &__left,
    &__right {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    &__left {
        flex: 1;
        min-width: 0;
    }
}

.dfm-upload-progress {
    padding: 6px 12px;
    flex-shrink: 0;

    &__info {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
    }

    &__bar {
        margin: 4px 0;
    }
}

.dfm-body {
    flex: 1;
    overflow: auto;
    padding: 0 12px 12px;
}

.dfm-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.dfm-breadcrumbs {
    border: 1px solid var(--desktop-window-border);
    border-radius: 6px;
    flex: 1;
    min-width: 0;

    &__item {
        padding: 6px 8px;
        cursor: pointer;
        display: inline-block;
        transition: all 0.2s;
        min-width: 32px;
        text-align: center;
        font-size: 12px;

        &:hover {
            background: var(--desktop-window-control-hover);
        }
    }
}

.dfm-file-name {
    color: inherit;
    font-size: 12px;
}

.dfm-permission {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
}

.dfm-table-wrapper {
    position: relative;
    user-select: none;
}

:deep(.dfm-table .v-data-table__th),
:deep(.dfm-table .v-data-table__td) {
    font-size: 12px;
}

:deep(.dfm-table .v-data-table__th) {
    background: var(--desktop-window-titlebar-bg) !important;
    border-bottom: 1px solid var(--desktop-window-border) !important;
    color: var(--desktop-window-text-secondary) !important;
    font-size: 11px !important;
    padding: 6px 10px !important;
}

:deep(.dfm-table .v-data-table__td) {
    border-bottom: 1px solid var(--desktop-window-border) !important;
    padding: 6px 8px !important;
    line-height: 1.4;
}

:deep(.dfm-table tbody tr:hover > td) {
    background: var(--desktop-window-control-hover) !important;
}

:deep(.dfm-table .v-data-table-footer) {
    font-size: 12px;
}

:deep(.dfm-table .v-btn) {
    font-size: 11px;
}

:deep(.dfm-table .v-data-table__tr--mobile) {
    display: none !important;
}

.dfm-drag-select-rect {
    position: absolute;
    background: rgba(22, 119, 255, 0.12);
    border-radius: 3px;
    pointer-events: none;
    z-index: 10;
}

.dfm-action-btn {
    color: var(--desktop-window-text-muted);
    font-size: 11px;
    padding: 0 4px;
    min-width: 20px;
    height: 20px;

    &:hover {
        color: var(--desktop-window-text);
        background: var(--desktop-window-control-hover);
    }
}

:deep(.dfm-tabs) {
    margin-bottom: 8px !important;
}

.dfm-dialog-fade-enter-active,
.dfm-dialog-fade-leave-active {
    transition: all 0.25s cubic-bezier(0.25, 0.10, 0.25, 1.00);
}

.dfm-dialog-fade-enter-from,
.dfm-dialog-fade-leave-to {
    opacity: 0;
    transform: scale(0.95);
}

.dfm-dialog-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: transparent;
}

.dfm-dialog__body {
    padding: 16px 20px;
    flex: 1;
    overflow-y: auto;

    &--column {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
    }
}

.dfm-dialog__warn-icon {
    font-size: 36px;
    color: var(--color-warning, #faad14);
}

.dfm-dialog__desc {
    margin: 0;
    color: var(--desktop-window-text);
    font-size: 14px;
    text-align: center;
    line-height: 1.6;
}

.dfm-overwrite-options {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
}

.dfm-dialog__footer {
    padding: 12px 20px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--desktop-window-border);
}

.dfm-btn {
    padding: 7px 16px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
    color: var(--desktop-window-text);
    white-space: nowrap;

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    &--primary {
        background: var(--color-blue-5, #1677ff);
        color: #fff;

        &:hover:not(:disabled) {
            background: var(--color-blue-6, #4096ff);
        }
    }

    &--default {
        background: var(--desktop-window-titlebar-bg);
        border: 1px solid var(--desktop-window-border);

        &:hover:not(:disabled) {
            background: var(--desktop-window-control-hover);
        }
    }
}

.dfm-vuetify { min-width: 0; }
.dfm-vuetify .dfm-toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; }
.dfm-vuetify .dfm-toolbar > .v-input { max-width: 260px; }
.dfm-vuetify .dfm-tabs { flex-shrink: 0; }
.dfm-tab-close { margin-left: 4px; opacity: 0.65; }
.dfm-nav { display: flex; align-items: center; gap: 8px; padding: 8px 12px; }
.dfm-breadcrumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; }
.dfm-breadcrumb-separator { margin-left: 8px; opacity: 0.5; }
.dfm-menu-list { display: flex; flex-direction: column; gap: 2px; padding: 8px !important; }
.dfm-menu-list .v-btn { justify-content: flex-start; }
.dfm-file-name { display: inline-flex; align-items: center; gap: 8px; }
.dfm-empty, .dfm-loading-dialog { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 32px; opacity: 0.65; }
.dfm-v-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 0 !important; }
.dfm-dialog-label { margin: 12px 0 4px; font-weight: 600; }
.dfm-permission { margin: 10px 0; }
</style>
