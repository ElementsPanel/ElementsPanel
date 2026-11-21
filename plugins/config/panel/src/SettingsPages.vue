<script setup lang="ts">
import { computed, watch } from "vue";
import { VBadge, VTab, VTabs } from "vuetify/components";
import { t } from "@elementspanel/epanel-plugin-i18n";
import type { SettingField } from "./api";
import SchemaForm from "./SchemaForm.vue";

const props = defineProps<{
  fields: SettingField[];
  values: Record<string, unknown>;
  savedValues?: Record<string, unknown>;
  page: string;
  navigationTarget?: HTMLElement | null;
}>();
const emit = defineEmits<{
  (event: "save"): void;
  (event: "update:page", page: string): void;
}>();
const selectedPage = computed({
  get: () => props.page,
  set: (page: string) => emit("update:page", page)
});
const pages = computed(() => {
  const grouped = new Map<string, { id: string; title: string; fields: SettingField[] }>();
  for (const field of props.fields) {
    const id = field.page?.id || "general";
    if (!grouped.has(id)) grouped.set(id, {
      id, title: field.page?.title || t("TXT_CODE_SETTINGS_PAGE_GENERAL"), fields: []
    });
    grouped.get(id)!.fields.push(field);
  }
  return [...grouped.values()];
});
watch(pages, (items) => {
  if (!items.some((page) => page.id === selectedPage.value))
    selectedPage.value = items[0]?.id ?? "";
}, { immediate: true });
const currentFields = computed(() =>
  pages.value.find((page) => page.id === selectedPage.value)?.fields ?? pages.value[0]?.fields ?? []
);
const modified = (fields: SettingField[]) => fields.some((field) =>
  props.savedValues && field.key && field.type !== "link" &&
  JSON.stringify(props.values[field.key]) !== JSON.stringify(props.savedValues[field.key])
);
</script>

<template>
  <Teleport :to="navigationTarget ?? 'body'" :disabled="!navigationTarget">
    <VTabs
      v-if="pages.length > 1"
      v-model="selectedPage"
      color="primary"
      show-arrows
      class="settings-pages-tabs"
    >
      <VTab v-for="page in pages" :key="page.id" :value="page.id" rounded="xl">
        <VBadge :model-value="modified(page.fields)" color="warning" dot inline>
          {{ page.title }}
        </VBadge>
      </VTab>
    </VTabs>
  </Teleport>
  <SchemaForm
    :fields="currentFields"
    :values="values"
    :saved-values="savedValues"
    @save="emit('save')"
  />
</template>

<style scoped>
.settings-pages-tabs {
  max-width: 100%;
}
</style>
