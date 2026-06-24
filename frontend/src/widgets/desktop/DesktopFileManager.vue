<script setup lang="ts">
import { useFileManager } from "@/hooks/useFileManager";
import { useRightClickMenu } from "@/hooks/useRightClickMenu";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import uploadService from "@/services/uploadService";
import { arrayFilter } from "@/tools/array";
import { filterFileName, getFileExtName, getFileIcon, isCompressFile } from "@/tools/fileManager";
import { convertFileSize } from "@/tools/fileSize";
import type { AntColumnsType } from "@/types/ant";
import type { DataType } from "@/types/fileManager";
import {
    CaretRightOutlined,
    CloseOutlined,
    CopyOutlined,
    DeleteOutlined,
    DownOutlined,
    DownloadOutlined,
    EditOutlined,
    ExclamationCircleOutlined,
    FileOutlined,
    FileZipOutlined,
    FolderOutlined,
    FormOutlined,
    KeyOutlined,
    PauseOutlined,
    PlusOutlined,
    ScissorOutlined,
    SearchOutlined,
    UploadOutlined
} from "@ant-design/icons-vue";
import { type ItemType, type UploadChangeParam, type UploadProps } from "ant-design-vue";
import type { Key } from "ant-design-vue/es/table/interface";
import dayjs from "dayjs";
import { computed, h, onMounted, onUnmounted, ref, watch, type CSSProperties } from "vue";
import DesktopWindow from "./DesktopWindow.vue";

const props = defineProps<{
    instanceId: string;
    daemonId: string;
    sessionId?: string;
}>();

const emit = defineEmits<{
    (e: "open-file-editor", filePath: string, fileName: string): void;
    (e: "open-image-viewer", filePath: string, fileName: string): void;
}>();

const { isPhone } = useScreen();

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
    handleChangeTab,
    selectChanged,
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
    showImage,
    pushSelected,
    selectionData,
    loadingWindow,
    deleteDialog
} = useFileManager(props.instanceId, props.daemonId, props.sessionId || "");

const { openRightClickMenu } = useRightClickMenu();

const isShowDiskList = computed(
    () =>
        fileStatus.value?.disks.length &&
        fileStatus.value?.platform === "win32" &&
        fileStatus.value?.isGlobalInstance
);

const columns = computed(() => {
    return arrayFilter<AntColumnsType>([
        {
            align: "left",
            title: t("TXT_CODE_94c193de"),
            dataIndex: "name",
            key: "name",
            minWidth: 200
        },
        {
            align: "center",
            title: t("TXT_CODE_67d68dd1"),
            dataIndex: "type",
            key: "type",
            customRender: (e: { text: number; record: { name: string } }) => {
                return e.text == 1 ? filterFileName(e.record.name) : t("TXT_CODE_e5f949c");
            },
            condition: () => !isPhone.value,
            minWidth: 200
        },
        {
            align: "center",
            title: t("TXT_CODE_94bb113a"),
            dataIndex: "size",
            key: "size",
            customRender: (e: { text: number }) =>
                e.text == 0 ? "--" : convertFileSize(e.text.toString()),
            minWidth: 200,
            condition: () => !isPhone.value
        },
        {
            align: "center",
            title: t("TXT_CODE_d3b29478"),
            dataIndex: "time",
            key: "time",
            customRender: (e: { text: string }) => {
                return dayjs(e.text).format("YYYY-MM-DD HH:mm:ss");
            },
            minWidth: 200,
            condition: () => !isPhone.value
        },
        {
            align: "center",
            title: t("TXT_CODE_511aea70"),
            dataIndex: "mode",
            key: "mode",
            minWidth: 200,
            condition: () => !isPhone.value && fileStatus.value?.platform !== "win32"
        },
        {
            align: isPhone.value ? "center" : "right",
            title: t("TXT_CODE_fe731dfc"),
            dataIndex: "action",
            key: "action",
            minWidth: 200,
            condition: () => !isMultiple.value
        }
    ]);
});

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

let task: NodeJS.Timer | undefined;
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

