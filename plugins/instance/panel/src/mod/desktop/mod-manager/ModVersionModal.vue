<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import DesktopDialog from "@elementspanel/epanel-plugin-console/components/DesktopDialog";
import { useScreen } from "@elementspanel/epanel-plugin-console/hooks/useScreen";
import { t } from "@elementspanel/epanel-plugin-i18n";
import AppDialog from "@elementspanel/epanel-plugin-console/components/AppDialog";
import { computed, onUnmounted, ref, watch } from "vue";
import { VBtn, VChip, VDataTable, VIcon, VProgressCircular } from "vuetify/components";

const AppstoreOutlined = "mdi-view-grid-outline";

const props = defineProps<{
  visible: boolean;
  selectedMod: any;
  versions: any[];
  versionsLoading: boolean;
  searchFilters: any;
  mods: any[];
  isDesktop?: boolean;
}>();

const emit = defineEmits(["update:visible", "download"]);

const { isPhone } = useScreen();

const downloadingVersionId = ref<string | number | null>(null);
let downloadTimeout: ReturnType<typeof setTimeout> | null = null;

const handleDownload = (record: any) => {
  if (isInstalled(record) || downloadingVersionId.value === record.id) return;
  downloadingVersionId.value = record.id;

  // Clear pending downloads after 60 seconds without an installation update.
  if (downloadTimeout) clearTimeout(downloadTimeout);
  downloadTimeout = setTimeout(() => {
    if (downloadingVersionId.value === record.id) {
      downloadingVersionId.value = null;
    }
  }, 60000);

  emit("download", record);
};

const clearDownloadingState = () => {
  if (downloadTimeout) {
    clearTimeout(downloadTimeout);
    downloadTimeout = null;
  }
  downloadingVersionId.value = null;
};

onUnmounted(clearDownloadingState);

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

    // Fall back to release date, newest first.
    const aDate = new Date(a.date_published || a.published_at || a.updated || 0).getTime();
    const bDate = new Date(b.date_published || b.published_at || b.updated || 0).getTime();
    if (aDate !== bDate && !isNaN(aDate) && !isNaN(bDate)) return bDate - aDate;

    // Then compare version numbers in descending natural order.
    return (b.version_number || "").localeCompare(a.version_number || "", undefined, {
      numeric: true,
      sensitivity: "base"
    });
  });
});

const isInstalled = (record: any) => {
  return props.mods?.some((m: any) => {
    // Match managed files by version ID before falling back to filenames.
    if (m.extraInfo?.version?.id && m.extraInfo.version.id === record.id) return true;
    // Filename matching also covers manually uploaded files.
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

const desktopHeaders = computed(() => columns.value.map((column: any) => ({
  title: column.title || "",
  key: column.key,
  value: column.dataIndex || column.key,
  sortable: false
})));
</script>

<template>
  <template v-if="isDesktop">
    <DesktopDialog
      id="mod-version-dialog"
      :title="t('TXT_CODE_VERSION_SELECT')"
      :icon="AppstoreOutlined"
      :model-value="visible"
      :width="900"
      :height="600"
      :z-index="10001"
      @close="emit('update:visible', false)"
    >
      <p class="mb-8 desktop-modal-hint"><VIcon icon="mdi-alert-outline" /> {{ $t("TXT_CODE_COMMON_IF_DOWNLOADING_FAILS_SWITCH_SOURCES_OR_DOWNLOAD_FROM_THE_ORIGINAL_SITE") }}</p>
      <VDataTable class="mod-version-table" :headers="desktopHeaders" :items="sortedVersions" item-value="id"
        :loading="versionsLoading" density="comfortable">
        <template #no-data><Empty icon="mdi-puzzle-outline" compact /></template>
        <template #loading><VProgressCircular indeterminate size="24" width="2" /></template>
        <template #item.name="{ item }"><strong>{{ item.name }}</strong></template>
        <template #item.version_number="{ item }">{{ item.version_number }}</template>
        <template #item.game_versions="{ item }">
          <VChip v-for="v in item.game_versions?.slice(0, 3)" :key="v" size="small" variant="tonal" :color="v === searchFilters?.version ? 'primary' : undefined" class="mr-1">{{ v }}</VChip>
        </template>
        <template #item.loaders="{ item }">
          <VChip v-for="l in item.loaders" :key="l" size="small" variant="tonal" :color="l.toLowerCase() === searchFilters?.loader?.toLowerCase() ? 'success' : 'orange'" class="mr-1">{{ l }}</VChip>
        </template>
        <template #item.action="{ item }">
          <VBtn icon variant="text" size="small" :disabled="isInstalled(item) || downloadingVersionId === item.id"
            :loading="downloadingVersionId === item.id" :title="isInstalled(item) ? t('TXT_CODE_INSTALLED') : t('TXT_CODE_DOWNLOAD')" @click="handleDownload(item)">
            <VIcon :icon="downloadingVersionId === item.id ? 'mdi-loading' : isInstalled(item) ? 'mdi-check-circle-outline' : 'mdi-cloud-download-outline'" />
          </VBtn>
        </template>
      </VDataTable>
    </DesktopDialog>
  </template>
  <AppDialog v-else :visible="visible" :title="t('TXT_CODE_VERSION_SELECT')" :footer="null"
    :width="isPhone ? '100%' : '900px'" @update:visible="(val) => emit('update:visible', val)">
    <p class="mb-8 desktop-modal-hint"><VIcon icon="mdi-alert-outline" /> {{ $t("TXT_CODE_COMMON_IF_DOWNLOADING_FAILS_SWITCH_SOURCES_OR_DOWNLOAD_FROM_THE_ORIGINAL_SITE") }}</p>
    <VDataTable :headers="desktopHeaders" :items="sortedVersions" item-value="id" :loading="versionsLoading"
      :items-per-page="isPhone ? 5 : 10" density="comfortable">
      <template #no-data><Empty icon="mdi-puzzle-outline" compact /></template>
      <template #item.name="{ item }"><strong>{{ item.name }}</strong></template>
      <template #item.game_versions="{ item }">
        <VChip v-for="v in item.game_versions?.slice(0, 3)" :key="v" size="small" variant="tonal"
          :color="v === searchFilters?.version ? 'primary' : undefined" class="mr-1">{{ v }}</VChip>
      </template>
      <template #item.loaders="{ item }">
        <VChip v-for="l in item.loaders" :key="l" size="small" variant="tonal"
          :color="l.toLowerCase() === searchFilters?.loader?.toLowerCase() ? 'success' : 'warning'" class="mr-1">{{ l }}</VChip>
      </template>
      <template #item.action="{ item }">
        <VBtn icon variant="text" size="small"
          :disabled="isInstalled(item) || downloadingVersionId === item.id"
          :loading="downloadingVersionId === item.id"
          :title="isInstalled(item) ? t('TXT_CODE_INSTALLED') : t('TXT_CODE_DOWNLOAD')"
          @click="handleDownload(item)">
          <VIcon :icon="downloadingVersionId === item.id ? 'mdi-loading' : isInstalled(item) ? 'mdi-check-circle-outline' : 'mdi-cloud-download-outline'" />
        </VBtn>
      </template>
    </VDataTable>
  </AppDialog>
</template>
