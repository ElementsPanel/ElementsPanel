<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import LineOption from "@/components/LineOption.vue";
import { configData } from "../config/instanceConfigMap";
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
import { VCol, VRow } from "vuetify/components";

const parsedConfig = computed(() => jsonToMap(props.config));
</script>

<template>
  <template v-if="isDesktop">
    <VCol cols="12">
      <div class="config-editor-section">
        <h3 class="config-editor-title">{{ data ? t("TXT_CODE_958fd70c") : t("TXT_CODE_2ce953da") }}</h3>
        <p class="config-editor-description">{{ data ? data.desc : t("TXT_CODE_75e5af9b") }}</p>
      </div>
    </VCol>
    <VCol v-if="data" cols="12">
      <div class="config-editor-section">
        <div v-if="!isEmpty(props.config)">
          <div v-for="(item, index) in parsedConfig" :key="index" class="p-1">
            <LineOption :option-value="parsedConfig" :option-key="String(index)" is-desktop>
              <template #title>{{ index }}</template>
              <template #info>{{ getDescriptionByTitle(data?.config, String(index)) }}</template>
            </LineOption>
          </div>
        </div>
        <div v-else>{{ t("TXT_CODE_1a730d48") }}</div>
      </div>
    </VCol>
  </template>
  <template v-else>
  <VCol cols="12">
    <CardPanel style="height: 100%" class="config-editor-panel">
      <template #body>
          <h5 class="text-title-large mb-2">
            {{ data ? t("TXT_CODE_958fd70c") : t("TXT_CODE_2ce953da") }}
          </h5>
          <p v-if="data">
            {{ data?.desc }}
          </p>
          <p v-else>
            {{ t("TXT_CODE_75e5af9b") }}
          </p>
      </template>
    </CardPanel>
  </VCol>
  <VCol v-if="data" cols="12">
    <CardPanel style="height: 100%" class="config-editor-panel">
      <template #body>
        <VRow v-if="!isEmpty(props.config)" class="config-option-grid">
          <VCol v-for="(item, index) in parsedConfig" :key="index" cols="12" sm="6" lg="4">
            <LineOption card :option-value="parsedConfig" :option-key="String(index)">
              <template #title>{{ index }}</template>
              <template #info>{{ getDescriptionByTitle(data?.config, String(index)) }}</template>
            </LineOption>
          </VCol>
        </VRow>
        <div v-else>
          {{ t("TXT_CODE_1a730d48") }}
        </div>
      </template>
    </CardPanel>
  </VCol>
  </template>
</template>

<style lang="scss" scoped>
.config-editor-section {
  padding: 16px;
}

.config-option-grid {
  width: 100%;
  margin: 0;
}

.config-editor-title { margin: 0 0 6px; font-size: 16px; font-weight: 600; }
.config-editor-description { margin: 0; color: var(--desktop-window-text-secondary, rgba(0, 0, 0, 0.6)); line-height: 1.5; }
</style>
