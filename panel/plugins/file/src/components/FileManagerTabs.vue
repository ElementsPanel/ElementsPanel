<script setup lang="ts">
import { t } from "@/lang/i18n";
import { VBtn, VIcon, VTab, VTabs } from "vuetify/components";

defineProps<{
  activeTab: string;
  tabs: { key: string; name: string }[];
}>();
const emit = defineEmits<{
  (event: "select", key: string): void;
  (event: "close", key: string): void;
  (event: "add"): void;
}>();
</script>

<template>
  <div class="file-tabs-row">
    <VTabs :model-value="activeTab" density="compact" show-arrows @update:model-value="typeof $event === 'string' && emit('select', $event)">
      <VTab v-for="tab in tabs" :key="tab.key" :value="tab.key" class="file-folder-tab">
        <span class="file-tab-label">{{ tab.name }}</span>
        <VBtn icon="mdi-close" size="x-small" variant="text" class="file-tab-close" :aria-label="`${t('TXT_CODE_b1dedda3')} ${tab.name}`" @click.stop="emit('close', tab.key)" @keydown.enter.stop @keydown.space.stop />
      </VTab>
    </VTabs>
    <VBtn icon="mdi-plus" size="small" variant="text" :aria-label="t('TXT_CODE_1644b775')" @click="emit('add')" />
  </div>
  <div v-if="!tabs.length" class="file-tabs-empty" role="status">
    <VIcon icon="mdi-folder-open-outline" size="48" />
    <p>{{ t("TXT_CODE_FILE_NO_OPEN_FOLDERS") }}</p>
    <VBtn variant="tonal" prepend-icon="mdi-plus" @click="emit('add')">{{ t("TXT_CODE_1644b775") }}</VBtn>
  </div>
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
.file-tab-label {
  transition: transform 0.16s ease;
}
.file-tab-close {
  position: absolute;
  inset-inline-end: 4px;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease;
}
.file-folder-tab:hover .file-tab-label,
.file-folder-tab:focus-visible .file-tab-label,
.file-folder-tab:has(.file-tab-close:focus-visible) .file-tab-label {
  transform: translateX(-12px);
}
.file-folder-tab:hover .file-tab-close,
.file-folder-tab:focus-visible .file-tab-close,
.file-folder-tab:has(.file-tab-close:focus-visible) .file-tab-close {
  opacity: 1;
  pointer-events: auto;
}
.file-tabs-empty {
  display: flex;
  flex: 1;
  min-height: 240px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-color);
}
.file-tabs-empty p { margin: 0; }
@media (hover: none) {
  .file-folder-tab .file-tab-label { transform: translateX(-12px); }
  .file-folder-tab .file-tab-close { opacity: 1; pointer-events: auto; }
}
</style>
