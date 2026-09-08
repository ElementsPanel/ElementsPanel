<script setup lang="ts">
import AppDialog from "@/components/AppDialog.vue";
import FadeUpAnimation from "@/components/FadeUpAnimation.vue";
import PageToolbar from "@/components/PageToolbar.vue";
import { router } from "@/config/router";
import { t } from "@/lang/i18n";
import { uploadFile } from "@/services/apis/layout";
import { useAppToolsStore } from "@/stores/useAppToolsStore";
import { filterEmptyFields } from "@/tools/object";
import { reportErrorMsg } from "@/tools/validator";
import type { QuickStartPackages, QuickStartTemplate } from "@/types";
import InstanceDetail from "@instance/widgets/instance/dialogs/InstanceDetail.vue";
import axios from "axios";
import { onMounted, ref } from "vue";
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VChip, VCol, VIcon, VProgressCircular, VRow, VSelect } from "vuetify/lib/components/index.mjs";
import { message } from "ant-design-vue";
import { updateMarketSettings } from "../api";
import { useMarketPackages } from "../hooks/useMarketPackages";

const isNewTemplate = Boolean(router.currentRoute.value.query.newTemplate as string);
const { openInputDialog } = useAppToolsStore();
const { searchForm, packages, appListLoading, filteredList: appList, rawList, languageOptions: appLangList, gameTypeOptions: appGameTypeList, categoryOptions: appCategoryList, platformOptions: appPlatformList, handleReset, handleGameTypeChange, handleLanguageChange, handlePlatformChange, handleSelectTopCategory, fetchTemplate } = useMarketPackages();
const { execute: execUpload, state: fileName, isLoading: upLoading } = uploadFile();
const { execute: saveSettings, isLoading: saveSetLoading } = updateMarketSettings();
const editorRef = ref<InstanceType<typeof InstanceDetail>>();
const fileInput = ref<HTMLInputElement>();
const confirmClearOpen = ref(false);
const confirmUploadOpen = ref(false);
const multipleMode = ref(false);
const selectedItems = ref<QuickStartPackages[]>([]);