const fileList = ref<UploadProps["fileList"]>([]);
const onFileSelect = (info: UploadChangeParam) => {
    if (!info.fileList) return;
    if (info.fileList[info.fileList.length - 1].uid != info.file.uid) return;
    if (!fileList.value) return;
    const files = [...fileList.value].map((v) => v.originFileObj as File);
    fileList.value = [];
    selectedFiles(files, undefined, createOverwriteHandler());
};

const editFile = (fileName: string) => {
    const path = currentPath.value + fileName;
    emit("open-file-editor", path, fileName);
};

const handleClickFile = async (file: DataType) => {
    if (file.type === 0) return rowClickTable(file.name, file.type);
    const fileExtName = getFileExtName(file.name);
    if (isImage(fileExtName)) {
        const path = currentPath.value + file.name;
        return emit("open-image-viewer", path, file.name);
    }
    return editFile(file.name);
};

const menuList = (record: DataType) =>
    arrayFilter<ItemType & { style?: CSSProperties }>([
        {
            label: t("TXT_CODE_b147fabc"),
            key: "new",
            icon: h(PlusOutlined),
            children: [
                {
                    label: t("TXT_CODE_cfc657db"),
                    key: "newFolder",
                    icon: h(FolderOutlined),
                    onClick: () => touchFile(true)
                },
                {
                    label: t("TXT_CODE_1e0b63b6"),
                    key: "newFile",
                    icon: h(FileOutlined),
                    onClick: () => touchFile()
                }
            ],
            condition: () => !isMultiple.value
        },
        {
            label: t("TXT_CODE_a64f3007"),
            key: "unzip",
            icon: h(FileZipOutlined),
            onClick: () => unzipFile(record.name, false),
            condition: () => record.type === 1 && isCompressFile(record.name)
        },
        {
            label: t("TXT_CODE_ad207008"),
            key: "edit",
            icon: h(EditOutlined),
            onClick: () => editFile(record.name),
            condition: () => !isMultiple.value && record.type === 1
        },
        {
            label: t("TXT_CODE_65b21404"),
            key: "download",
            icon: h(DownloadOutlined),
            onClick: () => downloadFile(record.name),
            condition: () => !isMultiple.value && record.type === 1
        },
        {
            label: t("TXT_CODE_46c4169b"),
            key: "cut",
            icon: h(ScissorOutlined),
            onClick: () => setClipBoard("move")
        },
        {
            label: t("TXT_CODE_13ae6a93"),
            key: "copy",
            icon: h(CopyOutlined),
            onClick: () => setClipBoard("copy")
        },
        {
            label: t("TXT_CODE_c83551f5"),
            key: "rename",
            icon: h(FormOutlined),
            onClick: () => resetName(record.name),
            condition: () => !isMultiple.value
        },
        {
            label: t("TXT_CODE_16853efe"),
            key: "changePermission",
            icon: h(KeyOutlined),
            onClick: () => changePermission(record.name, record.mode),
            condition: () => fileStatus.value?.platform !== "win32"
        },
        {
            label: t("TXT_CODE_88122886"),
            key: "zip",
            icon: h(FileZipOutlined),
            onClick: () => zipFile(false)
        },
        {
            label: t("TXT_CODE_ecbd7449"),
            key: "delete",
            icon: h(DeleteOutlined),
            style: {
                color: "var(--color-red-5)"
            },
            onClick: () => deleteFile(record.name)
        }
    ]);

