<script setup lang="ts">
import { t } from "@/lang/i18n";
import { useAppConfigStore } from "@/stores/useAppConfigStore";
import { Translation as I18nT } from "vue-i18n";
import { VBtn } from "vuetify/components";

const { logoImage } = useAppConfigStore();
const repositoryUrl = "https://github.com/ElementsPanel/ElementsPanel";
</script>

<template>
  <div class="about-page">
    <div class="about-brand">
      <img :src="logoImage" alt="ElementsPanel" class="about-logo" />
      <I18nT keypath="TXT_CODE_ABOUT_ORIGIN" tag="p" scope="global" class="about-origin">
        <template #project>
          <a
            href="https://github.com/MCSManager/MCSManager"
            target="_blank"
            rel="noopener noreferrer"
          >
            MCSManager
          </a>
        </template>
      </I18nT>
      <VBtn
        :href="repositoryUrl"
        target="_blank"
        rel="noopener noreferrer"
        color="primary"
        variant="tonal"
        prepend-icon="mdi-github"
      >
        {{ t("TXT_CODE_ABOUT_SOURCE") }}
      </VBtn>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.about-page {
  width: 100%;
  max-width: 880px;
  margin: 0 auto;
  padding: 24px 0 48px;
  color: var(--text-color);
}

.about-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 24px 24px 40px;
}

.about-origin {
  margin: 0;
  font-size: 15px;
  line-height: 1.8;
  text-align: center;
  overflow-wrap: anywhere;
}

.about-logo {
  display: block;
  width: 320px;
  max-width: 100%;
  height: 84px;
  object-fit: contain;
}

.about-origin a {
  color: rgb(var(--v-theme-primary));
  text-underline-offset: 3px;
}

@media (max-width: 600px) {
  .about-page {
    padding-top: 8px;
  }

  .about-brand {
    padding-bottom: 28px;
  }
}
</style>
