<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import LineOption from "@/components/LineOption.vue";
import { configData } from "@/config/instanceConfigMap";
import { t } from "@/lang/i18n";
import { getDescriptionByTitle, jsonToMap } from "@/tools/common";
import isEmpty from "lodash/isEmpty";

const props = defineProps<{
  config: Record<string, any>;
  configName: string;
  isDesktop?: boolean;
}>();

const data:
  | {
    desc: string;
    config: Record<string, any>;
  }
  | undefined = configData[props.configName];

import { computed } from "vue";
import { VCard, VCardText, VCol } from "vuetify/components";

const parsedConfig = computed(() => jsonToMap(props.config));
</script>

<template>
  <template v-if="isDesktop">
    <VCol cols="12">
      <VCard class="config-editor-panel" variant="tonal" rounded="xl">
        <VCardText>
          <h3 class="config-editor-title">{{ data ? t("TXT_CODE_958fd70c") : t("TXT_CODE_2ce953da") }}</h3>
          <p class="config-editor-description">{{ data ? data.desc : t("TXT_CODE_75e5af9b") }}</p>
        </VCardText>
      </VCard>
    </VCol>
    <VCol v-if="data" cols="12">
      <VCard class="config-editor-panel" variant="tonal" rounded="xl">
        <VCardText>
          <div v-if="!isEmpty(props.config)">
            <div v-for="(item, index) in parsedConfig" :key="index" class="p-1">
              <LineOption :option-value="parsedConfig" :option-key="String(index)" is-desktop>
                <template #title>{{ index }}</template>
                <template #info>{{ getDescriptionByTitle(data?.config, String(index)) }}</template>
              </LineOption>
            </div>
          </div>
          <div v-else>{{ t("TXT_CODE_1a730d48") }}</div>
        </VCardText>
      </VCard>
    </VCol>
  </template>
  <template v-else>
  <a-col :span="24">
    <CardPanel style="height: 100%" class="config-editor-panel">
      <template #body>
        <a-typography>
          <a-typography-title :level="5">
            {{ data ? t("TXT_CODE_958fd70c") : t("TXT_CODE_2ce953da") }}
          </a-typography-title>
          <a-typography-paragraph v-if="data">
            {{ data?.desc }}
          </a-typography-paragraph>
          <a-typography-paragraph v-else>
            {{ t("TXT_CODE_75e5af9b") }}
          </a-typography-paragraph>
        </a-typography>
      </template>
    </CardPanel>
  </a-col>
  <a-col v-if="data" :span="24">
    <CardPanel style="height: 100%" class="config-editor-panel">
      <template #body>
        <div v-if="!isEmpty(props.config)">
          <div v-for="(item, index) in parsedConfig" :key="index" class="p-1">
            <LineOption :option-value="parsedConfig" :option-key="String(index)">
              <template #title>{{ index }}</template>
              <template #info>{{ getDescriptionByTitle(data?.config, String(index)) }}</template>
            </LineOption>
          </div>
        </div>
        <div v-else>
          {{ t("TXT_CODE_1a730d48") }}
        </div>
      </template>
    </CardPanel>
  </a-col>
  </template>
</template>

<style lang="scss" scoped>
:deep(.desktop-mode) {
  .config-editor-panel {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;

    .ant-card-body {
      padding: 0 !important;
    }
  }

  .line-option-card {
    background: transparent !important;
    box-shadow: none !important;

    &:hover {
      background: var(--desktop-window-control-hover) !important;
    }
  }
}

.desktop-mode {
  .config-editor-panel {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;

    :deep(.ant-card-body) {
      padding: 0 !important;
    }
  }

  :deep(.line-option-card) {
    background: transparent !important;
    box-shadow: none !important;

    &:hover {
      background: var(--desktop-window-control-hover) !important;
    }
  }
}

.config-editor-title { margin: 0 0 6px; font-size: 16px; font-weight: 600; }
.config-editor-description { margin: 0; color: var(--desktop-window-text-secondary, rgba(0, 0, 0, 0.6)); line-height: 1.5; }
</style>
