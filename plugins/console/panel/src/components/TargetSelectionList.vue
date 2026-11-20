<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { t } from "@elementspanel/epanel-plugin-i18n";
import { VCheckbox, VPagination, VTextField } from "vuetify/components";

export interface TargetSelectionItem {
  value: string;
  title: string;
  subtitle?: string;
  hint?: string;
  disabled?: boolean;
}

const props = defineProps<{
  modelValue: string[];
  items: TargetSelectionItem[];
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string[]] }>();
const keyword = ref<string | null>("");
const page = ref(1);
const pageSize = 10;
const selectedIds = computed(() => new Set(props.modelValue));
const eligibleIds = computed(() =>
  props.items.filter((item) => !item.disabled).map((item) => item.value)
);
const selectedCount = computed(
  () => eligibleIds.value.filter((id) => selectedIds.value.has(id)).length
);
const allSelected = computed(
  () => eligibleIds.value.length > 0 && selectedCount.value === eligibleIds.value.length
);
const filteredItems = computed(() => {
  const query = (keyword.value ?? "").trim().toLocaleLowerCase();
  if (!query) return props.items;
  return props.items.filter((item) =>
    [item.title, item.subtitle].some((text) => text?.toLocaleLowerCase().includes(query))
  );
});
const pageCount = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / pageSize)));
const pageItems = computed(() =>
  filteredItems.value.slice((page.value - 1) * pageSize, page.value * pageSize)
);
watch(keyword, () => {
  page.value = 1;
});
watch(pageCount, (count) => {
  page.value = Math.min(page.value, count);
});

function selectAll(selected: boolean) {
  if (props.disabled) return;
  emit("update:modelValue", selected ? [...eligibleIds.value] : []);
}

function selectItem(item: TargetSelectionItem, selected: boolean) {
  if (props.disabled || item.disabled) return;
  const ids = new Set(eligibleIds.value.filter((id) => selectedIds.value.has(id)));
  if (selected) ids.add(item.value);
  else ids.delete(item.value);
  emit("update:modelValue", [...ids]);
}
</script>

<template>
  <div class="target-selection">
    <VTextField
      v-model="keyword"
      :label="t('TXT_CODE_COMMON_SEARCH_BY_NAME_OR_ADDRESS')"
      :disabled="disabled"
      prepend-inner-icon="mdi-magnify"
      density="compact"
      hide-details
      clearable
      flat
    />
    <div class="target-selection-toolbar">
      <VCheckbox
        :model-value="allSelected"
        :indeterminate="selectedCount > 0 && !allSelected"
        :label="t('TXT_CODE_COMMON_SELECT_ALL')"
        :disabled="disabled || !eligibleIds.length"
        density="compact"
        hide-details
        @update:model-value="selectAll(Boolean($event))"
      />
      <span class="text-caption text-medium-emphasis" role="status" aria-live="polite">
        {{ t("TXT_CODE_COMMON_SELECTED") }} {{ selectedCount }} / {{ eligibleIds.length }}
      </span>
    </div>
    <div class="target-selection-items">
      <VCheckbox
        v-for="item in pageItems"
        :key="item.value"
        :model-value="selectedIds.has(item.value)"
        :label="item.title"
        :disabled="disabled || item.disabled"
        class="target-selection-item"
        density="compact"
        hide-details
        @update:model-value="selectItem(item, Boolean($event))"
      >
        <template #label>
          <div class="target-selection-label ms-3">
            <div>{{ item.title }}</div>
            <div v-if="item.subtitle" class="text-caption text-medium-emphasis">
              {{ item.subtitle }}
            </div>
            <div v-if="item.hint" class="text-caption text-medium-emphasis">
              {{ item.hint }}
            </div>
          </div>
        </template>
      </VCheckbox>
      <div v-if="!pageItems.length" class="pa-4 text-center text-medium-emphasis" role="status">
        {{ t("TXT_CODE_NO_DATA") }}
      </div>
    </div>
    <VPagination
      v-if="pageCount > 1"
      v-model="page"
      :length="pageCount"
      :disabled="disabled"
      density="compact"
      class="mt-2"
    />
  </div>
</template>

<style scoped>
.target-selection {
  min-width: 0;
}

.target-selection-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 8px 0;
}

.target-selection-toolbar .v-checkbox {
  flex: 0 1 auto;
}

.target-selection-items {
  max-height: 40vh;
  overflow-y: auto;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
}

.target-selection-item {
  padding: 4px 8px;
}

.target-selection-item + .target-selection-item {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.target-selection-item :deep(.v-label) {
  min-width: 0;
  white-space: normal;
}

.target-selection-label {
  min-width: 0;
  padding: 4px 0;
  overflow-wrap: anywhere;
}
</style>