const handleRightClickRow = (e: MouseEvent, record: DataType) => {
    e.preventDefault();
    e.stopPropagation();
    oneSelected(record.name, record);
    openRightClickMenu(e.clientX, e.clientY, menuList(record));
    return false;
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
    const { reportValidatorError } = await import("@/tools/validator");
    if (!downloadDialog.value.url) return reportValidatorError(t("TXT_CODE_b5095a15"));
    if (!downloadDialog.value.fileName) return reportValidatorError(t("TXT_CODE_de1b06cd"));
    try {
        new URL(downloadDialog.value.url);
    } catch (_) {
        return reportValidatorError(t("TXT_CODE_a4a960b9"));
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
    if (target.closest('.ant-checkbox') ||
        target.closest('.ant-btn') ||
        target.closest('.ant-dropdown-trigger') ||
        target.closest('.ant-input') ||
        target.closest('.ant-select')) {
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
            const rangeKeys: Key[] = [];
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
    return dfmRootRef.value.querySelector('.ant-table-tbody');
};

const getRowEls = (): NodeListOf<HTMLElement> => {
    if (!dfmRootRef.value) return document.querySelectorAll('');
    return dfmRootRef.value.querySelectorAll('.ant-table-tbody tr.ant-table-row');
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
    if (target.closest('.ant-table-cell-fix-right') ||
        target.closest('.ant-checkbox') ||
        target.closest('.ant-btn') ||
        target.closest('.ant-dropdown-trigger') ||
        target.closest('.ant-input') ||
        target.closest('.ant-select') ||
        target.closest('.ant-pagination') ||
        target.closest('.ant-tabs') ||
        target.closest('.ant-breadcrumb') ||
        target.closest('.dfm-toolbar') ||
        target.closest('.dfm-nav') ||
        target.closest('.dfm-upload-progress') ||
        target.closest('.dfm-task-info')) {
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
        selectChanged([], []);
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

const onTableMouseUp = () => {
    if (isDragSelecting.value) {
        isDragSelecting.value = false;
        isDragAdditive.value = false;
        dragSelectVisible.value = false;
        if (dragSelectRafId !== null) {
            cancelAnimationFrame(dragSelectRafId);
            dragSelectRafId = null;
        }
        if (dfmRootRef.value) {
            if (!dfmRootRef.value.hasAttribute('tabindex')) {
                dfmRootRef.value.setAttribute('tabindex', '-1');
            }
            dfmRootRef.value.focus({ preventScroll: true });
        }
    }
};

const windowWidth = ref(window.innerWidth);
const windowHeight = ref(window.innerHeight);

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

    const isTableCheckbox = isInput && tag === 'INPUT' && (target as HTMLInputElement)?.type === 'checkbox' && target.closest('.dfm .ant-table');
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
        if (!selectionData.value || selectionData.value.length === 0) return;
        const file = selectionData.value.length === 1 ? selectionData.value[0].name : undefined;
        deleteFile(file);
        return;
    }
};

onMounted(async () => {
    const updateWindowSize = () => {
        windowWidth.value = window.innerWidth;
        windowHeight.value = window.innerHeight;
    };
    window.addEventListener('resize', updateWindowSize);

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
    if (dragSelectRafId !== null) {
        cancelAnimationFrame(dragSelectRafId);
        dragSelectRafId = null;
    }
    document.removeEventListener('mousemove', onTableMouseMove);
    document.removeEventListener('mouseup', onTableMouseUp);
    document.removeEventListener('keydown', handleKeyboardShortcut);
    window.removeEventListener('resize', () => {
        windowWidth.value = window.innerWidth;
        windowHeight.value = window.innerHeight;
    });
});
</script>

<template>
    <div ref="dfmRootRef" class="dfm">
        <div class="dfm-toolbar">
            <div class="dfm-toolbar__left">
                <a-input v-model:value.trim.lazy="operationForm.name" :placeholder="t('TXT_CODE_7cad42a5')" allow-clear
                    size="small" @change="handleSearchChange()">
                    <template #suffix>
                        <SearchOutlined />
                    </template>
                </a-input>
            </div>
            <div class="dfm-toolbar__right">
                <a-button type="dashed" size="small" @click="downloadFromURLFile">
                    <DownloadOutlined />
                    {{ t("TXT_CODE_5b364aef") }}
                </a-button>
                <a-upload v-model:file-list="fileList" :before-upload="() => false" multiple :on-change="onFileSelect"
                    :show-upload-list="false">
                    <a-button type="dashed" size="small">
                        <UploadOutlined />
                        {{ t("TXT_CODE_e00c858c") }}
                    </a-button>
                </a-upload>
                <a-button v-if="clipboard?.value && clipboard.value.length > 0" type="dashed" size="small" danger
                    @click="paste()">
                    {{ t("TXT_CODE_f0260e51") }}
                </a-button>
                <a-button v-else type="default" size="small" @click="reloadList()">
                    {{ t("TXT_CODE_a53573af") }}
                </a-button>

                <a-dropdown v-if="isMultiple" :get-popup-container="(trigger: any) => trigger.parentElement">
                    <template #overlay>
                        <a-menu mode="vertical" :items="menuList({
                            name: '',
                            type: 0,
                            size: 0,
                            time: '',
                            mode: 0
                        })
                            ">
                        </a-menu>
                    </template>
                    <a-button type="primary" size="small">
                        {{ t("TXT_CODE_5cb656b9") }}
                        <DownOutlined />
                    </a-button>
                </a-dropdown>

                <a-dropdown v-else :get-popup-container="(trigger: any) => trigger.parentElement">
                    <template #overlay>
                        <a-menu>
                            <a-menu-item key="newFile" @click="touchFile()">
                                {{ t("TXT_CODE_1e0b63b6") }}
                            </a-menu-item>
                            <a-menu-item key="newFolder" @click="touchFile(true)">
                                {{ t("TXT_CODE_cfc657db") }}
                            </a-menu-item>
                        </a-menu>
                    </template>
                    <a-button type="primary" size="small">
                        {{ t("TXT_CODE_b147fabc") }}
                        <DownOutlined />
                    </a-button>
                </a-dropdown>
            </div>
        </div>

        <div v-if="uploadData.current" class="dfm-upload-progress">
            <div class="dfm-upload-progress__info">
                <a-typography-text :ellipsis="true">
                    {{ `${uploadData.currentFile} ${uploadInstanceTag}`.trim() }}
                </a-typography-text>
                <a-typography-text style="padding-left: 5px; white-space: nowrap">
                    ({{ uploadData.files[0] }}/{{ uploadData.files[1] }})
                </a-typography-text>
                <CaretRightOutlined v-if="uploadData.suspending" style="margin-left: 5px; cursor: pointer"
                    @click="uploadService.unsuspend()" />
                <PauseOutlined v-else style="margin-left: 5px; cursor: pointer" @click="uploadService.suspend()" />
                <CloseOutlined style="margin-left: 5px; cursor: pointer" @click="uploadService.stop()" />
            </div>
            <a-progress :stroke-color="{
                '0%': '#49b3ff',
                '100%': '#25f5b9'
            }" :percent="progress" :show-info="false" class="dfm-upload-progress__bar" />
            <a-typography-text style="font-size: 11px">
                {{ convertFileSize(uploadData.current![0].toString()) }} /
                {{ convertFileSize(uploadData.current![1].toString()) }}
            </a-typography-text>
        </div>

        <div class="dfm-body" :style="opacity ? 'opacity: 0.4' : ''" @dragover="handleDragover"
            @dragleave="handleDragleave" @drop="handleDrop">
            <a-tabs v-model:activeKey="activeTab" type="editable-card" size="small" @edit="onEditTabs"
                @change="(key) => handleChangeTab(key as string)">
                <a-tab-pane v-for="b in currentTabs" :key="b.key" :tab="b.name" :closable="true">
                </a-tab-pane>
            </a-tabs>

            <div class="dfm-nav">
                <a-select v-if="isShowDiskList" v-model:value="currentDisk" size="small"
                    style="width: 125px; flex-shrink: 0" @change="toDisk(currentDisk)">
                    <a-select-option value="/">{{ t("TXT_CODE_28124988") }}</a-select-option>
                    <a-select-option v-for="disk in fileStatus?.disks" :key="disk" :value="disk">
                        {{ disk }}
                    </a-select-option>
                </a-select>
                <div class="dfm-breadcrumbs">
                    <a-breadcrumb separator=">">
                        <a-breadcrumb-item v-for="item in breadcrumbs" :key="item.path">
                            <span class="dfm-breadcrumbs__item" @click="handleChangeDir(item.path)">
                                {{ item.name }}
                            </span>
                        </a-breadcrumb-item>
                    </a-breadcrumb>
                </div>
            </div>

            <p v-if="fileStatus?.downloadFileFromURLTask && fileStatus.downloadFileFromURLTask > 0"
                class="dfm-task-info">
                <a-spin />
                {{ t("TXT_CODE_8b7fe641", { count: fileStatus?.downloadFileFromURLTask }) }}
            </p>
            <p v-if="fileStatus?.instanceFileTask && fileStatus.instanceFileTask > 0" class="dfm-task-info">
                <a-spin />
                {{ t("TXT_CODE_dd06dea2") + fileStatus?.instanceFileTask + t("TXT_CODE_3e959ce7") }}
            </p>

            <a-spin :spinning="spinning">
                <div class="dfm-table-wrapper" @mousedown="onTableMouseDown">
                    <a-table :row-selection="{
                        selectedRowKeys: selectedRowKeys,
                        onChange: selectChanged
                    }" :row-key="(record: DataType) => record.name" :data-source="dataSource" :columns="columns"
                        :scroll="{ x: 'max-content' }" size="small" :pagination="{
                            current: operationForm.current,
                            pageSize: operationForm.pageSize,
                            total: operationForm.total,
                            hideOnSinglePage: false,
                            showSizeChanger: true
                        }" :custom-row="(record: DataType) => {
                            return {
                                onclick: (e: MouseEvent) => handleRowClick(e, record as DataType),
                                onContextmenu: (e: MouseEvent) => handleRightClickRow(e, record as DataType),
                                ondblclick: (e: MouseEvent) => {
                                    const target = e.target as HTMLElement;
                                    if (target.closest('.ant-checkbox')) return;
                                    handleClickFile(record as DataType);
                                }
                            };
                        }"
                        @change="(pagination: any) => handleTableChange({ current: pagination.current || 0, pageSize: pagination.pageSize || 0 })">
                        <template #bodyCell="{ column, record }">
                            <template v-if="column.key === 'name'">
                                <span class="dfm-file-name">
                                    <span class="mr-4">
                                        <component :is="getFileIcon(record.name, record.type)"
                                            style="font-size: 16px" />
                                    </span>
                                    {{ record.name }}
                                </span>
                            </template>
                            <template v-if="column.key === 'action'">
                                <a-dropdown>
                                    <template #overlay>
                                        <a-menu mode="vertical" :items="menuList(record as DataType)"></a-menu>
                                    </template>
                                    <a-button size="small" type="text" class="dfm-action-btn">
                                        <DownOutlined />
                                    </a-button>
                                </a-dropdown>
                            </template>
                        </template>
                    </a-table>
                    <div v-if="dragSelectVisible" class="dfm-drag-select-rect" :style="{
                        left: dragSelectRect.x + 'px',
                        top: dragSelectRect.y + 'px',
                        width: dragSelectRect.w + 'px',
                        height: dragSelectRect.h + 'px'
                    }"></div>
                </div>
            </a-spin>
        </div>

        <Teleport to="body">
            <Transition name="dfm-dialog-fade">
                <DesktopWindow v-if="dialog.show" id="file-manager-dialog" :title="dialog.title" :icon="FileOutlined"
                    :visible="dialog.show" :minimized="false" :maximized="false" :active="true" :initial-width="420"
                    :initial-height="380" :initial-x="windowWidth / 2 - 210" :initial-y="windowHeight / 2 - 190"
                    :z-index="10002" :show-minimize="false" :show-maximize="false" :resizable="false"
                    @close="dialog.cancel()">
                    <div class="dfm-dialog-content">
                        <div class="dfm-dialog__body">
                            <p>{{ dialog.info }}</p>

                            <a-input v-if="dialog.mode == ''" :ref="dialog.ref" v-model:value="dialog.value"
                                :placeholder="t('TXT_CODE_4ea93630')" />

                            <a-space v-if="dialog.mode == 'unzip'" direction="vertical" class="w-100">
                                <a-typography-title :level="5">{{ t("TXT_CODE_a6453188") }}</a-typography-title>
                                <a-radio-group v-model:value="dialog.unzipmode">
                                    <a-radio-button value="0">{{ t("TXT_CODE_7907c99") }}</a-radio-button>
                                    <a-radio-button value="1">{{ t("TXT_CODE_329fb904") }}</a-radio-button>
                                </a-radio-group>

                                <a-input v-if="dialog.unzipmode == '1'" v-model:value="dialog.value"
                                    :placeholder="t('TXT_CODE_377e5535')" />
                            </a-space>

                            <a-space v-if="dialog.mode == 'zip'" direction="vertical" class="w-100">
                                <a-input :ref="dialog.ref" v-model:value="dialog.value"
                                    :placeholder="t('TXT_CODE_366bad15')" addon-after=". zip" />
                            </a-space>

                            <a-space v-if="dialog.mode == 'unzip'" direction="vertical" class="w-100 mt-16">
                                <a-typography-title :level="5">{{ t("TXT_CODE_2841f4a") }}</a-typography-title>
                                <a-radio-group v-model:value="dialog.code">
                                    <a-radio-button value="utf-8">UTF-8</a-radio-button>
                                    <a-radio-button value="gbk">GBK</a-radio-button>
                                    <a-radio-button value="big5">BIG5</a-radio-button>
                                </a-radio-group>
                            </a-space>

                            <a-space v-if="dialog.mode == 'zip'" direction="vertical" class="w-100 mt-16">
                                <a-typography-text>
                                    {{ t("TXT_CODE_92ebdc7f") }}
                                </a-typography-text>
                            </a-space>

                            <a-space v-if="dialog.mode == 'permission'" direction="vertical" class="w-100 select-none">
                                <a-spin :spinning="permission.loading">
                                    <div class="dfm-permission">
                                        <a-checkbox-group v-for="item in permission.item" :key="item.key"
                                            v-model:value="permission.data[item.role]">
                                            <a-row class="direction-column">
                                                <a-typography-text class="mb-10">
                                                    <strong>{{ item.key }}</strong>
                                                </a-typography-text>
                                                <a-col class="mb-10">
                                                    <a-checkbox value="4">{{ t("TXT_CODE_798f592e") }}</a-checkbox>
                                                </a-col>
                                                <a-col class="mb-10">
                                                    <a-checkbox value="2">{{ t("TXT_CODE_46c4e9ac") }}</a-checkbox>
                                                </a-col>
                                                <a-col class="mb-10">
                                                    <a-checkbox value="1">{{ t("TXT_CODE_e97669d8") }}</a-checkbox>
                                                </a-col>
                                            </a-row>
                                        </a-checkbox-group>
                                    </div>
                                    <a-checkbox v-model:checked="permission.deep" class="mt-15">
                                        {{ t("TXT_CODE_74fd665e") }}
                                    </a-checkbox>
                                </a-spin>
                            </a-space>
                        </div>
                        <div class="dfm-dialog__footer">
                            <button class="dfm-btn dfm-btn--default" @click="dialog.cancel()">
                                {{ t("TXT_CODE_DESKTOP_USERS_CANCEL") }}
                            </button>
                            <button class="dfm-btn dfm-btn--primary" :disabled="dialog.loading" @click="dialog.ok()">
                                {{ t("TXT_CODE_DESKTOP_USERS_SAVE") }}
                            </button>
                        </div>
                    </div>
                </DesktopWindow>
            </Transition>
        </Teleport>

        <Teleport to="body">
            <Transition name="dfm-dialog-fade">
                <DesktopWindow v-if="downloadDialog.show" id="file-manager-download-dialog"
                    :title="t('TXT_CODE_f27b68b3')" :icon="DownloadOutlined" :visible="downloadDialog.show"
                    :minimized="false" :maximized="false" :active="true" :initial-width="400" :initial-height="280"
                    :initial-x="windowWidth / 2 - 200" :initial-y="windowHeight / 2 - 140" :z-index="10002"
                    :show-minimize="false" :show-maximize="false" :resizable="false" @close="cancelDownloadDialog">
                    <div class="dfm-dialog-content">
                        <div class="dfm-dialog__body">
                            <a-form layout="vertical">
                                <a-form-item :label="t('TXT_CODE_ab8dd5a0')">
                                    <div style="display: flex; flex-direction: column; gap: 4px;">
                                        <a-typography-text type="secondary" class="typography-text-ellipsis">
                                            {{ t("TXT_CODE_3fd7fe73") }}
                                        </a-typography-text>
                                        <a-input v-model:value="downloadDialog.url"
                                            :placeholder="t('TXT_CODE_4ea93630')" />
                                    </div>
                                </a-form-item>
                                <a-form-item :label="t('TXT_CODE_2eace3d5')">
                                    <a-input v-model:value="downloadDialog.fileName"
                                        :placeholder="t('TXT_CODE_4ea93630')" />
                                </a-form-item>
                            </a-form>
                        </div>
                        <div class="dfm-dialog__footer">
                            <button class="dfm-btn dfm-btn--default" @click="cancelDownloadDialog">
                                {{ t("TXT_CODE_a0451c97") }}
                            </button>
                            <button class="dfm-btn dfm-btn--primary" @click="submitDownloadDialog">
                                {{ t("TXT_CODE_d507abff") }}
                            </button>
                        </div>
                    </div>
                </DesktopWindow>
            </Transition>
        </Teleport>

        <Teleport to="body">
            <Transition name="dfm-dialog-fade">
                <DesktopWindow v-if="loadingWindow.show" id="file-manager-loading-dialog" :title="loadingWindow.title"
                    :icon="FileZipOutlined" :visible="loadingWindow.show" :minimized="false" :maximized="false"
                    :active="true" :initial-width="360" :initial-height="180" :initial-x="windowWidth / 2 - 180"
                    :initial-y="windowHeight / 2 - 90" :z-index="10003" :show-minimize="false" :show-maximize="false"
                    :show-close="false" :resizable="false">
                    <div class="dfm-dialog-content">
                        <div class="dfm-dialog__body"
                            style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;">
                            <a-spin size="large" />
                            <p style="margin: 0; color: var(--desktop-window-text);">{{ loadingWindow.text }}</p>
                        </div>
                    </div>
                </DesktopWindow>
            </Transition>
        </Teleport>

        <Teleport to="body">
            <Transition name="dfm-dialog-fade">
                <DesktopWindow v-if="uploadConfirmDialog.show" id="file-manager-upload-confirm-dialog"
                    :title="t('TXT_CODE_52bc24ec')" :icon="ExclamationCircleOutlined"
                    :visible="uploadConfirmDialog.show" :minimized="false" :maximized="false" :active="true"
                    :initial-width="400" :initial-height="200" :initial-x="windowWidth / 2 - 200"
                    :initial-y="windowHeight / 2 - 100" :z-index="10004" :show-minimize="false" :show-maximize="false"
                    :resizable="false" @close="handleUploadConfirmCancel">
                    <div class="dfm-dialog-content">
                        <div class="dfm-dialog__body dfm-dialog__body--column">
                            <ExclamationCircleOutlined class="dfm-dialog__warn-icon" />
                            <p class="dfm-dialog__desc">{{ t("TXT_CODE_52bc24ec") }} {{ uploadConfirmDialog.name }} ?
                            </p>
                        </div>
                        <div class="dfm-dialog__footer">
                            <button class="dfm-btn dfm-btn--default" @click="handleUploadConfirmCancel">
                                {{ t("TXT_CODE_a0451c97") }}
                            </button>
                            <button class="dfm-btn dfm-btn--primary" @click="handleUploadConfirmOk">
                                {{ t("TXT_CODE_d507abff") }}
                            </button>
                        </div>
                    </div>
                </DesktopWindow>
            </Transition>
        </Teleport>

        <Teleport to="body">
            <Transition name="dfm-dialog-fade">
                <DesktopWindow v-if="overwriteDialog.show" id="file-manager-overwrite-dialog"
                    :title="t('TXT_CODE_99ca8563')" :icon="ExclamationCircleOutlined" :visible="overwriteDialog.show"
                    :minimized="false" :maximized="false" :active="true" :initial-width="400" :initial-height="240"
                    :initial-x="windowWidth / 2 - 200" :initial-y="windowHeight / 2 - 120" :z-index="10005"
                    :show-minimize="false" :show-maximize="false" :resizable="false" @close="handleOverwriteCancel">
                    <div class="dfm-dialog-content">
                        <div class="dfm-dialog__body dfm-dialog__body--column">
                            <ExclamationCircleOutlined class="dfm-dialog__warn-icon" />
                            <p class="dfm-dialog__desc">{{ t("TXT_CODE_58a55f17", { name: overwriteDialog.fileName }) }}
                            </p>
                            <div class="dfm-overwrite-options">
                                <a-checkbox v-model:checked="overwriteDialog.overwrite">
                                    {{ t("TXT_CODE_5bf41818") }}
                                </a-checkbox>
                                <a-checkbox v-if="overwriteDialog.count > 1" v-model:checked="overwriteDialog.all"
                                    style="margin-left: 5px">
                                    {{ t("TXT_CODE_5445f34b", { num: overwriteDialog.count - 1 }) }}
                                </a-checkbox>
                            </div>
                        </div>
                        <div class="dfm-dialog__footer">
                            <button class="dfm-btn dfm-btn--default" @click="handleOverwriteCancel">
                                {{ t("TXT_CODE_518528d0") }}
                            </button>
                            <button class="dfm-btn dfm-btn--primary" @click="handleOverwriteOk">
                                {{ t("TXT_CODE_ae09d79d") }}
                            </button>
                        </div>
                    </div>
                </DesktopWindow>
            </Transition>
        </Teleport>

        <Teleport to="body">
            <Transition name="dfm-dialog-fade">
                <DesktopWindow v-if="deleteDialog.show" id="file-manager-delete-dialog" :title="t('TXT_CODE_71155575')"
                    :icon="ExclamationCircleOutlined" :visible="deleteDialog.show" :minimized="false" :maximized="false"
                    :active="true" :initial-width="400" :initial-height="200" :initial-x="windowWidth / 2 - 200"
                    :initial-y="windowHeight / 2 - 100" :z-index="10006" :show-minimize="false" :show-maximize="false"
                    :resizable="false" @close="deleteDialog.resolve && deleteDialog.resolve(false)">
                    <div class="dfm-dialog-content">
                        <div class="dfm-dialog__body dfm-dialog__body--column">
                            <ExclamationCircleOutlined class="dfm-dialog__warn-icon" />
                            <p class="dfm-dialog__desc">
                                {{ t("TXT_CODE_6a10302d") }}
                            </p>
                        </div>
                        <div class="dfm-dialog__footer">
                            <button class="dfm-btn dfm-btn--default"
                                @click="deleteDialog.resolve && deleteDialog.resolve(false)">
                                {{ t("TXT_CODE_a0451c97") }}
                            </button>
                            <button class="dfm-btn dfm-btn--primary"
                                style="background: var(--color-red-5); border-color: var(--color-red-5);"
                                @click="deleteDialog.resolve && deleteDialog.resolve(true)">
                                {{ t("TXT_CODE_d507abff") }}
                            </button>
                        </div>
                    </div>
                </DesktopWindow>
            </Transition>
        </Teleport>

    </div>
