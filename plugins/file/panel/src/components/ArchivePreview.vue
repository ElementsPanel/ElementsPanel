<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { convertFileSize } from "@elementspanel/epanel-plugin-console/tools/fileSize";
import type { ArchiveEntry } from "@elementspanel/epanel-plugin-console/types/fileManager";
import dayjs from "dayjs";
import { computed } from "vue";
import { VDataTable, VIcon } from "vuetify/components";

type ArchiveTreeEntry = ArchiveEntry & {
  key: string;
  depth: number;
  children?: ArchiveTreeEntry[];
};

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
          depth: index,
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

// Flatten archive entries with depth because VDataTable does not recursively render children.
const flatEntries = computed(() => {
  const result: ArchiveTreeEntry[] = [];
  const visit = (items: ArchiveTreeEntry[]) => {
    for (const item of items) {
      result.push(item);
      if (item.children?.length) visit(item.children);
    }
  };
  visit(treeEntries.value);
  return result;
});
const archiveHeaders = [
  { title: t("TXT_CODE_FILE_NAME"), key: "name", width: 360, sortable: false },
  { title: t("TXT_CODE_FILE_TYPE"), key: "type", width: 100, sortable: false },
  { title: t("TXT_CODE_COMMON_SIZE"), key: "size", width: 120, sortable: false },
  { title: t("TXT_CODE_ARCHIVE_COMPRESSED_SIZE"), key: "compressedSize", width: 130, sortable: false },
  { title: t("TXT_CODE_COMMON_LAST_MODIFY"), key: "time", width: 180, sortable: false }
];
const getMdiIconName = (entry: ArchiveTreeEntry) => {
  if (entry.type === 0) return "mdi-folder-outline";
  const lower = entry.name.toLowerCase();
  if (/\.(zip|tar|gz|bz2|xz|7z|rar|iso|cab)$/.test(lower)) return "mdi-folder-zip-outline";
  if (/\.(png|jpe?g|gif|webp|svg|ico)$/.test(lower)) return "mdi-file-image-outline";
  return "mdi-file-outline";
};
const rawEntry = (item: unknown) =>
  ((item as { raw?: ArchiveTreeEntry })?.raw ?? item) as ArchiveTreeEntry;
</script>

<template>
  <div class="archive-preview" :class="{ 'archive-preview--compact': compact }">
    <div class="archive-preview__table-wrap">
      <VDataTable
        :loading="loading"
        :headers="archiveHeaders"
        :items="flatEntries"
        item-value="key"
        :items-per-page="compact ? 50 : 100"
        :items-per-page-options="[50, 100]"
        density="compact"
        class="archive-preview-table"
      >
        <template #no-data><Empty icon="mdi-archive-outline" compact /></template>
        <template #item.name="{ item }"><div class="archive-preview__name" :style="{ paddingLeft: `${rawEntry(item).depth * 18}px` }"><VIcon :icon="getMdiIconName(rawEntry(item))" size="16" /><span :title="rawEntry(item).name">{{ rawEntry(item).name }}</span></div></template>
        <template #item.type="{ item }">{{ rawEntry(item).type === 0 ? t("TXT_CODE_FILE_FOLDER") : t("TXT_CODE_COMMON_FILE") }}</template>
        <template #item.size="{ item }">{{ rawEntry(item).type === 0 ? "--" : convertFileSize(String(rawEntry(item).size)) }}</template>
        <template #item.compressedSize="{ item }">{{ rawEntry(item).type === 0 || !rawEntry(item).compressedSize ? "--" : convertFileSize(String(rawEntry(item).compressedSize)) }}</template>
        <template #item.time="{ item }">{{ rawEntry(item).type === 0 || !rawEntry(item).time ? "--" : dayjs(rawEntry(item).time).format("YYYY-MM-DD HH:mm:ss") }}</template>
        <template #bottom></template>
      </VDataTable>
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

.archive-preview__name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.archive-preview :deep(.v-table) {
  width: 100% !important;
  background: transparent;
  color: var(--text-color);
}

.archive-preview :deep(.v-table__wrapper > table) {
  min-width: 890px;
}

.archive-preview :deep(.v-data-table__th) {
  background: var(--background-color, #f5f5f5);
  color: var(--text-color);
  font-size: 11px;
  font-weight: 600;
}

.archive-preview :deep(.v-data-table__td) {
  border-bottom: 1px solid var(--color-gray-4);
  font-size: 12px;
  white-space: nowrap;
}

.archive-preview--compact :deep(.v-data-table__th) {
  background: var(--background-color, #f5f5f5);
  color: var(--desktop-window-text-secondary, var(--text-color));
}

.archive-preview--compact :deep(.v-data-table__td) {
  color: var(--desktop-window-text, var(--text-color));
  border-bottom-color: var(--desktop-window-border, var(--color-gray-4));
}

.archive-preview :deep(.v-data-table__tr:hover > td) {
  background: var(--color-gray-2);
}

.archive-preview__name span {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
