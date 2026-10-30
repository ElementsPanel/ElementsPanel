<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ fontSize?: number }>();

const fontSize = computed(() => {
  return props.fontSize ?? 48;
});

</script>

<template>
  <div class="flex align-center justify-center h-100 w-100">
    <VProgressCircular indeterminate :size="fontSize" />
  </div>
</template>

<style lang="scss" scoped></style>
