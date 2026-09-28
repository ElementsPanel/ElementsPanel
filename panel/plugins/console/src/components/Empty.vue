<script lang="ts" setup>
defineProps<{
  description?: string;
}>();
</script>
<template>
  <div class="empty-state">
    <VIcon icon="mdi-inbox-outline" size="42" />
    <span class="color-info">{{ description }}</span>
  </div>
</template>
