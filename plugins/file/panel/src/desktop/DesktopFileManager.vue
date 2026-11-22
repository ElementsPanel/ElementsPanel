<script setup lang="ts">
import { usePluginService, type FrontendDesktopService } from "@elements-panel/sdk";
import DesktopDialog from "@elementspanel/epanel-plugin-console/components/DesktopDialog";
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { usePolling } from "@elementspanel/epanel-plugin-console/hooks/usePolling";
import { notifyDesktopError } from "@elementspanel/epanel-plugin-console/tools/desktopNotice";
import { convertFileSize } from "@elementspanel/epanel-plugin-console/tools/fileSize";
import type { DataType } from "@elementspanel/epanel-plugin-console/types/fileManager";
import { t } from "@elementspanel/epanel-plugin-i18n";
import dayjs from "dayjs";
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  VBtn,
  VCheckbox,
  VDataTableServer,
  VIcon,
  VList,
  VListItem,
  VMenu,
  VProgressCircular,
  VProgressLinear,
  VRadio,
  VRadioGroup,
  VSpacer,
  VTextField
} from "vuetify/components";
import ArchivePreview from "../components/ArchivePreview.vue";
import FileManagerTabs from "../components/FileManagerTabs.vue";
import FileManagerPathBar from "../components/FileManagerPathBar.vue";
import { useFileManager } from "../hooks/useFileManager";
import { useFileUploadProgress } from "../hooks/useFileUploadProgress";
import { useDesktopFileUpload } from "../hooks/useDesktopFileUpload";
import { useDesktopFileSelection } from "../hooks/useDesktopFileSelection";
import { filterFileName, getFileExtName, isCompressFile } from "../tools/fileManager";

const ConfirmDialog = computed(
  () => usePluginService<FrontendDesktopService>("desktop")?.confirmation
);

const desktopVuetifyMode = true;
let disposed = false;

const props = defineProps<{
  instanceId: string;
  daemonId: string;
  sessionId?: string;
}>();

const emit = defineEmits<{
  (e: "open-file-editor", filePath: string, fileName: string): void;
  (e: "open-image-viewer", filePath: string, fileName: string): void;
}>();

const manager = useFileManager(props.instanceId, props.daemonId, props.sessionId || "");
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
  handleReorderTabs,
  handleChangeTab,
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
  archivePreview,
  previewArchiveFile,
  closeArchivePreview,
  deleteDialog
} = manager;

const desktopFileHeaders = computed(() => {
  const headers = [
    { title: t("TXT_CODE_FILE_NAME"), key: "name", value: "name", sortable: false },
    { title: t("TXT_CODE_FILE_TYPE"), key: "type", value: "type", sortable: false },
    { title: t("TXT_CODE_COMMON_SIZE"), key: "size", value: "size", sortable: false },
    { title: t("TXT_CODE_COMMON_LAST_MODIFY"), key: "time", value: "time", sortable: false }
  ];
  if (fileStatus.value?.platform !== "win32") {
    headers.push({
      title: t("TXT_CODE_FILE_PERMISSIONS"),
      key: "mode",
      value: "mode",
      sortable: false
    });
  }
  return headers;
});

const getDesktopFileIcon = (name: string, type: number) => {
  if (type === 0) return "mdi-folder-outline";
  const ext = getFileExtName(name);
  if (["zip", "tar", "gz", "bz2", "xz", "7z", "rar", "iso", "cab"].includes(ext))
    return "mdi-archive-outline";
  if (["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico"].includes(ext))
    return "mdi-file-image-outline";
  if (["mp3", "wav", "ogg", "flac", "aac", "mp4", "mov", "avi", "mkv"].includes(ext))
    return "mdi-file-music-outline";
  if (
    [
      "js",
      "ts",
      "vue",
      "css",
      "scss",
      "html",
      "json",
      "xml",
      "yml",
      "yaml",
      "php",
      "py",
      "sh",
      "bat"
    ].includes(ext)
  )
    return "mdi-file-code-outline";
  if (["pdf"].includes(ext)) return "mdi-file-pdf-box";
  return "mdi-file-outline";
};

