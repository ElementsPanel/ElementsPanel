<script setup lang="ts">
import { VList, VListItem, VMenu } from "vuetify/components";

export interface ContextMenuItem {
  label: string;
  icon?: string | null;
  color?: string;
  disabled?: boolean;
  action: () => void;
}

defineProps<{
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}>();

const emit = defineEmits<{ close: [] }>();

const handleClick = (item: ContextMenuItem) => {
  if (item.disabled) return;
  item.action();
  emit("close");
};

const updateVisible = (visible: boolean) => {
  if (!visible) emit("close");
};
</script>

<template>
  <VMenu
    :model-value="visible"
    :target="[x, y]"
    location="bottom start"
    @update:model-value="updateVisible"
  >
    <VList min-width="190">
      <VListItem
        v-for="(item, index) in items"
        :key="`${item.label}-${index}`"
        :title="item.label"
        :prepend-icon="item.icon || undefined"
        :base-color="item.color"
        :disabled="item.disabled"
        @click="handleClick(item)"
      />
    </VList>
  </VMenu>
</template>