const loadFile = (file?: File) => {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      if (typeof event.target?.result !== "string") throw new Error();
      const jsonData = JSON.parse(event.target.result) as QuickStartTemplate;
      packages.value = jsonData.packages || [];
      appLangList.value = jsonData.languages || [];
    } catch { message.error(t("TXT_CODE_bddc37e2")); }
  };
  reader.onerror = () => message.error(t("TXT_CODE_a62886b9"));
  reader.readAsText(file);
};
const handleFileChange = (event: Event) => { loadFile((event.target as HTMLInputElement).files?.[0]); (event.target as HTMLInputElement).value = ""; };
const cleanAxios = axios.create({ headers: { "x-requested-with": null }, params: {} });
const importFromLink = async (addr?: string) => {
  try {
    if (!addr) addr = await openInputDialog(t("TXT_CODE_ac10fe01"));
    if (!addr) return message.error(t("TXT_CODE_ac10fe01"));
    appListLoading.value = true;
    const res = await cleanAxios.get(addr);
    packages.value = res.data.packages || [];
    appLangList.value = res.data.languages || [];
  } catch (err) { reportErrorMsg(err); } finally { appListLoading.value = false; }
};
const importFromClipboard = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text.startsWith("http")) return importFromLink(text);
    const jsonData = JSON.parse(text) as QuickStartTemplate;
    packages.value = jsonData.packages || [];
    appLangList.value = jsonData.languages || [];
  } catch (err: any) { message.error(err instanceof SyntaxError ? t("TXT_CODE_bddc37e2") : err.name === "NotAllowedError" ? t("TXT_CODE_2a22c2ff") : err.message); }
};
const downloadMarketJson = () => {
  if (!packages.value.length) return message.warning(t("TXT_CODE_8e223f23"));
  const url = URL.createObjectURL(new Blob([JSON.stringify(rawList.value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "market.json"; link.click(); URL.revokeObjectURL(url);
  message.success(t("TXT_CODE_38fb23a8"));
};
const findFn = (pkg: QuickStartPackages, item: QuickStartPackages) => pkg.targetLink === item.targetLink && pkg.title === item.title && pkg.gameType === item.gameType && pkg.language === item.language && pkg.platform === item.platform && pkg.category === item.category;
const findItem = (item: QuickStartPackages) => selectedItems.value.find((value) => findFn(value, item));
const toEdit = (item: QuickStartPackages) => editorRef.value?.openDialog({ item, i: packages.value.findIndex((pkg) => findFn(pkg, item)) });
const saveTemplate = (item: QuickStartPackages, index: number) => { const value = filterEmptyFields(item); if (index < 0) packages.value.push(value); else packages.value[index] = value; };
const handleSelectItem = (item: QuickStartPackages) => {
  if (item.isSummary) return;
  if (!multipleMode.value) return toEdit(item);
  const selected = findItem(item); if (selected) selectedItems.value.splice(selectedItems.value.indexOf(selected), 1); else selectedItems.value.push(item);
};
const selectAllItems = () => { selectedItems.value = selectedItems.value.length === appList.value.filter((i) => !i.isSummary).length ? [] : appList.value.filter((i) => !i.isSummary); };
const exitMultipleMode = () => { multipleMode.value = false; selectedItems.value = []; };
const batchDelete = () => {
  if (!selectedItems.value.length) return message.warning(t("TXT_CODE_72952e19"));
  selectedItems.value.forEach((item) => { const index = packages.value.findIndex((pkg) => findFn(pkg, item)); if (index >= 0) packages.value.splice(index, 1); });
  selectedItems.value = []; message.success(t("TXT_CODE_28190dbc"));
};
const clearPackages = () => {
  confirmClearOpen.value = false;
  packages.value = [];
  selectedItems.value = [];
};
const performUpload = async () => {
  const uploadFormData = new FormData(); uploadFormData.append("file", new Blob([JSON.stringify(rawList.value, null, 2)], { type: "application/json" }));
  try {
    await execUpload({ data: uploadFormData, timeout: Number.MAX_SAFE_INTEGER });
    await saveSettings({ data: { presetPackAddr: `public/upload_files/${fileName.value}` } });
    message.success(t("TXT_CODE_a7907771"));
    setTimeout(() => router.push({ path: "/market", query: { newTemplate: "true" } }), 500);
  } catch (err) { reportErrorMsg(err); }
};
const uploadToPanel = async () => { if (!packages.value.length) confirmUploadOpen.value = true; else await performUpload(); };

onMounted(() => { if (isNewTemplate) packages.value = []; else fetchTemplate(); });
</script>

<template>
  <main class="market-editor">
    <PageToolbar :title="t('TXT_CODE_54275b9c')" icon="mdi-pencil-outline">
      <template #actions>
        <div class="toolbar-group toolbar-group-all">
          <VBtn :loading="upLoading || saveSetLoading" variant="tonal" @click="uploadToPanel"><VIcon start icon="mdi-content-save" />{{ t("TXT_CODE_592eff33") }}</VBtn>
          <VBtn variant="tonal" @click="downloadMarketJson"><VIcon start icon="mdi-download" />{{ t("TXT_CODE_c5a46eba") }}</VBtn>
          <VBtn color="error" variant="tonal" @click="confirmClearOpen = true"><VIcon start icon="mdi-delete" />{{ t("TXT_CODE_75da3f2d") }}</VBtn>
          <template v-if="!packages.length">
            <input ref="fileInput" hidden type="file" accept=".json" @change="handleFileChange" />
            <VBtn color="warning" variant="tonal" @click="fileInput?.click()"><VIcon start icon="mdi-file-upload" />{{ t("TXT_CODE_fd0cdf5d") }}</VBtn>
            <VBtn color="warning" variant="tonal" @click="importFromLink()"><VIcon start icon="mdi-link" />{{ t("TXT_CODE_dfc4b650") }}</VBtn>
            <VBtn color="warning" variant="tonal" @click="importFromClipboard"><VIcon start icon="mdi-content-paste" />{{ t("TXT_CODE_caaac421") }}</VBtn>
          </template>
          <template v-if="multipleMode">
            <span>{{ t("TXT_CODE_379fa48a") }}: {{ selectedItems.length }} {{ t("TXT_CODE_5cd3b4bd") }}</span>
            <VBtn variant="tonal" @click="exitMultipleMode">{{ t("TXT_CODE_5366af54") }}</VBtn>
            <VBtn variant="tonal" @click="selectAllItems">{{ appList.length && appList.length === selectedItems.length ? t("TXT_CODE_df87c46d") : t("TXT_CODE_f466d7a") }}</VBtn>
            <VBtn color="error" @click="batchDelete"><VIcon start icon="mdi-delete" />{{ t("TXT_CODE_ecbd7449") }}</VBtn>
          </template>
          <VBtn v-else variant="tonal" @click="multipleMode = true">{{ t("TXT_CODE_5cb656b9") }}</VBtn>
          <VBtn color="success" @click="editorRef?.openDialog({ i: -1 })"><VIcon start icon="mdi-plus" />{{ t("TXT_CODE_3d45d8d") }}</VBtn>
        </div>
      </template>
    </PageToolbar>
    <p class="text-medium-emphasis">{{ t("TXT_CODE_372e7b9c") }}</p>

    <div class="section-title mt-8"><VIcon icon="mdi-database" />{{ t("TXT_CODE_88249aee") }}</div>
    <p class="text-medium-emphasis">{{ t("TXT_CODE_c9ce7427") }}</p>
    <div class="market-filters">
      <VSelect v-model="searchForm.language" :items="appLangList" item-title="label" item-value="value" :placeholder="t('TXT_CODE_8a30e150')" variant="solo-filled" hide-details @update:model-value="handleLanguageChange" />
      <VSelect v-model="searchForm.gameType" :items="appGameTypeList" item-title="label" item-value="value" :placeholder="t('TXT_CODE_107695d')" variant="solo-filled" hide-details @update:model-value="handleGameTypeChange" />
      <VSelect v-model="searchForm.platform" :items="appPlatformList" item-title="label" item-value="value" :placeholder="t('TXT_CODE_47203b64')" variant="solo-filled" hide-details @update:model-value="handlePlatformChange" />
      <VSelect v-model="searchForm.category" :items="appCategoryList" item-title="label" item-value="value" :placeholder="t('TXT_CODE_ebbb2def')" variant="solo-filled" hide-details />
      <VBtn variant="tonal" @click="handleReset">{{ t("TXT_CODE_880fedf7") }}</VBtn>
    </div>

    <div v-if="appListLoading" class="market-loading"><VProgressCircular indeterminate color="primary" /><span>{{ t("TXT_CODE_7fca723a") }}</span></div>
    <div v-else-if="!appList.length" class="market-empty">
      <span>{{ t("TXT_CODE_7356e569") }}</span>
      <VBtn v-if="!packages.length" variant="tonal" @click="fileInput?.click()"><VIcon start icon="mdi-file-upload" />{{ t("TXT_CODE_8e16ee21") }}</VBtn>
    </div>
    <VRow v-else>
      <FadeUpAnimation class="market-card-grid">
        <VCol v-for="item in appList" :key="item.key" :data-index="item.key" cols="12" sm="6" :lg="item.isSummary ? 4 : 3">
          <VCard rounded="xl" elevation="0" class="market-card" :class="{ selected: multipleMode && findItem(item) }" @click="item.isSummary ? handleSelectTopCategory(item) : undefined">
            <img class="package-image" :src="item.image" alt="" />
            <VCardTitle>{{ item.title }}<VChip v-if="item.platform" size="small" variant="tonal">{{ String(item.platform).toLowerCase() === "all" ? t("TXT_CODE_all_platform") : item.platform }}</VChip></VCardTitle>
            <VCardText v-if="!item.isSummary" class="package-content">
              <div class="package-tags"><VChip v-for="tag in item.tags" :key="tag" size="small" color="primary" variant="tonal">{{ tag }}</VChip></div>
              <p>{{ item.description || "\u00a0" }}</p>
              <p v-if="item.runtime"><span class="text-medium-emphasis">{{ t("TXT_CODE_18b94497") }}: </span>{{ item.runtime }}</p>
              <p v-if="item.hardware"><span class="text-medium-emphasis">{{ t("TXT_CODE_683e3033") }}: </span>{{ item.hardware }}</p>
            </VCardText>
            <VCardActions v-if="!item.isSummary"><VBtn block color="primary" @click.stop="handleSelectItem(item)"><VIcon start :icon="multipleMode ? 'mdi-checkbox-marked-outline' : 'mdi-download'" />{{ multipleMode ? (findItem(item) ? t("TXT_CODE_abedfd03") : t("TXT_CODE_7b2c5414")) : t("TXT_CODE_1704ea49") }}</VBtn></VCardActions>
          </VCard>
        </VCol>
      </FadeUpAnimation>
    </VRow>

    <InstanceDetail ref="editorRef" :game-type-list="appGameTypeList" :platform-list="appPlatformList" :category-list="appCategoryList" @save-template="saveTemplate" />
    <AppDialog v-model:open="confirmClearOpen" :title="t('TXT_CODE_617ce69c')" compact ok-color="error" @ok="clearPackages"><div>{{ t("TXT_CODE_276756b2") }}</div></AppDialog>
    <AppDialog v-model:open="confirmUploadOpen" :title="t('TXT_CODE_617ce69c')" compact @ok="confirmUploadOpen = false; performUpload()"><div>{{ t("TXT_CODE_f88db280") }}</div></AppDialog>
  </main>
</template>

<style scoped>
.market-editor { width:100%; min-width:0; }
.toolbar-group { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.toolbar-group-all { width:100%; justify-content:flex-end; }
.market-filters { display:grid; grid-template-columns:repeat(4,minmax(160px,1fr)) auto; gap:10px; align-items:center; margin:16px 0; }
.market-loading,.market-empty { min-height:40vh; display:flex; flex-direction:column; gap:16px; align-items:center; justify-content:center; color:var(--color-gray-7); }
.market-card-grid { width:100%; display:flex; flex-wrap:wrap; }
.market-card { height:100%; display:flex; flex-direction:column; overflow:hidden; cursor:pointer; }
.market-card.selected { outline:2px solid rgb(var(--v-theme-primary)); }
.package-image { display:block; width:100%; height:200px; object-fit:cover; }
.v-card-title { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.package-content { flex:1; font-size:12px; }
.package-tags { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:8px; }
@media (max-width:900px) { .market-filters { grid-template-columns:1fr 1fr; } }
@media (max-width:600px) { .market-filters { grid-template-columns:1fr; } }
</style>
