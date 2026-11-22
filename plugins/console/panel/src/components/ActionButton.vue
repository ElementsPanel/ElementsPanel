<script setup lang="ts">
import { VCard, VIcon } from "vuetify/components";
import { computed, type Component } from "vue";

const props = defineProps<{
  icon?: string | Component;
  title: string;
  click?: (...args: any) => any;
}>();

const isMdiIcon = computed(() => typeof props.icon === "string" || !props.icon);
</script>

<template>
  <div class="actions-button app-w-100">
    <div class="action-col">
      <VCard class="action-btn-item app-w-100 flex" data-app-surface="control" variant="text" rounded="6px" @click="click">
        <div>
          <VIcon v-if="isMdiIcon" :icon="(icon as string) || 'mdi-link-variant'" />
          <component :is="icon" v-else />
        </div>
        <div class="app-ml-8">
          {{ title }}
        </div>
      </VCard>
    </div>
  </div>
</template>

<style scoped lang="scss">
.action-btn-item {
  padding: 20px 12px;
  border: 1px solid var(--color-gray-3);
  background-color: var(--color-gray-2);

  user-select: none;
}
</style>
