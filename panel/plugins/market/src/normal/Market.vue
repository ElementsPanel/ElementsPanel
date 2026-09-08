<script setup lang="ts">
import { router } from "@/config/router";
import PageToolbar from "@/components/PageToolbar.vue";
import { t } from "@/lang/i18n";
import McPreset from "./McPreset.vue";
import { VBtn, VDivider } from "vuetify/lib/components/index.mjs";

const openEditor = () => {
  router.push("/market/editor");
};
</script>

<template>
  <div class="market-page" style="height: 100%">
    <div>
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
    </div>
  </div>
</template>

<style lang="scss" scoped>
.market-page {
  width: 100%;
  min-width: 0;
  margin: 0 auto;
  box-sizing: border-box;
}
.market-description { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; color:var(--color-gray-7); margin-bottom:16px; }
</style>
