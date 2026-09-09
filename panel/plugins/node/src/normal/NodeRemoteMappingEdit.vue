<script setup lang="ts">
import { t } from "@/lang/i18n";
import { useVModel } from "@vueuse/core";
import _ from "lodash";
import type { PropType } from "vue";
import {
  VBtn,
  VCard,
  VCardText,
  VCol,
  VIcon,
  VRow,
  VTextField,
  VTextarea
} from "vuetify/components";

type RemoteMappingItem = IPanelOverviewRemoteMappingResponse;

const DEFAULT_MAPPING = {
  from: { ip: "", port: 24444, prefix: "" },
  to: { ip: "", port: 24444, prefix: "" }
};

const props = defineProps({
  value: { type: Array as PropType<RemoteMappingItem[]>, required: true }
});
const emit = defineEmits<{ "update:value": [value: RemoteMappingItem[]] }>();
const remoteMappings = useVModel(props, "value", emit);

const addMapping = () => {
  remoteMappings.value = [...remoteMappings.value, _.cloneDeep(DEFAULT_MAPPING)];
};
const removeMapping = (index: number) => {
  remoteMappings.value = remoteMappings.value.filter((_, currentIndex) => currentIndex !== index);
};
</script>

<template>
  <div class="remote-mapping-editor">
    <div v-if="remoteMappings.length === 0" class="remote-mapping-empty">
      <span>{{ t("TXT_CODE_8036ea5e") }}</span>
      <VBtn color="primary" variant="tonal" prepend-icon="mdi-plus" @click="addMapping">
        {{ t("TXT_CODE_8d8fbbf4") }}
      </VBtn>
    </div>

    <template v-else>
      <div class="remote-mapping-head">
        <span>{{ t("TXT_CODE_2ee6fd18") }}</span>
        <span>{{ t("TXT_CODE_6f27624c") }}</span>
      </div>

      <VCard v-for="(mapping, index) in remoteMappings" :key="index" class="remote-mapping-card" variant="tonal" flat>
        <VCardText>
          <VRow align="center">
            <VCol cols="12" md="5">
              <div class="mapping-side-title">{{ t("TXT_CODE_2ee6fd18") }}</div>
              <VRow dense>
                <VCol cols="12" sm="8">
                  <VTextField v-model="mapping.from.ip" :label="t('TXT_CODE_54312194')" density="compact" hide-details variant="solo-filled" />
                </VCol>
                <VCol cols="12" sm="4">
                  <VTextField v-model.number="mapping.from.port" type="number" min="1" max="65535" density="compact" hide-details variant="solo-filled" />
                </VCol>
                <VCol cols="12">
                  <VTextarea v-model="mapping.from.prefix" :label="t('TXT_CODE_941d83b8')" rows="1" auto-grow density="compact" hide-details variant="solo-filled" />
                </VCol>
              </VRow>
            </VCol>
            <VCol cols="12" md="1" class="mapping-arrow"><VIcon icon="mdi-arrow-right" /></VCol>
            <VCol cols="12" md="5">
              <div class="mapping-side-title">{{ t("TXT_CODE_6f27624c") }}</div>
              <VRow dense>
                <VCol cols="12" sm="8">
                  <VTextField v-model="mapping.to.ip" :label="t('TXT_CODE_54312194')" density="compact" hide-details variant="solo-filled" />
                </VCol>
                <VCol cols="12" sm="4">
                  <VTextField v-model.number="mapping.to.port" type="number" min="1" max="65535" density="compact" hide-details variant="solo-filled" />
                </VCol>
                <VCol cols="12">
                  <VTextarea v-model="mapping.to.prefix" :label="t('TXT_CODE_941d83b8')" rows="1" auto-grow density="compact" hide-details variant="solo-filled" />
                </VCol>
              </VRow>
            </VCol>
            <VCol cols="12" md="1" class="mapping-delete">
              <VBtn icon color="error" variant="text" :aria-label="t('TXT_CODE_6f2c1806')" @click="removeMapping(index)">
                <VIcon icon="mdi-delete-outline" />
              </VBtn>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>

      <div class="remote-mapping-actions">
        <VBtn variant="tonal" prepend-icon="mdi-plus" @click="addMapping">{{ t("TXT_CODE_8d8fbbf4") }}</VBtn>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.remote-mapping-editor { display: flex; flex-direction: column; gap: 12px; }
.remote-mapping-empty, .remote-mapping-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 12px; }
.remote-mapping-empty { min-height: 96px; color: var(--color-gray-7); }
.remote-mapping-head { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; color: var(--color-gray-7); font-size: 13px; text-align: center; }
.remote-mapping-card { color: var(--text-color); }
.mapping-side-title { display: none; margin-bottom: 8px; color: var(--color-gray-7); font-size: 13px; font-weight: 600; }
.mapping-arrow, .mapping-delete { display: flex; align-items: center; justify-content: center; }
@media (max-width: 959px) {
  .remote-mapping-head { display: none; }
  .mapping-side-title { display: block; }
  .mapping-arrow { transform: rotate(90deg); }
}
</style>
