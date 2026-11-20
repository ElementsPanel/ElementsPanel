<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import type {
  Breadcrumb,
  FileStatus
} from "@elementspanel/epanel-plugin-console/types/fileManager";
import { computed } from "vue";
import { VBtn, VIcon, VSelect } from "vuetify/components";

const props = defineProps<{
  breadcrumbs: Breadcrumb[];
  currentDisk: string;
  fileStatus?: FileStatus;
  compact?: boolean;
}>();
const emit = defineEmits<{
  (event: "select", path: string): void;
  (event: "disk", disk: string): void;
}>();

const showDisks = computed(
  () =>
    props.fileStatus?.platform === "win32" &&
    props.fileStatus.isGlobalInstance &&
    props.fileStatus.disks.includes(props.currentDisk)
);
</script>

<template>
  <div class="file-path-bar" :class="{ 'file-path-bar--compact': compact }">
    <VSelect
      v-if="showDisks"
      :model-value="currentDisk"
      :items="(fileStatus?.disks || []).map((disk) => ({ title: `${disk}:`, value: disk }))"
      class="file-disk-select"
      :variant="compact ? 'solo' : undefined"
      density="compact"
      hide-details
      @update:model-value="emit('disk', $event)"
    >
      <template #no-data><Empty :icon="false" compact /></template>
    </VSelect>
    <div class="file-breadcrumbs" data-app-surface="control">
      <template v-for="(item, index) in breadcrumbs" :key="item.path">
        <VBtn
          variant="text"
          size="small"
          class="file-breadcrumbs-item"
          @click="emit('select', item.path)"
          >{{ item.name }}</VBtn
        >
        <VIcon
          v-if="index < breadcrumbs.length - 1"
          class="breadcrumb-separator"
          icon="mdi-chevron-right"
          size="16"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.file-path-bar {
  --file-manager-path-height: 32px;
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  min-width: 0;
  gap: 10px;
  margin-bottom: 16px;
}

.file-path-bar--compact {
  gap: 8px;
  margin-bottom: 8px;
}

.file-disk-select {
  flex: 0 0 125px;
}

.file-disk-select :deep(.v-field) {
  --v-input-control-height: var(--file-manager-path-height);
  --v-field-input-padding-top: 0px;
  --v-field-input-padding-bottom: 0px;
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
}

.file-breadcrumbs-item {
  min-width: 32px;
  padding: 0 8px;
  text-transform: none;
}

.breadcrumb-separator {
  color: var(--color-gray-7);
}

@media (max-width: 992px) {
  .file-path-bar:not(.file-path-bar--compact) {
    display: grid;
    grid-template-columns: 1fr;
    grid-auto-rows: 1fr;
  }

  .file-path-bar:not(.file-path-bar--compact) .file-disk-select {
    flex-basis: auto;
    width: 100%;
  }
}
</style>
