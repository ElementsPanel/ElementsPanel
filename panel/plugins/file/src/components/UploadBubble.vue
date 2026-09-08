<script setup lang="ts">
import { t } from "@/lang/i18n";
import uploadService from "../services/uploadService";
import { computed } from "vue";
import { VBadge, VBtn, VIcon, VTooltip } from "vuetify/lib/components/index.mjs";

const uploadData = uploadService.uiData;
const uploadCount = computed(() => {
  return uploadData.value.files[1] - uploadData.value.files[0] + 1;
});
const uploadProgress = computed(() => {
  if (uploadService.uiData.value.current) {
    return (
      (uploadService.uiData.value.current[0] * 100) /
      uploadService.uiData.value.current[1]
    ).toFixed(0);
  }
  return "0";
});
</script>

<template>
  <div v-if="uploadData.current && !uploadData.suspending" class="upload-bubble-wrap">
    <VTooltip location="start">
      <template #activator="{ props }">
        <VBadge :content="uploadCount" color="primary" :max="99" floating>
          <VBtn v-bind="props" class="upload-bubble" icon variant="flat" color="surface">
            <VIcon icon="mdi-cloud-upload-outline" />
          </VBtn>
        </VBadge>
      </template>
      {{ t("TXT_CODE_b0ff4172", { n: uploadCount }) + ` (${uploadProgress}%)` }}
    </VTooltip>
  </div>
</template>

<style scoped lang="scss">
.upload-bubble-wrap {
  position: fixed;
  z-index: 10;
  right: 24px;
  bottom: 24px;
}

.upload-bubble {
  background-color: rgba(255, 255, 255, 0.6) !important;
  backdrop-filter: blur(12px) saturate(180%);
  -webkit-backdrop-filter: blur(12px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.upload-bubble:hover {
  background-color: rgba(255, 255, 255, 0.8) !important;
}
</style>
