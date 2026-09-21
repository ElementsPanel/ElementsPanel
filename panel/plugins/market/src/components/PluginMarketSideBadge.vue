<script setup lang="ts">
import { t } from "@/lang/i18n";
import { computed } from "vue";
import { VChip } from "vuetify/components";
import type { PluginSide } from "../api";
import { sideBadgeKey } from "../sides";

const props = defineProps<{ sides?: PluginSide[] }>();

const label = computed(() => {
  const key = sideBadgeKey(props.sides);
  return key ? t(key) : undefined;
});
</script>

<template>
  <VChip v-if="label" size="small" variant="tonal" color="primary">{{ label }}</VChip>
</template>
