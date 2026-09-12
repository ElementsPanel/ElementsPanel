<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { computed } from "vue";
import { VAvatar, VBtn, VChip, VDataTable, VIcon, VImg, VProgressCircular } from "vuetify/components";

const props = defineProps<{
  loading: boolean;
  dataSource: any[];
  columns: any[];
  pagination: any;
  isDesktop?: boolean;
}>();

const emit = defineEmits(["toggle", "delete", "config", "refresh", "change", "openExternal"]);
const { t } = useI18n();

const headers = computed(() => props.columns.map((column: any) => ({
  title: column.title || "",
  key: column.key,
  value: column.dataIndex || column.key,
  sortable: Boolean(column.sorter),
  width: column.width
})));

const emitPageChange = (page: number, itemsPerPage: number) => emit("change", { current: page, pageSize: itemsPerPage });
</script>

<template>
  <VDataTable class="local-mod-table" :headers="headers" :items="dataSource" item-value="file" :loading="loading" :items-per-page="pagination?.pageSize || 10" :page="pagination?.current || 1" density="comfortable" @update:page="(page) => emitPageChange(page, pagination?.pageSize || 10)" @update:items-per-page="(size) => emitPageChange(pagination?.current || 1, size)">
    <template #loading><VProgressCircular indeterminate size="24" width="2" /></template>
    <template #item.icon="{ item }"><VAvatar size="36" rounded="lg" color="surface-variant"><VImg v-if="item.extraInfo?.project?.icon_url" :src="item.extraInfo.project.icon_url" /><span v-else>{{ (item.name || item.file || "?").charAt(0).toUpperCase() }}</span></VAvatar></template>
    <template #item.name="{ item }"><div class="local-mod-name" :title="item.name || item.file"><strong>{{ item.name || item.file }}</strong><small v-if="item.extraInfo?.project?.description">{{ item.extraInfo.project.description }}</small><small v-else-if="item.name && item.file !== item.name">{{ item.file }}</small></div></template>
    <template #item.version="{ item }"><code>{{ item.version || t("TXT_CODE_UNKNOWN_VERSION") }}</code></template>
    <template #item.enabled="{ item }"><VChip size="small" variant="tonal" :color="item.enabled ? 'success' : 'error'">{{ item.enabled ? t("TXT_CODE_ENABLED") : t("TXT_CODE_DISABLED") }}</VChip></template>
    <template #item.type="{ item }"><VChip size="small" variant="tonal" color="primary">{{ item.type }}</VChip></template>
    <template #item.action="{ item }"><div class="local-mod-actions"><VBtn icon variant="text" size="small" :title="t('TXT_CODE_CONFIG')" @click="emit('config', item)"><VIcon icon="mdi-cog-outline" /></VBtn><VBtn icon variant="text" size="small" :title="item.enabled ? t('TXT_CODE_DISABLE') : t('TXT_CODE_ENABLE')" @click="emit('toggle', item)"><VIcon :icon="item.enabled ? 'mdi-pause-circle-outline' : 'mdi-play-circle-outline'" /></VBtn><VBtn icon variant="text" size="small" color="error" :title="t('TXT_CODE_6f2c1806')" @click="emit('delete', item)"><VIcon icon="mdi-delete-outline" /></VBtn></div></template>
  </VDataTable>
</template>

<style scoped>
.local-mod-name { display: flex; flex-direction: column; min-width: 0; text-align: left; }
.local-mod-name strong, .local-mod-name small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.local-mod-name small { opacity: 0.6; font-size: 11px; }
.local-mod-actions { display: flex; justify-content: center; gap: 4px; }
</style>
