<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { useAppRouters } from "@/hooks/useAppRouters";
import {
  getInitLanguage,
  setLanguage,
  SUPPORTED_LANGS,
  t,
  toStandardLang
} from "@/lang/i18n";
import { getPanelFrontendService } from "@/pluginServices";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { ArrowRightOutlined } from "@ant-design/icons-vue";
import { computed, reactive, ref, type Component } from "vue";
import { completeOobe, updateOobeSettings } from "./api";

const skeletons = [
  { span: 6, rows: 4 },
  { span: 6, rows: 4 },
  { span: 6, rows: 4 },
  { span: 6, rows: 4 },
  { span: 24, rows: 9 },
  { span: 8, rows: 6 },
  { span: 16, rows: 6 },
  { span: 8, rows: 6 },
  { span: 16, rows: 6 }
];

const { state: appState, updatePanelStatus } = useAppStateStore();
const createAdminAccount = computed(() =>
  getPanelFrontendService<Component>("user.oobeCreateAdminAccount")
);

const step = ref(0);
const { toPage } = useAppRouters();
const formData = reactive({
  language: getInitLanguage()
});

const setLang = async (lang: string) => {
  lang = toStandardLang(lang);
  await updateOobeSettings().execute({
    data: {
      language: lang
    }
  });
  setLanguage(formData.language, false);
};

const continueFromLanguage = async () => {
  await setLang(formData.language);
  step.value++;
};

const startOobe = () => {
  step.value = createAdminAccount.value ? 2 : 3;
};

const finishLoading = ref(false);
const finishOobe = async () => {
  try {
    finishLoading.value = true;
    await completeOobe().execute();
    await updatePanelStatus();
    await toPage({
      path: "/",
      query: {
        from_install: 1
      }
    });
    window.location.reload();
  } finally {
    finishLoading.value = false;
  }
};
</script>

<template>
  <a-row :gutter="[24, 24]">
    <a-col v-for="i in skeletons" :key="i.span + i.rows" :span="i.span">
      <CardPanel :full-height="false">
        <template #body>
          <a-skeleton :paragraph="{ rows: i.rows }" />
        </template>
      </CardPanel>
    </a-col>
  </a-row>
  <div v-if="step === 0" class="install-page-container">
    <CardPanel :full-height="false" class="install-panel language-select-panel">
      <template #body>
        <a-typography style="text-align: center; margin-bottom: 40px">
          <a-typography-title :level="2" style="margin-bottom: 8px"> Language </a-typography-title>
          <a-typography-text type="secondary"> Choose your preferred language </a-typography-text>
        </a-typography>

        <div class="language-grid">
          <div
            v-for="lang in SUPPORTED_LANGS"
            :key="lang.value"
            class="language-card"
            :class="{ 'language-card-active': formData.language === lang.value }"
            @click="
              () => {
                formData.language = lang.value;
                setLang(formData.language);
              }
            "
          >
            <div class="language-card-inner language-label">
              {{ lang.label }}
            </div>
          </div>
        </div>

        <div class="text-center mt-35 mb-5">
          <a-button
            type="primary"
            size="large"
            style="min-width: 160px; height: 48px; font-size: 16px"
            @click="continueFromLanguage"
          >
            {{ t("TXT_CODE_5e9022f8") }}
            <ArrowRightOutlined />
          </a-button>
        </div>
      </template>
    </CardPanel>
  </div>
  <div v-if="step === 1" class="install-page-container" style="text-align: center">
    <CardPanel :full-height="false" class="install-panel">
      <template #body>
        <a-typography>
          <a-typography-title :level="3">
            {{ t("TXT_CODE_00000001") }}
          </a-typography-title>
          <a-typography-paragraph>
            <a-typography-text>
              {{ t("TXT_CODE_81d7e7c5") }}
            </a-typography-text>
          </a-typography-paragraph>
        </a-typography>
        <a-button
          v-if="appState.isInstall"
          disabled
          class="mt-45 mb-45"
          type="primary"
          size="large"
        >
          {{ t("TXT_CODE_3371000d") }}
        </a-button>
        <a-button
          v-else
          class="mt-45 mb-45"
          type="primary"
          size="large"
          style="min-width: 160px; height: 48px; font-size: 16px"
          @click="startOobe"
        >
          {{ t("TXT_CODE_351aaf7") }}
        </a-button>
      </template>
    </CardPanel>
  </div>
  <div v-if="step === 2" class="install-page-container">
    <CardPanel :full-height="false" class="install-panel">
      <template #body>
        <component
          :is="createAdminAccount"
          v-if="createAdminAccount"
          @complete="step = 3"
        />
      </template>
    </CardPanel>
  </div>
  <div v-if="step === 3" class="install-page-container">
    <CardPanel :full-height="false" class="install-panel">
      <template #body>
        <a-typography style="text-align: center">
          <a-typography-title :level="3">
            {{ t("TXT_CODE_97be50a8") }}
          </a-typography-title>
        </a-typography>
        <div class="text-center mt-35 mb-5">
          <a-button
            type="primary"
            size="large"
            :loading="finishLoading"
            style="min-width: 160px; height: 48px; font-size: 16px"
            @click="finishOobe"
          >
            {{ t("TXT_CODE_31e92ef3") }}
          </a-button>
        </div>
      </template>
    </CardPanel>
  </div>
</template>

<style lang="scss" scoped>
.install-page-container {
  position: fixed;
  left: 0px;
  right: 0px;
  bottom: 0px;
  top: 0px;
  background-color: #29292957;
  display: flex;
  justify-content: center;
  align-items: center;
  backdrop-filter: saturate(120%) blur(10px);
  z-index: 200;
  transition: all 0.8s;

  .install-panel {
    transition: all 0.6s;
    max-width: 480px;
    width: 100%;
    background-color: var(--login-panel-bg);
    backdrop-filter: saturate(120%) blur(12px);
    padding: 40px;
    max-height: 100%;
  }

  .language-select-panel {
    max-width: 640px;
  }

  :deep(.card-panel-content) {
    overflow: auto !important;
  }
}

.language-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  padding: 0 20px;

  @media (max-width: 576px) {
    grid-template-columns: 1fr;
    padding: 0 10px;
  }
}

.language-card {
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  padding: 16px 10px;
  border-radius: 6px;
  border: 1px solid var(--color-gray-3);
  background: var(--color-gray-4);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(24, 144, 255, 0.1) 0%, rgba(24, 144, 255, 0.05) 100%);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  &:hover {
    border-color: var(--color-gray-4);

    &::before {
      opacity: 0.5;
    }
  }
}

.language-card-active {
  border-color: #1890ff !important;
  background: linear-gradient(135deg, rgba(24, 144, 255, 0.15) 0%, rgba(24, 144, 255, 0.08) 100%);

  &::before {
    opacity: 1 !important;
  }

  .language-label {
    text-align: center;
    color: #1890ff;
  }
}

.language-card-inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.language-label {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-1);
  transition: all 0.3s ease;
}
</style>
