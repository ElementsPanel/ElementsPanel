<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import FileManagerTabs from "../components/FileManagerTabs.vue";
import ArchivePreview from "../components/ArchivePreview.vue";
import UploadTaskProgress from "../components/UploadTaskProgress.vue";
import { useDownloadFileDialog } from "../dialogs";
import { useFileManager } from "../hooks/useFileManager";
import { useScreen } from "@elementspanel/epanel-plugin-console/hooks/useScreen";
import { t } from "@elementspanel/epanel-plugin-i18n";
import uploadService from "../services/uploadService";
import { filterFileName, getFileExtName, isCompressFile } from "../tools/fileManager";
import { convertFileSize } from "@elementspanel/epanel-plugin-console/tools/fileSize";
import type { DataType } from "@elementspanel/epanel-plugin-console/types/fileManager";
import dayjs from "dayjs";
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  VAlert,
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCheckbox,
  VCol,
  VContainer,
  VDataTableServer,
  VDialog,
  VFileInput,
  VIcon,
  VList,
  VListItem,
  VMenu,
  VProgressLinear,
  VRadio,
  VRadioGroup,
  VRow,
  VSelect,
  VSpacer,
  VTextField
} from "vuetify/components";
import FileEditor from "./FileEditor.vue";

const route = useRoute();
const instanceId = String(route.query.instanceId ?? "");
const daemonId = String(route.query.daemonId ?? "");
const pageTitle = computed(() => t("TXT_CODE_COMMON_FILE_MANAGEMENT"));

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
  archivePreview,
  previewArchiveFile,
  closeArchivePreview,
  deleteDialog
} = useFileManager(instanceId, daemonId);

const isShowDiskList = computed(
  () =>
    fileStatus.value?.platform === "win32" &&
    fileStatus.value.isGlobalInstance &&
    fileStatus.value.disks.includes(currentDisk.value)
);

