<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { computed, onUnmounted, ref, watch } from "vue";
import { VBtn, VIcon, VTab, VTabs } from "vuetify/components";

const props = defineProps<{
  activeTab: string;
  tabs: { key: string; name: string }[];
}>();
const emit = defineEmits<{
  (event: "select", key: string): void;
  (event: "close", key: string): void;
  (event: "add"): void;
  (event: "reorder", keys: string[]): void;
}>();

const draggedKey = ref("");
const tabsRow = ref<HTMLElement>();
const previewOrder = ref<string[]>([]);
const displayedTabs = computed(() => {
  if (!draggedKey.value) return props.tabs;
  const byKey = new Map(props.tabs.map((tab) => [tab.key, tab]));
  return previewOrder.value.flatMap((key) => {
    const tab = byKey.get(key);
    return tab ? [tab] : [];
  });
});

const endDrag = () => {
  draggedKey.value = "";
  previewOrder.value = [];
  document.removeEventListener("dragover", handleOutsideDragOver, true);
  document.removeEventListener("drop", handleOutsideDrop, true);
};

watch(() => props.tabs.map((tab) => tab.key), endDrag);
onUnmounted(endDrag);

const savePreview = () => {
  if (!draggedKey.value) return;
  const keys = [...previewOrder.value];
  endDrag();
  if (
    keys.length === props.tabs.length &&
    keys.some((key, position) => key !== props.tabs[position].key)
  )
    emit("reorder", keys);
};

function handleOutsideDragOver(event: DragEvent) {
  if (!draggedKey.value || tabsRow.value?.contains(event.target as Node)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function handleOutsideDrop(event: DragEvent) {
  if (!draggedKey.value || tabsRow.value?.contains(event.target as Node)) return;
  event.preventDefault();
  event.stopPropagation();
  savePreview();
}

const startDrag = (event: DragEvent, key: string) => {
  if (props.tabs.length < 2 || !event.dataTransfer) {
    event.preventDefault();
    return;
  }
  draggedKey.value = key;
  previewOrder.value = props.tabs.map((tab) => tab.key);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", key);
  document.addEventListener("dragover", handleOutsideDragOver, true);
  document.addEventListener("drop", handleOutsideDrop, true);
};

const getDropTarget = (event: DragEvent) => {
  const tab = (event.target as HTMLElement).closest<HTMLElement>(".file-folder-tab");
  const key = tab?.dataset.tabKey;
  if (!tab || !key || key === draggedKey.value) return;
  const bounds = tab.getBoundingClientRect();
  return { key, after: event.clientX >= bounds.left + bounds.width / 2 };
};

const updatePreview = (event: DragEvent) => {
  const target = getDropTarget(event);
  if (!target) return;
  const from = previewOrder.value.indexOf(draggedKey.value);
  const to = previewOrder.value.indexOf(target.key);
  if (from === -1 || to === -1 || from < to !== target.after) return;
  const keys = [...previewOrder.value];
  keys.splice(from, 1);
  keys.splice(to, 0, draggedKey.value);
  previewOrder.value = keys;
};

const handleDragOver = (event: DragEvent) => {
  if (!draggedKey.value) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  updatePreview(event);

  const container = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
    ".v-slide-group__container"
  );
  if (container && container.scrollWidth > container.clientWidth) {
    const bounds = container.getBoundingClientRect();
    if (event.clientX < bounds.left + 32) container.scrollLeft -= 20;
    else if (event.clientX > bounds.right - 32) container.scrollLeft += 20;
  }
};

const handleDragLeave = (event: DragEvent) => {
  if (!draggedKey.value) return;
  event.stopPropagation();
};

const handleDrop = (event: DragEvent) => {
  if (!draggedKey.value) return;
  event.preventDefault();
  event.stopPropagation();
  updatePreview(event);
  savePreview();
};
</script>

<template>
  <div
    ref="tabsRow"
    class="file-tabs-row"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <VTabs
      :model-value="activeTab"
      density="compact"
      show-arrows
      @update:model-value="typeof $event === 'string' && emit('select', $event)"
    >
      <TransitionGroup name="file-folder-tabs">
        <VTab
          v-for="tab in displayedTabs"
          :key="tab.key"
          :value="tab.key"
          :data-tab-key="tab.key"
          :draggable="tabs.length > 1"
          class="file-folder-tab"
          :class="{
            'file-folder-tab--draggable': tabs.length > 1,
            'file-folder-tab--dragging': draggedKey === tab.key
          }"
          @dragstart.stop="startDrag($event, tab.key)"
          @dragend.stop="endDrag"
        >
          <span class="file-tab-label">{{ tab.name }}</span>
          <VBtn
            icon
            :size="24"
            variant="text"
            class="file-tab-close"
            :draggable="false"
            :aria-label="`${t('TXT_CODE_COMMON_STOP')} ${tab.name}`"
            @dragstart.stop.prevent
            @click.stop="emit('close', tab.key)"
            @keydown.enter.stop
            @keydown.space.stop
          >
            <VIcon icon="mdi-close" :size="16" />
          </VBtn>
        </VTab>
      </TransitionGroup>
    </VTabs>
    <VBtn
      icon="mdi-plus"
      size="small"
      variant="text"
      :aria-label="t('TXT_CODE_COMMON_NEW_TASK')"
      @click="emit('add')"
    />
  </div>
  <Empty
    v-if="!tabs.length"
    icon="mdi-folder-open-outline"
    :title="t('TXT_CODE_FILE_NO_OPEN_FOLDERS')"
  >
    <template #actions>
      <VBtn variant="tonal" prepend-icon="mdi-plus" @click="emit('add')">{{
        t("TXT_CODE_COMMON_NEW_TASK")
      }}</VBtn>
    </template>
  </Empty>
</template>

<style scoped>
.file-tabs-row {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  min-width: 0;
  margin-bottom: 12px;
}
.file-tabs-row :deep(.v-tabs) {
  min-width: 0;
  flex: 1;
}
.file-folder-tab {
  position: relative;
  padding-inline: 28px;
}
.file-folder-tab--draggable {
  cursor: grab;
}
.file-folder-tab--dragging {
  opacity: 0.5;
  cursor: grabbing;
}
.file-folder-tabs-move {
  transition: transform 0.16s ease;
}
.file-tab-label {
  transition: transform 0.16s ease;
}
.file-tab-close {
  position: absolute;
  inset-inline-end: 12px;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease;
}
.file-folder-tab:hover .file-tab-label,
.file-folder-tab:focus-visible .file-tab-label,
.file-folder-tab:has(.file-tab-close:focus-visible) .file-tab-label {
  transform: translateX(-16px);
}
.file-folder-tab:hover .file-tab-close,
.file-folder-tab:focus-visible .file-tab-close,
.file-folder-tab:has(.file-tab-close:focus-visible) .file-tab-close {
  opacity: 1;
  pointer-events: auto;
}
@media (hover: none) {
  .file-folder-tab .file-tab-label {
    transform: translateX(-16px);
  }
  .file-folder-tab .file-tab-close {
    opacity: 1;
    pointer-events: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .file-folder-tabs-move {
    transition: none;
  }
}
</style>
