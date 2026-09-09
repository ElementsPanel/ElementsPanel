<script setup lang="ts">
import { t } from "@/lang/i18n";
import { toCopy } from "@/tools/copy";
import { VBtn, VIcon, VTooltip } from "vuetify/components";

const props = defineProps<{
  size?: string;
  type?: string;
  value: string;
}>();
</script>

<template>
  <VTooltip :text="t('TXT_CODE_13ae6a93')">
    <template #activator="{ props: tooltipProps }">
      <VBtn v-bind="tooltipProps" icon variant="text" rounded="xl" :size="size || 'small'" :color="type === 'danger' ? 'error' : undefined"
        @click="toCopy(props.value)">
        <VIcon icon="mdi-content-copy" />
      </VBtn>
    </template>
  </VTooltip>
</template>
