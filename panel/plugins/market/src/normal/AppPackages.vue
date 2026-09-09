<script setup lang="ts">
import FadeUpAnimation from "@/components/FadeUpAnimation.vue";
import { t } from "@/lang/i18n";
import type { QuickStartPackages } from "@/types";
import { computed, onMounted } from "vue";
import { VBtn, VCard, VCardTitle, VCol, VIcon, VProgressCircular, VRow, VSelect, VTextField } from "vuetify/components";
import { SEARCH_ALL_KEY, useMarketPackages } from "../hooks/useMarketPackages";
import PackageDetailTable from "./PackageDetailTable.vue";

const props = defineProps<{ title?: string; btnText?: string; showCustomBtn?: boolean; onlyDockerTemplate?: boolean }>();
const emit = defineEmits<{
  "handle-select-template": [item: QuickStartPackages, type: "normal" | "docker"];
  "handle-select-category": [item: QuickStartPackages];
  "handle-back-to-category": [];
}>();

const { searchForm, appListLoading, filteredList: appList, platformOptions, handleSelectTopCategory, fetchTemplate } = useMarketPackages({ onlyDockerTemplate: props.onlyDockerTemplate });
const isCategoryView = computed(() => searchForm.gameType === SEARCH_ALL_KEY);
const detailList = computed(() => (isCategoryView.value ? [] : appList.value));
const handleBackToCategory = () => {
  searchForm.gameType = SEARCH_ALL_KEY;
  searchForm.platform = SEARCH_ALL_KEY;
  emit("handle-back-to-category");
};
const onCategoryCardClick = (item: QuickStartPackages) => emit("handle-select-category", item);
const onTemplateSelect = (item: QuickStartPackages, type: "normal" | "docker") => emit("handle-select-template", item, type);

onMounted(fetchTemplate);
defineExpose({ appList, fetchTemplate, handleSelectTopCategory });
</script>

<template>
  <VRow v-if="appListLoading" class="market-packages-row" align="center" justify="center">
    <VCol cols="12" class="market-loading">
      <VProgressCircular indeterminate color="primary" size="32" />
      <div class="mt-5 text-medium-emphasis">{{ t("TXT_CODE_7fca723a") }}</div>
    </VCol>
  </VRow>
  <VRow v-else class="market-packages-row">
    <VCol v-if="showCustomBtn" cols="12" class="d-flex justify-end">
      <VBtn variant="text" size="small">{{ t("TXT_CODE_181c72ba") }}</VBtn>
    </VCol>
    <VCol cols="12">
      <div class="detail-search-bar">
        <VSelect v-model="searchForm.platform" :items="platformOptions" item-title="label" item-value="value" :placeholder="t('TXT_CODE_47203b64')" class="detail-search-platform" hide-details />
        <VTextField v-model="searchForm.keyword" :placeholder="t('TXT_CODE_ce132192')" class="detail-search-keyword" variant="solo-filled" hide-details />
        <VBtn v-if="detailList.length > 0" variant="tonal" @click="handleBackToCategory"><VIcon start icon="mdi-arrow-left" />{{ t("TXT_CODE_c14b2ea3") }}</VBtn>
      </div>
    </VCol>
    <VCol v-if="appList.length === 0" cols="12"><div class="empty-state text-medium-emphasis">{{ t("TXT_CODE_7356e569") }}</div></VCol>
    <VCol v-else-if="detailList.length > 0" cols="12"><PackageDetailTable :data-source="detailList" :btn-text="btnText" @select="onTemplateSelect" /></VCol>
    <FadeUpAnimation v-else :delay="60" class="market-category-grid">
      <VCol v-for="item in appList" :key="item.key" cols="12" sm="6" md="4">
        <VCard class="package-image-container-summary h-100" rounded="xl" elevation="0" @click="onCategoryCardClick(item)">
          <img class="package-image" :src="item.image" alt="" />
          <VCardTitle class="text-center">{{ item.title }}</VCardTitle>
        </VCard>
      </VCol>
    </FadeUpAnimation>
  </VRow>
</template>

<style scoped>
.market-packages-row { width:100%; min-width:0; margin:0!important; box-sizing:border-box; }
.market-loading { height:50vh; display:flex; flex-direction:column; align-items:center; justify-content:center; }
.detail-search-bar { display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin-bottom:16px; }
.detail-search-platform { width:180px; flex-shrink:0; }
.detail-search-keyword { width:280px; max-width:100%; flex-shrink:0; }
.empty-state { display:flex; align-items:center; justify-content:center; height:40vh; }
.market-category-grid { width:100%; display:flex; flex-wrap:wrap; }
.package-image-container-summary { overflow:hidden; cursor:pointer; }
.package-image { width:100%; height:220px; object-fit:cover; display:block; }
</style>
