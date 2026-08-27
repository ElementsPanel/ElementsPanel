<script setup lang="ts">
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import DesktopWindow from "../../desktop/DesktopWindow.vue";
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  LoadingOutlined,
  WarningOutlined
} from "@ant-design/icons-vue";
import { Button, Modal, Table, Tag } from "ant-design-vue";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

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

const windowWidth = ref(window.innerWidth);
const windowHeight = ref(window.innerHeight);

const updateWindowSize = () => {
  windowWidth.value = window.innerWidth;
  windowHeight.value = window.innerHeight;
};

onMounted(() => {
  window.addEventListener('resize', updateWindowSize);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateWindowSize);
});

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
</script>

<template>
  <template v-if="isDesktop">
    <Teleport to="body">
      <Transition name="du-dialog-fade">
        <DesktopWindow v-if="visible" id="mod-version-dialog" :title="t('TXT_CODE_VERSION_SELECT')"
          :icon="AppstoreOutlined" :visible="visible" :minimized="false" :maximized="false" :active="true"
          :initial-width="900" :initial-height="600" :initial-x="windowWidth / 2 - 450"
          :initial-y="windowHeight / 2 - 300" :z-index="10001" :show-minimize="false" :show-maximize="false"
          :resizable="false" @close="emit('update:visible', false)">
          <div class="desktop-modal-content">
            <a-typography class="mb-8" type="secondary">
              <a-typography-text>
                <WarningOutlined />
                {{ $t("TXT_CODE_6111bc9e") }}
              </a-typography-text>
            </a-typography>
            <Table :loading="versionsLoading" :data-source="sortedVersions" :columns="columns" row-key="id"
              :size="isPhone ? 'small' : 'middle'">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'game_versions'">
                  <Tag v-for="v in record.game_versions?.slice(0, 3)" :key="v"
                    :color="v === searchFilters?.version ? 'blue' : ''">
                    {{ v }}
                  </Tag>
                </template>
                <template v-if="column.key === 'loaders'">
                  <Tag v-for="l in record.loaders" :key="l"
                    :color="l.toLowerCase() === searchFilters?.loader?.toLowerCase() ? 'green' : 'orange'">
                    {{ l }}
                  </Tag>
                </template>
                <template v-if="column.key === 'action'">
                  <Button type="text" size="small" class="opacity-60 hover:opacity-100"
                    :disabled="isInstalled(record) || downloadingVersionId === record.id"
                    :loading="downloadingVersionId === record.id"
                    :title="isInstalled(record) ? t('TXT_CODE_INSTALLED') : t('TXT_CODE_DOWNLOAD')"
                    :class="{ 'text-green-500': isInstalled(record) }" @click="handleDownload(record)">
                    <template #icon>
                      <loading-outlined v-if="downloadingVersionId === record.id" style="font-size: 16px" />
                      <check-circle-outlined v-else-if="isInstalled(record)" style="font-size: 16px" />
                      <cloud-download-outlined v-else style="font-size: 16px" />
                    </template>
                  </Button>
                </template>
              </template>
            </Table>
          </div>
        </DesktopWindow>
      </Transition>
    </Teleport>
  </template>
  <Modal v-else :visible="visible" :title="t('TXT_CODE_VERSION_SELECT')" :footer="null"
    :width="isPhone ? '100%' : '900px'" @update:visible="(val) => emit('update:visible', val)">
    <a-typography class="mb-8" type="secondary">
      <a-typography-text>
        <WarningOutlined />
        {{ $t("TXT_CODE_6111bc9e") }}
      </a-typography-text>
    </a-typography>
    <Table :loading="versionsLoading" :data-source="sortedVersions" :columns="columns" row-key="id"
      :size="isPhone ? 'small' : 'middle'">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'game_versions'">
          <Tag v-for="v in record.game_versions?.slice(0, 3)" :key="v"
            :color="v === searchFilters?.version ? 'blue' : ''">
            {{ v }}
          </Tag>
        </template>
        <template v-if="column.key === 'loaders'">
          <Tag v-for="l in record.loaders" :key="l"
            :color="l.toLowerCase() === searchFilters?.loader?.toLowerCase() ? 'green' : 'orange'">
            {{ l }}
          </Tag>
        </template>
        <template v-if="column.key === 'action'">
          <Button type="text" size="small" class="opacity-60 hover:opacity-100"
            :disabled="isInstalled(record) || downloadingVersionId === record.id"
            :loading="downloadingVersionId === record.id"
            :title="isInstalled(record) ? t('TXT_CODE_INSTALLED') : t('TXT_CODE_DOWNLOAD')"
            :class="{ 'text-green-500': isInstalled(record) }" @click="handleDownload(record)">
            <template #icon>
              <loading-outlined v-if="downloadingVersionId === record.id" style="font-size: 16px" />
              <check-circle-outlined v-else-if="isInstalled(record)" style="font-size: 16px" />
              <cloud-download-outlined v-else style="font-size: 16px" />
            </template>
          </Button>
        </template>
      </template>
    </Table>
  </Modal>
</template>

<style scoped>
.desktop-modal-content {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
  background: var(--desktop-window-bg, #fff);
  color: var(--desktop-window-text, #000);
}

.du-dialog-fade-enter-active,
.du-dialog-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.25, 0.10, 0.25, 1.00);
}

.du-dialog-fade-enter-from,
.du-dialog-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
