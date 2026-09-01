<script setup lang="ts">
import { t } from "@/lang/i18n";
import { usePluginService } from "@/plugin/context";
import type { FrontendFileManagerService } from "@/plugin";
import { convertFileSize } from "@/tools/fileSize";
import type { ArchiveEntry } from "@/types/fileManager";
import dayjs from "dayjs";
import { computed, ref, watch } from "vue";

type ArchiveTreeEntry = ArchiveEntry & {
  key: string;
  children?: ArchiveTreeEntry[];
};

/**
 * The file-type icons belong to `plugins/filemanager`. Reading the service
 * through a `computed` keeps the preview reactive to the plugin being loaded or
 * unloaded; without it the rows simply show no icon.
 */
const fileManager = computed(() => usePluginService<FrontendFileManagerService>("filemanager"));
const getFileIcon = (name: string, type?: number) =>
  fileManager.value?.getFileIcon(name, type);

const props = defineProps<{
  entries: ArchiveEntry[];
  loading?: boolean;
  compact?: boolean;
}>();

const treeEntries = computed<ArchiveTreeEntry[]>(() => {
  const roots: ArchiveTreeEntry[] = [];
  const nodes = new Map<string, ArchiveTreeEntry>();

  for (const source of props.entries) {
    const normalizedName = source.name.replace(/\\/g, "/").replace(/^\.\//, "");
    const parts = normalizedName.split("/").filter(Boolean);
    let parent: ArchiveTreeEntry | undefined;
    let parentPath = "";

    parts.forEach((part, index) => {
      const nodePath = parentPath ? `${parentPath}/${part}` : part;
      const isLeaf = index === parts.length - 1;
      let node = nodes.get(nodePath);

      if (!node) {
        node = {
          key: nodePath,
          name: part,
          size: isLeaf ? source.size : 0,
          compressedSize: isLeaf ? source.compressedSize : 0,
          time: isLeaf ? source.time : "",
          type: isLeaf ? source.type : 0,
          children: []
        };
        nodes.set(nodePath, node);
        if (parent) parent.children!.push(node);
        else roots.push(node);
      } else if (isLeaf) {
        // An explicit directory entry can be encountered before its children.
        node.size = source.size;
        node.compressedSize = source.compressedSize;
        node.time = source.time;
        node.type = source.type;
      }

      if (!isLeaf) node.type = 0;
      parent = node;
      parentPath = nodePath;
    });
  }

  const sortTree = (items: ArchiveTreeEntry[]) => {
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type - b.type;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
    items.forEach((item) => {
      if (item.children?.length) sortTree(item.children);
      else delete item.children;
    });
  };
  sortTree(roots);
  return roots;
});

const expandedRowKeys = ref<string[]>([]);
const getExpandableKeys = (items: ArchiveTreeEntry[]): string[] => {
  const keys: string[] = [];
  for (const item of items) {
    if (item.children?.length) {
      keys.push(item.key, ...getExpandableKeys(item.children));
    }
  }
  return keys;
};

watch(
  treeEntries,
  (entries) => {
    expandedRowKeys.value = getExpandableKeys(entries);
  },
  { immediate: true }
);

const getRowKey = (entry: ArchiveTreeEntry) => entry.key;
const handleExpandedRowsChange = (keys: (string | number)[]) => {
  expandedRowKeys.value = keys.map(String);
};
const tableExpandedRowKeys = expandedRowKeys;
</script>

<template>
  <div class="archive-preview" :class="{ 'archive-preview--compact': compact }">
    <div class="archive-preview__table-wrap">
      <div class="archive-preview__table-header" role="row">
        <div role="columnheader">{{ t("TXT_CODE_94c193de") }}</div>
        <div role="columnheader">{{ t("TXT_CODE_67d68dd1") }}</div>
        <div role="columnheader">{{ t("TXT_CODE_94bb113a") }}</div>
        <div role="columnheader">{{ t("TXT_CODE_ARCHIVE_COMPRESSED_SIZE") }}</div>
        <div role="columnheader">{{ t("TXT_CODE_d3b29478") }}</div>
      </div>
      <a-table
        :loading="loading"
        :data-source="treeEntries"
        :row-key="getRowKey"
        :expanded-row-keys="tableExpandedRowKeys"
        @expanded-rows-change="handleExpandedRowsChange"
        :show-header="false"
        size="small"
        :pagination="{
          pageSize: compact ? 50 : 100,
          hideOnSinglePage: true,
          showSizeChanger: true
        }"
      >
        <a-table-column data-index="name" :width="360">
          <template #default="{ record }">
            <div class="archive-preview__name">
              <component :is="getFileIcon(record.name, record.type)" />
              <span :title="record.name">{{ record.name }}</span>
            </div>
          </template>
        </a-table-column>
        <a-table-column data-index="type" :width="100">
          <template #default="{ record }">
            {{ record.type === 0 ? t("TXT_CODE_e5f949c") : t("TXT_CODE_d4cf1cb8") }}
          </template>
        </a-table-column>
        <a-table-column data-index="size" :width="120">
          <template #default="{ record }">
            {{ record.type === 0 ? "--" : convertFileSize(String(record.size)) }}
          </template>
        </a-table-column>
        <a-table-column
          data-index="compressedSize"
          :width="130"
        >
          <template #default="{ record }">
            {{
              record.type === 0 || !record.compressedSize
                ? "--"
                : convertFileSize(String(record.compressedSize))
            }}
          </template>
        </a-table-column>
        <a-table-column data-index="time" :width="180">
          <template #default="{ record }">
            {{ record.type === 0 || !record.time ? "--" : dayjs(record.time).format("YYYY-MM-DD HH:mm:ss") }}
          </template>
        </a-table-column>
      </a-table>
    </div>
  </div>