</template>

<style lang="scss" scoped>
.dfm {
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--desktop-window-text);
    font-size: 13px;
    overflow: hidden;

    :deep(.ant-dropdown-menu),
    :deep(.ant-menu) {

        .ant-dropdown-menu-item,
        .ant-dropdown-menu-submenu-title,
        .ant-menu-item,
        .ant-menu-submenu-title {
            height: 32px !important;
            line-height: 32px !important;
            padding-inline: 12px !important;
            display: flex !important;
            align-items: center !important;
            margin-block: 2px !important;
        }

        .ant-menu-submenu-arrow,
        .ant-dropdown-menu-submenu-arrow {
            inset-inline-end: 8px !important;
        }
    }
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

.dfm-task-info {
    color: #1677ff;
    font-size: 12px;
    margin: 4px 0;
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

:deep(.ant-table-measure-row) {
    display: none !important;
}

:deep(.ant-table-pagination-right) {
    gap: 6px;
}

.dfm-drag-select-rect {
    position: absolute;
    background: rgba(22, 119, 255, 0.12);
    border: 1px solid rgba(22, 119, 255, 0.4);
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

:deep(.ant-tabs-nav) {
    margin-bottom: 8px !important;
}

:deep(.ant-tabs-tab) {
    font-size: 12px !important;
    padding: 4px 12px !important;
}

:deep(.ant-table) {
    font-size: 12px;
}

:deep(.ant-table-thead > tr > th) {
    background: var(--desktop-window-titlebar-bg) !important;
    border-bottom: 1px solid var(--desktop-window-border) !important;
    color: var(--desktop-window-text-secondary) !important;
    font-size: 11px !important;
    padding: 6px 10px !important;
}

:deep(.ant-table-tbody > tr > td) {
    border-bottom: 1px solid var(--desktop-window-border) !important;
    padding: 6px 8px !important;
    line-height: 1.4;
}

:deep(.ant-table-tbody > tr:hover > td) {
    background: var(--desktop-window-control-hover) !important;
}

:deep(.ant-pagination) {
    font-size: 12px;
}

:deep(.ant-btn-sm) {
    font-size: 11px;
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
</style>
