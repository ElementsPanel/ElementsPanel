<script setup lang="ts">
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import AppDialog from "@/components/AppDialog.vue";
import { computed, ref, watch } from "vue";
import { VBtn, VChip, VDataTable, VIcon, VProgressCircular } from "vuetify/components";

const props = defineProps<{
  visible: boolean;
  selectedMod: any;
  versions: any[];
  versionsLoading: boolean;
  searchFilters: any;
  mods: any[];
}>();

const emit = defineEmits(["update:visible", "download"]);

const { isPhone } = useScreen();

// Track the version ID being downloaded
const downloadingVersionId = ref<string | number | null>(null);
let downloadTimeout: ReturnType<typeof setTimeout> | null = null;

// Handle download button click
const handleDownload = (record: any) => {
  if (isInstalled(record) || downloadingVersionId.value === record.id) return;
  downloadingVersionId.value = record.id;

  // Set timeout to clear loading state (as a fallback to prevent loading from persisting if download fails)
  if (downloadTimeout) clearTimeout(downloadTimeout);
  downloadTimeout = setTimeout(() => {
    if (downloadingVersionId.value === record.id) {
      downloadingVersionId.value = null;
    }
  }, 60000); // 60 second timeout

  emit("download", record);
};

// Helper function to clear loading state
const clearDownloadingState = () => {
  if (downloadTimeout) {
    clearTimeout(downloadTimeout);
    downloadTimeout = null;
  }
  downloadingVersionId.value = null;
};

// Watch mods changes, clear loading state when version is installed
watch(
  () => props.mods,
  () => {
    if (downloadingVersionId.value) {
      const isNowInstalled = props.mods?.some((m: any) => {
        if (m.extraInfo?.version?.id === downloadingVersionId.value) return true;
        return false;
      });
      if (isNowInstalled) {
        clearDownloadingState();
      }
    }
  },
  { deep: true }
);

// Watch modal close, clear loading state
watch(
  () => props.visible,
  (newVal) => {
    if (!newVal) {
      clearDownloadingState();
    }
  }
);

const sortedVersions = computed(() => {
  if (!props.versions) return [];
  const vFilter = props.searchFilters?.version;
  const lFilter = props.searchFilters?.loader;

  if (!vFilter && !lFilter) return props.versions;

  return [...props.versions].sort((a, b) => {
    const aMatchV = vFilter ? a.game_versions?.includes(vFilter) : false;
    const aMatchL = lFilter
      ? a.loaders?.some((l: string) => l.toLowerCase() === lFilter.toLowerCase())
      : false;
    const bMatchV = vFilter ? b.game_versions?.includes(vFilter) : false;
    const bMatchL = lFilter
      ? b.loaders?.some((l: string) => l.toLowerCase() === lFilter.toLowerCase())
      : false;

    const aScore = (aMatchV ? 2 : 0) + (aMatchL ? 1 : 0);
    const bScore = (bMatchV ? 2 : 0) + (bMatchL ? 1 : 0);

    if (aScore !== bScore) return bScore - aScore;

    // Fallback 1: Date (Latest first)
    const aDate = new Date(a.date_published || a.published_at || a.updated || 0).getTime();
    const bDate = new Date(b.date_published || b.published_at || b.updated || 0).getTime();
    if (aDate !== bDate && !isNaN(aDate) && !isNaN(bDate)) return bDate - aDate;

    // Fallback 2: Version number (Natural sort, Latest first)
    return (b.version_number || "").localeCompare(a.version_number || "", undefined, {
      numeric: true,
      sensitivity: "base"
    });
  });
});

const isInstalled = (record: any) => {
  return props.mods?.some((m: any) => {
    // 1. Check by version ID (most accurate for MCSM managed mods)
    if (m.extraInfo?.version?.id && m.extraInfo.version.id === record.id) return true;
    // 2. Check by filename (for manually uploaded or different metadata)
    const targetFileName =
      record.filename || record.fileName || (record.files && record.files[0]?.filename);
    if (targetFileName && m.file === targetFileName) return true;
    return false;
  });
};

const columns = computed(() => {
  const base = [
    { title: t("TXT_CODE_VERSION_NAME"), dataIndex: "name", key: "name" },
    { title: t("TXT_CODE_VERSION_NUMBER"), dataIndex: "version_number", key: "version_number" },
    { title: t("TXT_CODE_GAME_VERSION"), dataIndex: "game_versions", key: "game_versions" },
    { title: t("TXT_CODE_LOADER"), dataIndex: "loaders", key: "loaders" },
    { title: t("TXT_CODE_OPERATE"), key: "action" }
  ];
  return isPhone.value ? base.filter((c) => ["name", "action"].includes(c.key!)) : base;
});

const headers = computed(() => columns.value.map((column) => ({ title: column.title, key: column.key, value: column.dataIndex || column.key, sortable: false })));
</script>

<template>
  <AppDialog :visible="visible" :title="t('TXT_CODE_VERSION_SELECT')" :footer="null"
    :width="isPhone ? '100%' : '900px'" @update:visible="(val) => emit('update:visible', val)">
    <div class="mb-4 text-body-2 text-medium-emphasis">
        <VIcon start icon="mdi-alert-outline" />
        {{ $t("TXT_CODE_6111bc9e") }}
    </div>
    <VDataTable :loading="versionsLoading" :headers="headers" :items="sortedVersions" item-value="id" :items-per-page="10" density="comfortable">
      <template #loading><VProgressCircular indeterminate size="24" width="2" /></template>
      <template #item.game_versions="{ item }"><VChip v-for="v in item.game_versions?.slice(0, 3)" :key="v" size="small" variant="tonal" :color="v === searchFilters?.version ? 'primary' : undefined">{{ v }}</VChip></template>
      <template #item.loaders="{ item }"><VChip v-for="l in item.loaders" :key="l" size="small" variant="tonal" :color="l.toLowerCase() === searchFilters?.loader?.toLowerCase() ? 'success' : 'warning'">{{ l }}</VChip></template>
      <template #item.action="{ item }"><VBtn icon variant="text" size="small" :disabled="isInstalled(item) || downloadingVersionId === item.id" :title="isInstalled(item) ? t('TXT_CODE_INSTALLED') : t('TXT_CODE_DOWNLOAD')" @click="handleDownload(item)"><VIcon :icon="downloadingVersionId === item.id ? 'mdi-loading' : isInstalled(item) ? 'mdi-check-circle-outline' : 'mdi-cloud-download-outline'" :class="{ 'loading-icon': downloadingVersionId === item.id }" /></VBtn></template>
    </VDataTable>
  </AppDialog>
</template>
