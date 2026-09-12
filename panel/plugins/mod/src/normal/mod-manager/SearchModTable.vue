<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { computed } from "vue";
import { VAvatar, VBtn, VChip, VDataTable, VIcon, VImg, VProgressCircular } from "vuetify/components";

const props = defineProps<{
  loading: boolean;
  dataSource: any[];
  columns: any[];
  pagination: any;
  mods: any[];
  isDesktop?: boolean;
}>();
const emit = defineEmits(["show-versions", "open-external", "download", "change"]);
const { t } = useI18n();

const headers = computed(() => props.columns.map((column: any) => ({
  title: column.title || "",
  key: column.key,
  value: column.dataIndex || column.key,
  sortable: Boolean(column.sorter),
  width: column.width
})));
const isInstalled = (record: any) => props.mods?.some((m: any) => m.extraInfo?.project?.id === record.id);
const formatDate = (date: string) => {
  if (!date) return t("TXT_CODE_UNKNOWN_TIME");
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const emitPageChange = (page: number, itemsPerPage: number) => emit("change", { current: page, pageSize: itemsPerPage });
</script>

<template>
  <VDataTable class="search-mod-table" :headers="headers" :items="dataSource" item-value="id" :loading="loading" :items-length="pagination?.total || dataSource.length" :items-per-page="pagination?.pageSize || 10" :page="pagination?.current || 1" density="comfortable" @update:page="(page) => emitPageChange(page, pagination?.pageSize || 10)" @update:items-per-page="(size) => emitPageChange(pagination?.current || 1, size)">
    <template #loading><VProgressCircular indeterminate size="24" width="2" /></template>
    <template #no-data><div class="search-mod-empty"><VIcon icon="mdi-magnify" size="42" /><span>{{ t("TXT_CODE_SEARCH_TIP") }}</span></div></template>
    <template #item.icon="{ item }"><VAvatar size="40" rounded="lg" color="surface-variant"><VImg v-if="item.icon_url" :src="item.icon_url" /><span v-else>{{ (item.title || "?").charAt(0).toUpperCase() }}</span></VAvatar></template>
    <template #item.name="{ item }"><div class="search-mod-name" :title="item.title"><strong>{{ item.title }}</strong><small>{{ item.description }}</small></div></template>
    <template #item.version="{ item }"><div class="search-mod-version"><code>{{ item.version_number || t("TXT_CODE_UNKNOWN_VERSION") }}</code><small>{{ formatDate(item.updated) }}</small></div></template>
    <template #item.type="{ item }"><VChip color="primary" size="small" variant="tonal">{{ item.project_type }}</VChip></template>
    <template #item.source="{ item }"><VChip :color="item.source === 'CurseForge' ? 'orange' : item.source === 'SpigotMC' ? 'amber' : 'success'" size="small" variant="tonal">{{ item.source }}</VChip></template>
    <template #item.action="{ item }"><div class="search-mod-actions"><VBtn variant="text" size="small" :disabled="isInstalled(item)" @click="emit('show-versions', item)"><VIcon :icon="isInstalled(item) ? 'mdi-check-circle-outline' : 'mdi-cloud-download-outline'" />{{ isInstalled(item) ? t("TXT_CODE_INSTALLED") : t("TXT_CODE_65b21404") }}</VBtn><VBtn variant="text" size="small" @click="emit('open-external', item)"><VIcon icon="mdi-open-in-new" />{{ t("TXT_CODE_47fea88e") }}</VBtn></div></template>
  </VDataTable>
</template>

<style scoped>
.search-mod-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 0; opacity: 0.5; }
.search-mod-name, .search-mod-version { display: flex; flex-direction: column; min-width: 0; text-align: left; }
.search-mod-name strong, .search-mod-name small, .search-mod-version code, .search-mod-version small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.search-mod-name small, .search-mod-version small { opacity: 0.6; font-size: 11px; }
.search-mod-actions { display: flex; justify-content: center; gap: 4px; }
</style>