const { progress, uploadData, uploadInstanceTag, uploadService } = useFileUploadProgress({
  target: () => ({ instanceId: props.instanceId, daemonId: props.daemonId }),
  refresh: getFileList
});

usePolling(getFileStatus, 3000);

const {
  uploadConfirmDialog,
  overwriteDialog,
  createOverwriteHandler,
  handleUploadConfirmOk,
  handleUploadConfirmCancel,
  handleOverwriteOk,
  handleOverwriteCancel,
  desktopFileInput,
  onDesktopFileInput,
  opacity,
  handleDragover,
  handleDragleave,
  handleDrop
} = useDesktopFileUpload(manager);

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
      if (
        target.closest('input[type="checkbox"]') ||
        target.closest(".v-btn") ||
        target.closest(".v-menu")
      )
        return;
      void handleClickFile(record);
    },
    onContextmenu: (e: MouseEvent) => handleDesktopRightClickRow(e, record)
  };
};

const runDesktopMenuAction = (action: { action: () => void }) => {
  action.action();
  desktopContextMenu.open = false;
};

const desktopRowMenu = (record: DataType) =>
  [
    {
      title: t("TXT_CODE_ARCHIVE_PREVIEW"),
      icon: "mdi-archive-outline",
      show: !isMultiple.value && record.type === 1 && isCompressFile(record.name),
      action: () => previewArchiveFile(record.name)
    },
    {
      title: t("TXT_CODE_COMMON_UNZIP"),
      icon: "mdi-package-up",
      show: record.type === 1 && isCompressFile(record.name),
      action: () => unzipFile(record.name, false)
    },
    {
      title: t("TXT_CODE_COMMON_EDIT"),
      icon: "mdi-pencil-outline",
      show: !isMultiple.value && record.type === 1,
      action: () => editFile(record.name)
    },
    {
      title: t("TXT_CODE_COMMON_DOWNLOAD"),
      icon: "mdi-download-outline",
      show: !isMultiple.value && record.type === 1,
      action: () => downloadFile(record.name)
    },
    {
      title: t("TXT_CODE_COMMON_CUT"),
      icon: "mdi-content-cut",
      show: true,
      action: () => setClipBoard("move")
    },
    {
      title: t("TXT_CODE_COMMON_COPY"),
      icon: "mdi-content-copy",
      show: true,
      action: () => setClipBoard("copy")
    },
    {
      title: t("TXT_CODE_COMMON_RENAME"),
      icon: "mdi-form-textbox",
      show: !isMultiple.value,
      action: () => resetName(record.name)
    },
    {
      title: t("TXT_CODE_COMMON_CHANGE_PERMISSIONS"),
      icon: "mdi-key-outline",
      show: fileStatus.value?.platform !== "win32",
      action: () => changePermission(record.name, record.mode)
    },
    {
      title: t("TXT_CODE_COMMON_COMPRESS"),
      icon: "mdi-package-down",
      show: true,
      action: () => zipFile(false)
    },
    {
      title: t("TXT_CODE_COMMON_DELETE"),
      icon: "mdi-delete-outline",
      show: true,
      action: () => deleteFile(record.name),
      color: "error"
    }
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
  if (!downloadDialog.value.url) return notifyDesktopError(t("TXT_CODE_COMMON_URL_REQUIRED"));
  if (!downloadDialog.value.fileName)
    return notifyDesktopError(t("TXT_CODE_COMMON_FILE_NAME_REQUIRED"));
  try {
    new URL(downloadDialog.value.url);
  } catch (_) {
    return notifyDesktopError(t("TXT_CODE_COMMON_INVALID_URL"));
  }
  downloadDialog.value.show = false;
  await downloadFromUrl(
    {
      url: downloadDialog.value.url,
      fileName: downloadDialog.value.fileName
    },
    false
  );
};

const cancelDownloadDialog = () => {
  downloadDialog.value.show = false;
};

