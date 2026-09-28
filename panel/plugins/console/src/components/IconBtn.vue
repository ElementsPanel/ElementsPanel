<script setup lang="ts">
import type { FunctionalComponent } from "vue";

defineProps<{
  icon: FunctionalComponent | string;
  title: string;
  placement?: string;
}>();

defineEmits(["click"]);
</script>

<template>
  <VTooltip :location="(placement || 'top') as any">
    <template #activator="{ props: tooltipProps }">
      <span v-bind="tooltipProps" class="btn" @click="$emit('click')">
        <VIcon v-if="typeof icon === 'string'" :icon="icon" />
        <component :is="icon" v-else></component>
      </span>
    </template>
    <span>{{ title }}</span>
  </VTooltip>
</template>

<style scoped lang="scss">
.btn {
  padding: 6px 8px;
  border: 1px solid rgb(0, 0, 0, 0);

  cursor: pointer;
  user-select: none;
  transition: all 0.4s;
  border-radius: 6px;

  &:hover {
    background-color: var(--color-gray-2);
    border: 1px solid var(--color-gray-8);
    box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.16);
  }
}
</style>
