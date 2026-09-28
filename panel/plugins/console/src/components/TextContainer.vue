<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  text: string;
  maxLength?: number;
}>();

const showText = computed(() => {
  if (!props.maxLength || props.text.length <= props.maxLength) {
    return props.text;
  }
  return props.text.slice(0, props.maxLength) + "…";
});
</script>

<template>
  <VTooltip location="top">
    <template #activator="{ props: tooltipProps }"><span v-bind="tooltipProps">
    <span>{{ showText }}</span>
    </span></template>
    <span>{{ props.text }}</span>
  </VTooltip>
</template>