const {
  onDesktopSelectionChange,
  handleRowClick,
  dfmRootRef,
  dragSelectRect,
  dragSelectVisible,
  onTableMouseDown,
  bindSelectionEvents
} = useDesktopFileSelection(manager);

const getDesktopDialogProps = (
  name: string,
  preferredWidth: number,
  preferredHeight: number,
  layer = 0
) => {
  return {
    id: `file-manager:${props.daemonId}:${props.instanceId}:${
      props.sessionId || "default"
    }:${name}`,
    width: preferredWidth,
    height: preferredHeight,
    zIndex: 10010 + layer
  };
};
onMounted(async () => {
  dialog.value.loading = true;
  await getFileStatus();
  if (disposed) return;

  if (currentTabs.value.length) {
    const thisTab = currentTabs.value[0];
    activeTab.value = thisTab.key;
    await getFileList(false, thisTab.path);
  } else {
    await getFileList(false);
  }

  if (disposed) return;
  dialog.value.loading = false;

  bindSelectionEvents();
});

onUnmounted(() => {
  disposed = true;
});
</script>

<template>
    <template v-if="desktopVuetifyMode">
        <div ref="dfmRootRef" class="dfm dfm-vuetify" :class="{ 'dfm-vuetify--dragging': opacity }" @dragover.prevent="handleDragover" @dragleave.prevent="handleDragleave" @drop.prevent="handleDrop">
            <div class="dfm-toolbar">
                <VTextField
                    :disabled="!currentTabs.length"
                    v-model="operationForm.name"
                    :label="t('TXT_CODE_COMMON_SEARCH_BY_FILE_NAME')"
                    prepend-inner-icon="mdi-magnify"
                    density="comfortable"
                    hide-details
                    clearable
                    @update:model-value="operationForm.name = $event ?? ''; handleSearchChange()"
                />
                <VSpacer />
                <VBtn :disabled="!currentTabs.length" variant="text" @click="downloadFromURLFile"><VIcon icon="mdi-cloud-download-outline" />{{ t("TXT_CODE_COMMON_REMOTE_DOWNLOAD") }}</VBtn>
                <VBtn :disabled="!currentTabs.length" variant="text" @click="desktopFileInput?.click()"><VIcon icon="mdi-upload-outline" />{{ t("TXT_CODE_FILE_UPLOAD") }}</VBtn>
                <input :disabled="!currentTabs.length" ref="desktopFileInput" type="file" multiple hidden @change="onDesktopFileInput" />
                <VBtn :disabled="!currentTabs.length" v-if="clipboard?.value?.length" color="primary" variant="text" @click="paste"><VIcon icon="mdi-content-paste" />{{ t("TXT_CODE_COMMON_PASTE_FILES") }}</VBtn>
                <VBtn :disabled="!currentTabs.length" v-else variant="text" @click="reloadList"><VIcon icon="mdi-refresh" />{{ t("TXT_CODE_FILE_LIST_REFRESH") }}</VBtn>
                <VMenu :disabled="!currentTabs.length" location="bottom end">
                    <template #activator="{ props: menuProps }"><VBtn :disabled="!currentTabs.length" v-bind="menuProps" color="primary" variant="text"><VIcon icon="mdi-plus" />{{ t("TXT_CODE_COMMON_NEW") }}</VBtn></template>
                    <VList>
                        <VListItem :disabled="!currentTabs.length" :title="t('TXT_CODE_COMMON_BLANK_FILE')" prepend-icon="mdi-file-plus-outline" @click="touchFile()" />
                        <VListItem :disabled="!currentTabs.length" :title="t('TXT_CODE_COMMON_DIRECTORY')" prepend-icon="mdi-folder-plus-outline" @click="touchFile(true)" />
                    </VList>
                </VMenu>
            </div>
            <div v-if="uploadData.current" class="dfm-upload-progress">
                <VProgressLinear :model-value="progress" color="primary" height="4" rounded="xl" />
                <div class="dfm-upload-progress__info"><span>{{ `${uploadData.currentFile} ${uploadInstanceTag}`.trim() }}</span><span>({{ uploadData.files[0] }}/{{ uploadData.files[1] }})</span><VBtn icon variant="text" size="small" @click="uploadData.suspending ? uploadService.unsuspend() : uploadService.suspend()"><VIcon :icon="uploadData.suspending ? 'mdi-play' : 'mdi-pause'" /></VBtn><VBtn icon variant="text" size="small" @click="uploadService.stop()"><VIcon icon="mdi-close" /></VBtn></div>
            </div>
            <div class="dfm-body" :style="{ opacity: opacity ? 0.4 : undefined }" @dragover.prevent="handleDragover" @dragleave.prevent="handleDragleave" @drop.prevent="handleDrop">
            <FileManagerTabs :active-tab="activeTab" :tabs="currentTabs" @select="handleChangeTab" @close="onEditTabs($event, 'remove')" @add="onEditTabs('', 'add')" @reorder="handleReorderTabs" />
            <template v-if="currentTabs.length">
            <FileManagerPathBar :breadcrumbs="breadcrumbs" :current-disk="currentDisk" :file-status="fileStatus" compact @select="handleChangeDir" @disk="toDisk" />

            <div class="dfm-table-wrapper" @mousedown="onTableMouseDown">
            <VDataTableServer v-model="selectedRowKeys" class="dfm-table" :headers="desktopFileHeaders" :items="dataSource || []" item-value="name" :loading="spinning" :items-length="operationForm.total" :items-per-page="operationForm.pageSize || 20" :page="operationForm.current || 1" :items-per-page-options="[25, 50, 100, 200]" show-select fixed-header density="compact" :row-props="getDesktopRowProps" @update:model-value="onDesktopSelectionChange" @update:page="(page) => handleTableChange({ current: page, pageSize: operationForm.pageSize || 20 })" @update:items-per-page="(size) => handleTableChange({ current: operationForm.current || 1, pageSize: size })">
                <template #loading><VProgressCircular indeterminate size="24" width="2" /></template>
                <template #item.name="{ item }"><span class="dfm-file-name"><VIcon :icon="getDesktopFileIcon(item.name, item.type)" size="small" />{{ item.name }}</span></template>
                <template #item.type="{ item }">{{ item.type === 1 ? filterFileName(item.name) : t("TXT_CODE_FILE_FOLDER") }}</template>
                <template #item.size="{ item }">{{ item.size ? convertFileSize(String(item.size)) : "--" }}</template>
                <template #item.time="{ item }">{{ item.time ? dayjs(item.time).format("YYYY-MM-DD HH:mm:ss") : "--" }}</template>
                <template #item.mode="{ item }">{{ item.mode ?? "--" }}</template>
                <template #no-data>
                  <Empty
                    icon="mdi-folder-open-outline"
                    :title="t('TXT_CODE_DESKTOP_FM_NO_FILES')"
                  />
                </template>
            </VDataTableServer>
            <div v-if="dragSelectVisible" class="dfm-drag-select-rect" :style="{ left: dragSelectRect.x + 'px', top: dragSelectRect.y + 'px', width: dragSelectRect.w + 'px', height: dragSelectRect.h + 'px' }"></div>
            </div>
            </template>
            </div>
        </div>

        <VMenu v-model="desktopContextMenu.open" :target="[desktopContextMenu.x, desktopContextMenu.y]" location="bottom start">
            <VList v-if="desktopContextMenu.record" min-width="190">
                <VListItem v-for="action in desktopRowMenu(desktopContextMenu.record)" :key="action.title" :title="action.title" :prepend-icon="action.icon" :base-color="action.color" @click="runDesktopMenuAction(action)" />
            </VList>
        </VMenu>

        <DesktopDialog
          v-bind="getDesktopDialogProps('archive-preview', 960, 600)"
          :title="`${t('TXT_CODE_ARCHIVE_PREVIEW')}: ${archivePreview.title}`"
          icon="mdi-archive-eye-outline"
          :model-value="archivePreview.show"
          :resizable="true"
          @close="closeArchivePreview"
          :padded="false"
          :scrollable="false"
        >
          <ArchivePreview compact :entries="archivePreview.entries" :loading="archivePreview.loading" />
          <template #footer>
            <VBtn variant="text" @click="closeArchivePreview">{{ t("TXT_CODE_COMMON_CANCEL") }}</VBtn>
          </template>
        </DesktopDialog>

        <DesktopDialog
          v-bind="getDesktopDialogProps('operation', 520, dialog.mode === 'unzip' ? 500 : dialog.mode === 'permission' ? 520 : 260)"
          :title="dialog.title"
          icon="mdi-file-cog-outline"
          :model-value="dialog.show"
          @close="dialog.cancel()"
        >
          <p>{{ dialog.info }}</p>
          <VTextField v-if="dialog.mode === '' || dialog.mode === 'zip'" v-model="dialog.value"
              density="compact" hide-details autofocus :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_CONTENT')" />
          <template v-if="dialog.mode === 'unzip'">
              <div class="dfm-dialog-label">{{ t("TXT_CODE_COMMON_PLEASE_SELECT_THE_DECOMPRESSION_MODE") }}</div>
              <VRadioGroup v-model="dialog.unzipmode" inline>
                  <VRadio value="0" :label="t('TXT_CODE_COMMON_TO_THE_CURRENT_DIR')" />
                  <VRadio value="1" :label="t('TXT_CODE_COMMON_TO_A_NEW_DIR')" />
              </VRadioGroup>
              <VTextField v-if="dialog.unzipmode === '1'" v-model="dialog.value"
                  density="compact" hide-details :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_THE_DIRECTORY_NAME')" />
              <div class="dfm-dialog-label">{{ t("TXT_CODE_COMMON_PLEASE_SELECT_THE_FORMAT_OF_THE_COMPRESSED_FILE") }}</div>
              <VRadioGroup v-model="dialog.code" inline>
                  <VRadio value="utf-8" label="UTF-8" />
                  <VRadio value="gbk" label="GBK" />
                  <VRadio value="big5" label="BIG5" />
              </VRadioGroup>
          </template>
          <template v-if="dialog.mode === 'permission'">
              <VProgressCircular v-if="permission.loading" indeterminate />
              <div v-for="item in permission.item" :key="item.key" class="dfm-permission">
                  <strong>{{ item.key }}</strong>
                  <VCheckbox v-model="permission.data[item.role]" value="4" :label="t('TXT_CODE_COMMON_READ')" hide-details />
                  <VCheckbox v-model="permission.data[item.role]" value="2" :label="t('TXT_CODE_COMMON_WRITE')" hide-details />
                  <VCheckbox v-model="permission.data[item.role]" value="1" :label="t('TXT_CODE_COMMON_EXECUTE')" hide-details />
              </div>
              <VCheckbox v-model="permission.deep" :label="t('TXT_CODE_COMMON_APPLY_TO_SUBDIRECTORIES')" hide-details />
          </template>
          <template #footer>
            <VBtn variant="text" @click="dialog.cancel()">{{ t("TXT_CODE_COMMON_CANCEL") }}</VBtn>
            <VBtn color="primary" variant="text" :loading="dialog.loading" @click="dialog.ok()">{{ t("TXT_CODE_COMMON_SAVE") }}</VBtn>
          </template>
        </DesktopDialog>

        <DesktopDialog
          v-bind="getDesktopDialogProps('download-url', 520, 300)"
          :title="t('TXT_CODE_COMMON_REMOTE_DOWNLOAD_RESOURCES')"
          icon="mdi-cloud-download-outline"
          :model-value="downloadDialog.show"
          @close="cancelDownloadDialog"
        >
          <VTextField v-model="downloadDialog.url" :label="t('TXT_CODE_COMMON_FILE_URL_ADDRESS')"
              density="compact" hide-details autofocus class="mb-1" />
          <VTextField v-model="downloadDialog.fileName" :label="t('TXT_CODE_COMMON_FILE_NAME')"
              density="compact" hide-details />
          <template #footer>
            <VBtn variant="text" @click="cancelDownloadDialog">{{ t("TXT_CODE_COMMON_CANCEL") }}</VBtn>
            <VBtn color="primary" variant="text" @click="submitDownloadDialog">{{ t("TXT_CODE_COMMON_CONFIRM") }}</VBtn>
          </template>
        </DesktopDialog>

        <component :is="ConfirmDialog" v-if="ConfirmDialog" v-model="uploadConfirmDialog.show"
            :id="getDesktopDialogProps('upload-confirm', 400, 220).id" :height="220"
            :title="t('TXT_CODE_COMMON_CONFIRM_UPLOAD')" :message="uploadConfirmDialog.name" :ok-text="t('TXT_CODE_COMMON_UPLOAD')"
            @cancel="handleUploadConfirmCancel" @confirm="handleUploadConfirmOk" />

        <component :is="ConfirmDialog" v-if="ConfirmDialog" v-model="overwriteDialog.show"
            :id="getDesktopDialogProps('overwrite-confirm', 400, 340).id" :height="340"
            :title="t('TXT_CODE_COMMON_OVERWRITING_FILE')" :ok-text="t('TXT_CODE_COMMON_UPLOAD')" :cancel-text="t('TXT_CODE_COMMON_SKIP')"
            @cancel="handleOverwriteCancel" @confirm="handleOverwriteOk">
            <p>{{ t("TXT_CODE_COMMON_THE_FILE_ALREADY_EXISTS_IN_THIS_FOLDER", { name: overwriteDialog.fileName }) }}</p>
            <VCheckbox v-model="overwriteDialog.overwrite" :label="t('TXT_CODE_COMMON_OVERWRITE')" hide-details />
            <VCheckbox v-if="overwriteDialog.count > 1" v-model="overwriteDialog.all"
                :label="t('TXT_CODE_COMMON_AND_MORE', { num: overwriteDialog.count - 1 })" hide-details />
        </component>

        <component :is="ConfirmDialog" v-if="ConfirmDialog" v-model="deleteDialog.show"
            :id="getDesktopDialogProps('delete-confirm', 400, 220).id" :height="220"
            :title="t('TXT_CODE_COMMON_CONFIRM_DELETION')" :message="t('TXT_CODE_COMMON_THIS_ACTION_CANNOT_BE_UNDONE')" danger :loading="deleteDialog.loading"
            @cancel="deleteDialog.resolve?.(false)" @confirm="deleteDialog.resolve?.(true)" />
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
}

