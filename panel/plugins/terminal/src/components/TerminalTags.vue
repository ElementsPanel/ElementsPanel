<script lang="ts" setup>
import type { TagInfo } from "@/components/interface";
import { VChip, VIcon } from "vuetify/components";

defineProps<{
  tags: TagInfo[];
  gap?: string;
}>();
</script>

<template>
  <div
    class="container"
    :style="{
      gap: gap || '6px'
    }"
  >
    <VChip
      v-for="tag in tags"
      :key="tag.label"
      class="tag m-0"
      :color="tag.color"
      :style="{
        cursor: tag.onClick ? 'pointer' : 'default'
      }"
      @click="tag.onClick?.()"
    >
      <VIcon v-if="typeof tag.icon === 'string'" :icon="tag.icon" />
      <component :is="tag.icon" v-else-if="tag.icon"></component>
      <span>{{ tag.label }}</span>
      <span>{{ tag.value }}</span>
    </VChip>
  </div>
</template>

<style scoped>
.container {
  display: flex;
  flex-wrap: wrap;
  justify-content: end;
  align-items: center;
}
.tag {
  align-items: center;
  display: flex;
  gap: 4px;
}

.tag:hover {
  border: 1px solid var(--color-blue-5);
}
</style>