</template>

<style scoped>
.archive-preview {
  display: flex;
  flex-direction: column;
  min-height: 420px;
  width: 100%;
  min-width: 0;
}

.archive-preview--compact {
  min-height: 0;
  height: 100%;
  padding: 12px;
  box-sizing: border-box;
}

.archive-preview__table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.archive-preview__table-header {
  display: grid;
  grid-template-columns: 360px 100px 120px 130px minmax(180px, 1fr);
  width: 100%;
  min-width: 890px;
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--background-color, #f5f5f5);
  color: var(--desktop-window-text-secondary, var(--text-color));
  border-bottom: 1px solid var(--desktop-window-border, var(--color-gray-4));
}

.archive-preview__table-header > div {
  box-sizing: border-box;
  min-width: 0;
  overflow: hidden;
  padding: 7px 10px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-preview__name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.archive-preview__name :deep(.anticon) {
  flex: 0 0 16px;
  width: 16px;
  min-width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* The desktop preview is teleported outside .dfm, so it needs its own table theme. */
.archive-preview--compact :deep(.ant-table-wrapper),
.archive-preview--compact :deep(.ant-spin-nested-loading),
.archive-preview--compact :deep(.ant-spin-container) {
  width: 100%;
  min-width: 0;
}

.archive-preview--compact .archive-preview__table-wrap :deep(.ant-table-wrapper) {
  min-height: 0;
}

.archive-preview--compact :deep(.ant-table) {
  color: var(--desktop-window-text);
  background: transparent;
  font-size: 12px;
}

.archive-preview :deep(.ant-table-container table) {
  width: 100% !important;
  min-width: 890px !important;
  table-layout: fixed !important;
}

.archive-preview--compact :deep(.ant-table-container),
.archive-preview--compact :deep(.ant-table-content),
.archive-preview--compact :deep(.ant-table-body) {
  background: transparent;
}

.archive-preview--compact .archive-preview__table-header {
  background: var(--background-color, #f5f5f5);
  color: var(--desktop-window-text-secondary);
  border-bottom-color: var(--desktop-window-border);
}

.archive-preview--compact :deep(.ant-table-tbody > tr > td) {
  color: var(--desktop-window-text) !important;
  background: transparent !important;
  border-bottom: 1px solid var(--desktop-window-border) !important;
  padding: 6px 10px;
}

.archive-preview--compact :deep(.ant-table-tbody > tr:hover > td) {
  background: var(--desktop-window-control-hover) !important;
}

.archive-preview__name span {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