.dfm-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 0 12px 12px;
}

.dfm-body > .v-alert {
    flex: 0 0 auto;
}

.dfm-file-name {
    color: inherit;
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.dfm-permission {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
    margin: 10px 0;
}

.dfm-table-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    user-select: none;
}

.dfm-table {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: transparent;
}

:deep(.dfm-table > .v-table__wrapper) {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
}

:deep(.dfm-table .v-data-table__th),
:deep(.dfm-table .v-data-table__td) {
    font-size: 12px;
}

:deep(.dfm-table .v-data-table__th) {
    border-bottom: 1px solid var(--desktop-window-border) !important;
    color: var(--desktop-window-text-secondary) !important;
    font-size: 11px !important;
    padding: 6px 10px !important;
}

:deep(.dfm-table .v-data-table__td) {
    border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)) !important;
    padding: 2px 8px !important;
    line-height: 1.4;
}

:deep(.dfm-table tbody tr:hover > td) {
    background: var(--desktop-window-control-hover) !important;
}

:deep(.dfm-table .v-data-table-footer) {
    flex-shrink: 0;
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

.dfm-vuetify { min-width: 0; }
.dfm-vuetify .dfm-toolbar > .v-input { max-width: 260px; }
.dfm-dialog-label { margin: 12px 0 4px; font-weight: 600; }
</style>
