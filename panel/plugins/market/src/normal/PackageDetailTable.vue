<script setup lang="ts">
import AppDialog from "@/components/AppDialog.vue";
import { t } from "@/lang/i18n";
import type { QuickStartPackages } from "@/types";
import { computed, ref } from "vue";
import { VAvatar, VBtn, VChip, VDataTable, VIcon } from "vuetify/lib/components/index.mjs";
import type { PackageTableColumnDef } from "./usePackageTableColumns";
import { usePackageTableColumns } from "./usePackageTableColumns";

const props = withDefaults(defineProps<{ dataSource: QuickStartPackages[]; btnText?: string }>(), { btnText: "" });
const emit = defineEmits<{ select: [item: QuickStartPackages, type: "normal" | "docker"] }>();
const { columnDefs } = usePackageTableColumns();
const configModalVisible = ref(false);
const configModalRecord = ref<QuickStartPackages | null>(null);
const myLanguage = ref(window.navigator.language.split("-")[0]);
const configModalJson = computed(() => {
  if (!configModalRecord.value) return "";
  try { return JSON.stringify(configModalRecord.value, null, 2); } catch { return String(configModalRecord.value); }
});
const headers = computed(() => columnDefs.value.map((col) => ({ title: col.title, key: col.key, align: col.align as any, width: col.width })) as any);
const getColumnDef = (key: string): PackageTableColumnDef | undefined => columnDefs.value.find((c) => c.key === key);
const getCellText = (record: QuickStartPackages, dataIndex: string): string => {
  const value = record[dataIndex as keyof QuickStartPackages];
  if (value == null) return "";
  return Array.isArray(value) ? value.join(", ") : String(value);
};
const localized = (record: QuickStartPackages, field: string) => {
  const values = record as unknown as Record<string, unknown>;
  return String(values[`${field}-${myLanguage.value}`] ?? values[field] ?? "");
};
const rowItem = (item: QuickStartPackages) => ((item as unknown as { raw?: QuickStartPackages }).raw ?? item);
const platformDisplayText = (platform: string) => String(platform).toLowerCase() === "all" ? t("TXT_CODE_all_platform") : platform;
</script>

<template>
  <VDataTable :headers="headers" :items="props.dataSource" item-value="key" :items-per-page="10" density="comfortable" class="package-detail-table">
    <template #item.image="{ item }">
      <VAvatar v-if="rowItem(item).image" :image="rowItem(item).image" rounded="lg" size="48" />
      <span v-else class="text-medium-emphasis">No image</span>
    </template>
    <template #item.title="{ item }">
      <div class="package-title-cell">
        <div class="font-weight-medium">{{ localized(rowItem(item), "title") }}</div>
        <div class="text-caption text-medium-emphasis text-truncate">{{ localized(rowItem(item), "description") }}</div>
      </div>
    </template>
    <template #item.platform="{ item }"><VChip size="small" color="primary" variant="tonal">{{ platformDisplayText(rowItem(item).platform) }}</VChip></template>
    <template #item.runtime="{ item }"><VChip v-if="getCellText(rowItem(item), 'runtime')" size="small" variant="tonal">{{ getCellText(rowItem(item), 'runtime') }}</VChip></template>
    <template #item.remark="{ item }"><span class="text-truncate">{{ localized(rowItem(item), "remark") || "No remark" }}</span></template>
    <template #item.author="{ item }"><VChip v-if="getCellText(rowItem(item), 'author')" size="small" color="success" variant="tonal">{{ getCellText(rowItem(item), 'author') }}</VChip></template>
    <template #item.action="{ item }">
      <div class="package-actions">
        <VBtn variant="text" size="small" @click="configModalRecord = rowItem(item); configModalVisible = true">{{ t("TXT_CODE_ee5cd485") }}</VBtn>
        <VBtn v-if="rowItem(item).dockerOptional" color="success" size="small" @click="emit('select', rowItem(item), 'docker')"><VIcon start icon="mdi-download" />{{ t("TXT_CODE_9123858b") }}</VBtn>
        <VBtn color="primary" size="small" @click="emit('select', rowItem(item), 'normal')"><VIcon start icon="mdi-download" />{{ rowItem(item)?.setupInfo?.docker?.image ? t("TXT_CODE_9123858b") : (btnText || t("TXT_CODE_1704ea49")) }}</VBtn>
      </div>
    </template>
    <template #bottom></template>
  </VDataTable>
  <AppDialog v-model:open="configModalVisible" :title="t('TXT_CODE_ee5cd485')" width="900px" :show-cancel="false" :ok-text="t('TXT_CODE_a0451c97')" @ok="configModalVisible = false">
    <pre class="config-modal-json"><code>{{ configModalJson }}</code></pre>
  </AppDialog>
</template>

<style scoped>
.package-detail-table { width:100%; }
.package-title-cell { min-width:180px; max-width:560px; }
.package-actions { display:flex; align-items:center; justify-content:center; gap:4px; flex-wrap:wrap; }
.config-modal-json { margin:0; max-height:70vh; overflow:auto; padding:12px; background:var(--color-gray-2); border-radius:8px; font-size:12px; line-height:1.5; color:var(--color-gray-12); white-space:pre-wrap; }
</style>
