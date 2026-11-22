<script setup lang="ts">
import { VChip } from "vuetify/components";
import { t } from "@elementspanel/epanel-plugin-i18n";
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
          ? t("TXT_CODE_JAVA_MSL_FAILED")
          : runtime.info.downloading
          ? t("TXT_CODE_JAVA_RUNTIME_DOWNLOADING")
          : runtime.usingInstances.length
          ? t("TXT_CODE_COMMON_RUNNING")
          : t("TXT_CODE_INSTANCE_NOT_RUNNING")
      }}
      <span v-if="runtime.info.downloading && runtime.info.progress != null" class="ms-1"
        >{{ runtime.info.progress }}%</span
      >
    </VChip>
    <p v-if="runtime.info.error" class="text-error text-caption app-mt-1 java-error">
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
