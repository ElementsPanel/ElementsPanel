<script setup lang="ts">
import { VChip } from "vuetify/components";
import { t } from "@/lang/i18n";
import type { JavaRuntime } from "../types";
defineProps<{ runtime: JavaRuntime }>();
</script>

<template>
  <div>
    <VChip
      size="small"
      variant="tonal"
      :color="
        runtime.info.error
          ? 'error'
          : runtime.info.downloading
          ? 'warning'
          : runtime.usingInstances.length
          ? 'success'
          : undefined
      "
    >
      {{
        runtime.info.error
          ? t("TXT_CODE_javaMsl.failed")
          : runtime.info.downloading
          ? t("TXT_CODE_d919f7c7")
          : runtime.usingInstances.length
          ? t("TXT_CODE_bdb620b9")
          : t("TXT_CODE_15f2e564")
      }}
      <span v-if="runtime.info.downloading && runtime.info.progress != null" class="ms-1"
        >{{ runtime.info.progress }}%</span
      >
    </VChip>
    <p v-if="runtime.info.error" class="text-error text-caption mt-1 java-error">
      {{ runtime.info.error }}
    </p>
  </div>
</template>

<style scoped>
.java-error {
  max-width: 320px;
  overflow-wrap: anywhere;
}
</style>