const tableHeaders = computed(() => {
  const headers: { title: string; key: string; sortable: boolean }[] = [
    { title: t("TXT_CODE_FILE_NAME"), key: "name", sortable: false },
    { title: t("TXT_CODE_FILE_TYPE"), key: "type", sortable: false },
    { title: t("TXT_CODE_COMMON_SIZE"), key: "size", sortable: false },
    { title: t("TXT_CODE_COMMON_LAST_MODIFY"), key: "time", sortable: false }
  ];
  if (!isPhone.value && fileStatus.value?.platform !== "win32") {
    headers.push({ title: t("TXT_CODE_FILE_PERMISSIONS"), key: "mode", sortable: false });
  }
  if (!isMultiple.value) headers.push({ title: t("TXT_CODE_COMMON_ACTIONS"), key: "actions", sortable: false });
  return headers;
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
    uploadData.value.instanceInfo.instanceId != instanceId ||
    uploadData.value.instanceInfo.daemonId != daemonId
  ) {
    return `(${t("TXT_CODE_COMMON_UPLOADING_TO_OTHER_INSTANCES")})`;
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

const FileEditorDialog = ref<InstanceType<typeof FileEditor>>();

const opacity = ref(false);
const handleDragover = (e: DragEvent) => {
  e.preventDefault();
  if (!currentTabs.value.length) return;
  opacity.value = true;
};

const handleDragleave = (e: DragEvent) => {
  e.preventDefault();
  opacity.value = false;
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  const files = e.dataTransfer?.files;
  opacity.value = false;
  if (!currentTabs.value.length || !files) return;
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
  dropConfirm.name = name;
  dropConfirm.files = [...files];
  dropConfirm.open = true;
};
const dropConfirm = reactive({ open: false, name: "", files: [] as File[] });
const confirmDrop = () => {
  const files = [...dropConfirm.files];
  dropConfirm.open = false;
  dropConfirm.files = [];
  selectedFiles(files);
};
const fileList = ref<File[]>([]);
const openFilePicker = () => {
  const input = document.querySelector<HTMLInputElement>(".file-upload-input input[type=file]");
  input?.click();
};
const onFileSelect = (files: File[] | File | null) => {
  const selected = Array.isArray(files) ? files : files ? [files] : [];
  if (!selected.length) return;
  fileList.value = [];
  selectedFiles(selected);
};

const editFile = (fileName: string) => {
  const path = currentPath.value + fileName;
  FileEditorDialog.value?.openDialog(path, fileName);
};

const handleClickFile = async (file: DataType) => {
  if (file.type === 0) return rowClickTable(file.name, file.type);
  if (isCompressFile(file.name)) return previewArchiveFile(file.name);
  const fileExtName = getFileExtName(file.name);
  if (isImage(fileExtName)) return showImage(file);
  return editFile(file.name);
};

type FileMenuAction = {
  label: string;
  key: string;
  icon: string;
  color?: string;
  condition?: () => boolean;
  onClick: () => void;
};

const menuList = (record: DataType): FileMenuAction[] =>
  [
    {
      label: t("TXT_CODE_ARCHIVE_PREVIEW"),
      key: "previewArchive",
      icon: "mdi-archive-eye-outline",
      onClick: () => previewArchiveFile(record.name),
      condition: () => !isMultiple.value && record.type === 1 && isCompressFile(record.name)
    },
    {
      label: t("TXT_CODE_COMMON_UNZIP"),
      key: "unzip",
      icon: "mdi-archive-arrow-down-outline",
      onClick: () => unzipFile(record.name),
      condition: () => record.type === 1 && isCompressFile(record.name)
    },
    {
      label: t("TXT_CODE_COMMON_EDIT"),
      key: "edit",
      icon: "mdi-pencil-outline",
      onClick: () => editFile(record.name),
      condition: () => !isMultiple.value && record.type === 1
    },
    {
      label: t("TXT_CODE_COMMON_DOWNLOAD"),
      key: "download",
      icon: "mdi-download-outline",
      onClick: () => downloadFile(record.name),
      condition: () => !isMultiple.value && record.type === 1
    },
    {
      label: t("TXT_CODE_COMMON_CUT"),
      key: "cut",
      icon: "mdi-content-cut",
      onClick: () => setClipBoard("move")
    },
    {
      label: t("TXT_CODE_COMMON_COPY"),
      key: "copy",
      icon: "mdi-content-copy",
      onClick: () => setClipBoard("copy")
    },
    {
      label: t("TXT_CODE_COMMON_RENAME"),
      key: "rename",
      icon: "mdi-form-textbox",
      onClick: () => resetName(record.name),
      condition: () => !isMultiple.value
    },
    {
      label: t("TXT_CODE_COMMON_CHANGE_PERMISSIONS"),
      key: "changePermission",
      icon: "mdi-key-outline",
      onClick: () => changePermission(record.name, record.mode),
      condition: () => fileStatus.value?.platform !== "win32"
    },
    {
      label: t("TXT_CODE_COMMON_COMPRESS"),
      key: "zip",
      icon: "mdi-archive-arrow-up-outline",
      onClick: () => zipFile()
    },
    {
      label: t("TXT_CODE_COMMON_DELETE"),
      key: "delete",
      icon: "mdi-delete-outline",
      color: "error",
      onClick: () => deleteFile(record.name)
    }
  ].filter((item) => !item.condition || item.condition());

const rowMenuItems = (record: DataType) => menuList(record);
const actionMenuItems = computed<FileMenuAction[]>(() => [
  { label: t("TXT_CODE_COMMON_CUT"), key: "cut", icon: "mdi-content-cut", onClick: () => setClipBoard("move") },
  { label: t("TXT_CODE_COMMON_COPY"), key: "copy", icon: "mdi-content-copy", onClick: () => setClipBoard("copy") },
  { label: t("TXT_CODE_COMMON_CHANGE_PERMISSIONS"), key: "changePermission", icon: "mdi-key-outline", onClick: () => changePermission("", 0), condition: () => fileStatus.value?.platform !== "win32" },
  { label: t("TXT_CODE_COMMON_COMPRESS"), key: "zip", icon: "mdi-archive-arrow-up-outline", onClick: () => zipFile() },
  { label: t("TXT_CODE_COMMON_DELETE"), key: "delete", icon: "mdi-delete-outline", color: "error", onClick: () => deleteFile() }
].filter((item) => !item.condition || item.condition()));
const runMenuAction = (item: FileMenuAction, record: DataType) => {
  oneSelected(record.name, record);
  item.onClick();
};
const rawFile = (item: any): DataType => item?.raw ?? item;
const getMdiIconName = (file: DataType) => {
  if (file.type === 0) return "mdi-folder-outline";
  const ext = getFileExtName(file.name).toLowerCase();
  if (isCompressFile(file.name)) return "mdi-folder-zip-outline";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(ext)) return "mdi-file-image-outline";
  if (["mp3", "wav", "ogg", "flac", "mp4", "mkv", "mov"].includes(ext)) return "mdi-file-music-outline";
  if (["js", "ts", "json", "css", "scss", "html", "vue", "xml", "yml", "yaml"].includes(ext)) return "mdi-file-code-outline";
  return "mdi-file-outline";
};
const handleSelectedKeys = (keys: readonly any[]) => {
  const normalized = keys.map(String);
  const rows = (dataSource.value || []).filter((item) => normalized.includes(item.name));
  selectChanged(normalized, rows);
};
const handleTableOptions = (options: { page: number; itemsPerPage: number }) => {
  handleTableChange({ current: options.page, pageSize: options.itemsPerPage });
};

const handleTabChange = (key: unknown) => {
  if (typeof key === "string") void handleChangeTab(key);
};

const handleRightClickRow = (e: MouseEvent, record: DataType) => {
  e.preventDefault();
  e.stopPropagation();
  oneSelected(record.name, record);
  contextMenu.open = false;
  contextMenu.x = e.clientX;
  contextMenu.y = e.clientY;
  contextMenu.record = record;
  nextTick(() => (contextMenu.open = true));
  return false;
};
const contextMenu = reactive({ open: false, x: 0, y: 0, record: null as DataType | null });
const getRowProps = ({ item }: { item: unknown }) => ({
  onContextmenu: (event: MouseEvent) => handleRightClickRow(event, rawFile(item))
});
const dialogMaxWidth = computed(() => (dialog.value.style as { maxWidth?: string })?.maxWidth || "460px");

const downloadFromURLFile = async () => {
  const data = await useDownloadFileDialog();
  if (!data) return;
  await downloadFromUrl(data);
};

onMounted(async () => {
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
});

onUnmounted(() => {
  if (task) clearInterval(task);
  task = undefined;
});
</script>

<template>
  <main class="file-manager-page" :style="{ opacity: opacity ? 0.45 : 1 }" @dragover="handleDragover" @dragleave="handleDragleave" @drop="handleDrop">
    <VContainer fluid class="file-manager-container">
      <VRow class="file-manager-toolbar align-center" density="comfortable">
        <VCol cols="12" lg="3" class="file-manager-title">
          <VIcon icon="mdi-folder-open-outline" size="28" />
          <span>{{ pageTitle }}</span>
        </VCol>
        <VCol cols="12" lg="4" class="file-manager-search">
          <VTextField
            :disabled="!currentTabs.length"
            v-model.trim.lazy="operationForm.name"
            :label="t('TXT_CODE_COMMON_SEARCH_BY_FILE_NAME')"
            prepend-inner-icon="mdi-magnify"
            hide-details
            clearable
            density="comfortable"
            variant="solo-filled"
            @change="handleSearchChange"
            @click:clear="operationForm.name = ''; handleSearchChange()"
          />
        </VCol>
        <VCol cols="12" lg="5" class="file-manager-actions">
          <span class="selected-count" :class="{ 'selected-count-empty': !selectedRowKeys.length }">
            {{ `${t("TXT_CODE_COMMON_SELECT")} ${String(selectedRowKeys.length)} ${t("TXT_CODE_COMMON_ITEMS")}` }}
          </span>
          <VBtn :disabled="!currentTabs.length" variant="text" prepend-icon="mdi-link-variant" @click="downloadFromURLFile">{{ t("TXT_CODE_COMMON_REMOTE_DOWNLOAD") }}</VBtn>
          <VFileInput :disabled="!currentTabs.length" v-model="fileList" class="file-upload-input" multiple hide-details hide-input accept="*/*" @update:model-value="onFileSelect" />
          <VBtn :disabled="!currentTabs.length" variant="text" prepend-icon="mdi-upload" @click="openFilePicker">{{ t("TXT_CODE_FILE_UPLOAD") }}</VBtn>
          <VBtn :disabled="!currentTabs.length" v-if="clipboard?.value?.length" color="primary" variant="text" @click="paste">{{ t("TXT_CODE_COMMON_PASTE_FILES") }}</VBtn>
          <VBtn :disabled="!currentTabs.length" v-else variant="text" prepend-icon="mdi-refresh" @click="reloadList">{{ t("TXT_CODE_FILE_LIST_REFRESH") }}</VBtn>
          <VMenu :disabled="!currentTabs.length" location="bottom end">
            <template #activator="{ props: menuProps }">
              <VBtn :disabled="!currentTabs.length" v-bind="menuProps" color="primary" append-icon="mdi-chevron-down">{{ isMultiple ? t("TXT_CODE_COMMON_BATCH_OPERATION") : t("TXT_CODE_COMMON_NEW") }}</VBtn>
            </template>
            <VList>
              <template v-if="isMultiple">
                <VListItem v-for="item in actionMenuItems" :key="item.key" :title="item.label" :prepend-icon="item.icon" :base-color="item.color" @click="item.onClick" />
              </template>
              <template v-else>
                <VListItem :title="t('TXT_CODE_COMMON_BLANK_FILE')" prepend-icon="mdi-file-plus-outline" @click="touchFile()" />
                <VListItem :title="t('TXT_CODE_COMMON_DIRECTORY')" prepend-icon="mdi-folder-plus-outline" @click="touchFile(true)" />
              </template>
            </VList>
          </VMenu>
        </VCol>
      </VRow>

      <VCard class="file-manager-card" flat rounded="xl">
        <VCardText>
          <div v-if="uploadData.current" class="upload-status">
            <div class="upload-status-line">
              <span class="upload-file-name">{{ `${uploadData.currentFile} ${uploadInstanceTag}`.trim() }}</span>
              <span>({{ uploadData.files[0] }}/{{ uploadData.files[1] }})</span>
              <div class="upload-task-list"><UploadTaskProgress v-for="(uTask, i) in uploadService.task.filter((v) => v)" :key="i" :progress="uTask!.progress / (uTask!.rangeEnd - uTask!.rangeStart)" :retries="uTask!.retries" /></div>
              <VBtn v-if="uploadData.suspending" icon="mdi-play" size="small" variant="text" @click="uploadService.unsuspend()" />
              <VBtn v-else icon="mdi-pause" size="small" variant="text" @click="uploadService.suspend()" />
              <VBtn icon="mdi-close" size="small" variant="text" @click="uploadService.stop()" />
            </div>
            <div class="upload-progress-line"><VProgressLinear :model-value="progress" color="primary" height="6" rounded="xl" /><span>{{ convertFileSize(uploadData.current![0].toString()) }} / {{ convertFileSize(uploadData.current![1].toString()) }}</span></div>
          </div>

          <FileManagerTabs :active-tab="activeTab" :tabs="currentTabs" @select="handleTabChange" @close="onEditTabs($event, 'remove')" @add="onEditTabs('', 'add')" />

          <template v-if="currentTabs.length">
          <div class="path-row">
            <VSelect v-if="isShowDiskList" v-model="currentDisk" :items="(fileStatus?.disks || []).map((disk: string) => ({ title: `${disk}:`, value: disk }))" class="disk-select" density="compact" hide-details @update:model-value="toDisk">
              <template #no-data><Empty :icon="false" compact /></template>
            </VSelect>
            <div class="file-breadcrumbs">
              <template v-for="(item, index) in breadcrumbs" :key="item.path">
                <VBtn variant="text" size="small" class="file-breadcrumbs-item" @click="handleChangeDir(item.path)">{{ item.name }}</VBtn>
                <span v-if="index < breadcrumbs.length - 1" class="breadcrumb-separator">&gt;</span>
              </template>
            </div>
          </div>



          <VDataTableServer
            :model-value="selectedRowKeys"
            :headers="tableHeaders"
            :items="dataSource || []"
            item-value="name"
            show-select
            :loading="spinning"
            :items-length="operationForm.total"
            :items-per-page="operationForm.pageSize"
            :page="operationForm.current"
            :items-per-page-options="[25, 50, 100, 200]"
            :row-props="getRowProps"
            class="file-table"
            @update:model-value="handleSelectedKeys"
            @update:options="handleTableOptions"
          >
            <template #no-data><Empty icon="mdi-folder-open-outline" /></template>
            <template #item.name="{ item }">
              <VBtn variant="text" class="file-name" @click="handleClickFile(rawFile(item))"><VIcon :icon="getMdiIconName(rawFile(item))" size="18" class="mr-2" />{{ rawFile(item).name }}</VBtn>
            </template>
            <template #item.type="{ item }">{{ rawFile(item).type === 0 ? t("TXT_CODE_FILE_FOLDER") : filterFileName(rawFile(item).name) }}</template>
            <template #item.size="{ item }">{{ rawFile(item).type === 0 || !rawFile(item).size ? "--" : convertFileSize(String(rawFile(item).size)) }}</template>
            <template #item.time="{ item }">{{ rawFile(item).type === 0 ? "--" : dayjs(rawFile(item).time).format("YYYY-MM-DD HH:mm:ss") }}</template>
            <template #item.mode="{ item }">{{ rawFile(item).mode || "--" }}</template>
            <template #item.actions="{ item }">
              <VMenu location="bottom end">
                <template #activator="{ props: menuProps }"><VBtn v-bind="menuProps" size="small" variant="text" append-icon="mdi-chevron-down">{{ t("TXT_CODE_COMMON_ACTIONS") }}</VBtn></template>
                <VList><VListItem v-for="action in rowMenuItems(rawFile(item))" :key="action.key" :title="action.label" :prepend-icon="action.icon" :base-color="action.color" @click="runMenuAction(action, rawFile(item))" /></VList>
              </VMenu>
            </template>
          </VDataTableServer>
          </template>
        </VCardText>
      </VCard>
    </VContainer>

    <VMenu v-model="contextMenu.open" :target="[contextMenu.x, contextMenu.y]" location="bottom start">
      <VList v-if="contextMenu.record" min-width="190"><VListItem v-for="action in rowMenuItems(contextMenu.record)" :key="action.key" :title="action.label" :prepend-icon="action.icon" :base-color="action.color" @click="runMenuAction(action, contextMenu.record!)" /></VList>
    </VMenu>

    <VDialog v-model="dropConfirm.open" class="app-dialog" max-width="460" persistent><VCard :title="t('TXT_CODE_COMMON_CONFIRM_UPLOAD')" rounded="xl"><VCardText>{{ dropConfirm.name }}</VCardText><VCardActions><VSpacer /><VBtn variant="text" @click="dropConfirm.open = false">{{ t("TXT_CODE_COMMON_CANCEL") }}</VBtn><VBtn color="primary" @click="confirmDrop">{{ t("TXT_CODE_COMMON_UPLOAD") }}</VBtn></VCardActions></VCard></VDialog>

    <VDialog v-model="dialog.show" class="app-dialog" :max-width="dialogMaxWidth" scrollable>
      <VCard :title="dialog.title" rounded="xl"><VCardText>
        <p v-if="dialog.info">{{ dialog.info }}</p>
        <VTextField v-if="dialog.mode === ''" v-model="dialog.value" :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_CONTENT')" autofocus />
        <div v-if="dialog.mode === 'zip'" class="dialog-stack"><VTextField v-model="dialog.value" :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_THE_NAME_FOR_THE_ARCHIVE')" suffix=".zip" /><div>{{ t("TXT_CODE_COMMON_ZIP_FILES_USE_UTF_8_SELECT_UTF_8_WHEN_EXTRACTING_THEM") }}</div></div>
        <div v-if="dialog.mode === 'unzip'" class="dialog-stack"><strong>{{ t("TXT_CODE_COMMON_PLEASE_SELECT_THE_DECOMPRESSION_MODE") }}</strong><VRadioGroup v-model="dialog.unzipmode" inline><VRadio value="0" :label="t('TXT_CODE_COMMON_TO_THE_CURRENT_DIR')" /><VRadio value="1" :label="t('TXT_CODE_COMMON_TO_A_NEW_DIR')" /></VRadioGroup><VTextField v-if="dialog.unzipmode === '1'" v-model="dialog.value" :placeholder="t('TXT_CODE_COMMON_PLEASE_ENTER_THE_DIRECTORY_NAME')" /><strong>{{ t("TXT_CODE_COMMON_PLEASE_SELECT_THE_FORMAT_OF_THE_COMPRESSED_FILE") }}</strong><div class="dialog-help">{{ t("TXT_CODE_COMMON_FOR_GARBLED_FILENAMES_TRY_GBK_FOR_MAINLAND_CHINA_BIG5_FOR_TAIWAN_OR_HONG_KONG_AND_UTF") }}</div><VRadioGroup v-model="dialog.code" inline><VRadio value="utf-8" label="UTF-8" /><VRadio value="gbk" label="GBK" /><VRadio value="big5" label="BIG5" /></VRadioGroup></div>
        <div v-if="dialog.mode === 'permission'" class="permission-grid"><div v-for="item in permission.item" :key="item.role"><strong>{{ item.key }}</strong><VCheckbox v-model="permission.data[item.role]" value="4" :label="t('TXT_CODE_COMMON_READ')" hide-details /><VCheckbox v-model="permission.data[item.role]" value="2" :label="t('TXT_CODE_COMMON_WRITE')" hide-details /><VCheckbox v-model="permission.data[item.role]" value="1" :label="t('TXT_CODE_COMMON_EXECUTE')" hide-details /></div><VCheckbox v-model="permission.deep" :label="t('TXT_CODE_COMMON_APPLY_TO_SUBDIRECTORIES')" hide-details /></div>
      </VCardText><VCardActions><VSpacer /><VBtn variant="text" @click="dialog.cancel()">{{ t("TXT_CODE_COMMON_CANCEL") }}</VBtn><VBtn color="primary" :loading="dialog.loading" @click="dialog.ok()">{{ t("TXT_CODE_COMMON_CONFIRM") }}</VBtn></VCardActions></VCard>
    </VDialog>

    <VDialog v-model="archivePreview.show" class="app-dialog" max-width="1100" scrollable @after-leave="closeArchivePreview"><VCard :title="`${t('TXT_CODE_ARCHIVE_PREVIEW')}: ${archivePreview.title}`" rounded="xl"><VCardText><ArchivePreview :entries="archivePreview.entries" :loading="archivePreview.loading" /></VCardText><VCardActions><VSpacer /><VBtn variant="text" @click="closeArchivePreview">{{ t("TXT_CODE_COMMON_CANCEL") }}</VBtn></VCardActions></VCard></VDialog>
    <VDialog v-model="deleteDialog.show" class="app-dialog" max-width="460" persistent><VCard :title="t('TXT_CODE_COMMON_CONFIRM_DELETION')" rounded="xl"><VCardText class="text-error">{{ t("TXT_CODE_COMMON_THIS_ACTION_CANNOT_BE_UNDONE") }}</VCardText><VCardActions><VSpacer /><VBtn variant="text" @click="deleteDialog.resolve && deleteDialog.resolve(false)">{{ t("TXT_CODE_COMMON_CANCEL") }}</VBtn><VBtn color="error" :loading="deleteDialog.loading" @click="deleteDialog.resolve && deleteDialog.resolve(true)">{{ t("TXT_CODE_COMMON_CONFIRM") }}</VBtn></VCardActions></VCard></VDialog>
    <FileEditor v-if="daemonId && instanceId" ref="FileEditorDialog" :daemon-id="daemonId" :instance-id="instanceId" @save="getFileList" />
  </main>
</template>

<style lang="scss" scoped>
.file-manager-page {
  width: 100%;
  min-height: 100%;
  overflow-x: hidden;
  box-sizing: border-box;
  transition: opacity 0.15s ease;
}

.file-manager-container {
  width: 100%;
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 20px 24px 32px;
  box-sizing: border-box;
}

.file-manager-toolbar {
  width: 100%;
  margin-bottom: 16px;
}

.file-manager-toolbar > .v-col {
  min-width: 0;
}

.file-manager-title,
.file-manager-search,
.file-manager-actions {
  display: flex;
  align-items: center;
}

.file-manager-title {
  gap: 10px;
  color: var(--text-color);
  font-size: 20px;
  font-weight: 600;
}

.file-manager-search {
  justify-content: center;
}

.file-manager-actions {
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.file-upload-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.file-manager-card {
  overflow: hidden;
  background: var(--background-color-white);
}

.file-manager-card > :deep(.v-card-text) {
  padding: 20px;
}

.upload-status {
  margin-bottom: 12px;
}

.upload-status-line,
.upload-progress-line,
.upload-task-list,
.path-row {
  display: flex;
  align-items: center;
}

.upload-status-line {
  min-width: 0;
  gap: 6px;
}

.upload-file-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-task-list {
  gap: 3px;
}

.upload-progress-line {
  gap: 12px;
  margin-top: 4px;
  font-size: 12px;
  white-space: nowrap;
}

.path-row {
  --file-manager-path-height: 32px;
  align-items: stretch;
  gap: 10px;
  margin-bottom: 16px;
}

.disk-select {
  flex: 0 0 125px;
}

.disk-select :deep(.v-field) {
  --v-input-control-height: var(--file-manager-path-height);
  --v-field-input-padding-top: 0px;
  --v-field-input-padding-bottom: 0px;
}

.selected-count {
  white-space: nowrap;
  color: var(--color-gray-7);
  font-size: 12px;
}

.selected-count-empty {
  visibility: hidden;
}

.file-name {
  max-width: min(440px, 42vw);
  justify-content: flex-start;
  color: inherit;
  text-transform: none;

  &:hover {
    color: rgb(var(--v-theme-primary));
  }
}

.file-table {
  background: transparent;
}

.file-table :deep(th),
.file-table :deep(td) {
  white-space: nowrap;
}

.file-breadcrumbs {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: var(--file-manager-path-height);
  align-items: center;
  overflow-x: auto;
  padding: 2px 8px;
  border-radius: 16px;
  background: var(--color-gray-2);

  .file-breadcrumbs-item {
    min-width: 32px;
    padding: 0 8px;
    text-transform: none;
  }
}

.breadcrumb-separator {
  color: var(--color-gray-7);
  font-size: 12px;
}

.dialog-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dialog-help {
  color: var(--color-gray-7);
  font-size: 12px;
}

.permission-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 992px) {
  .file-manager-container {
    padding: 16px 12px 28px;
  }

  .file-manager-title {
    font-size: 18px;
  }

  .file-manager-search,
  .file-manager-actions {
    justify-content: flex-start;
  }

  .path-row,
  .permission-grid {
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .path-row {
    display: grid;
    grid-auto-rows: 1fr;
  }

  .disk-select {
    flex-basis: auto;
    width: 100%;
  }

  .file-name {
    max-width: 55vw;
  }
}
</style>
