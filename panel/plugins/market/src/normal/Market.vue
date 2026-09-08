<script setup lang="ts">
import { router } from "@/config/router";
import PageToolbar from "@/components/PageToolbar.vue";
import { t } from "@/lang/i18n";
import McPreset from "./McPreset.vue";
import { VBtn, VContainer, VDivider } from "vuetify/lib/components/index.mjs";

const openEditor = () => {
  router.push("/market/editor");
};
</script>

<template>
  <main class="market-page">
    <VContainer fluid class="market-page-container">
      <PageToolbar :title="t('TXT_CODE_27594db8')" icon="mdi-storefront-outline">
        <template #actions>
          <VBtn variant="text" @click="openEditor">{{ t("TXT_CODE_85c10fde") }}</VBtn>
          <VDivider vertical class="mx-2" />
          <VBtn href="https://github.com/MCSManager/Script/issues/77" target="_blank" variant="text">
            {{ t("TXT_CODE_709c2db4") }}
          </VBtn>
        </template>
      </PageToolbar>
      <div class="market-description">
        <div class="market-description-text">
          <span>{{ t("TXT_CODE_c9ce7427") }}</span>
        </div>
      </div>
      <McPreset />
    </VContainer>
  </main>
</template>

<style lang="scss" scoped>
.market-page {
  width: 100%;
  min-height: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow-x: hidden;
}
.market-page-container {
  width: 100%;
  min-width: 0;
  max-width: var(--app-max-width);
  margin: 0 auto;
  box-sizing: border-box;
  padding: 20px 24px 32px;
}
.market-description { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; color:var(--color-gray-7); margin-bottom:16px; }

@media (max-width: 992px) {
  .market-page-container {
    padding: 16px 12px 28px;
  }
}
</style>
