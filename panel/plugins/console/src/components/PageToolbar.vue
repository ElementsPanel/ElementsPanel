<script setup lang="ts">
import { VCol, VIcon, VRow } from "vuetify/lib/components/index.mjs";

withDefaults(
  defineProps<{
    title: string;
    icon?: string;
  }>(),
  {
    icon: "mdi-view-dashboard-outline"
  }
);
</script>

<template>
  <VRow class="page-toolbar" align="center">
    <VCol cols="12" md="3" class="page-toolbar-title">
      <VIcon :icon="icon" class="page-toolbar-icon" size="28" />
      <span>{{ title }}</span>
    </VCol>
    <VCol cols="12" md="5" class="page-toolbar-search">
      <slot name="search" />
    </VCol>
    <VCol cols="12" md="4" class="page-toolbar-actions">
      <slot name="actions" />
    </VCol>
  </VRow>
</template>

<style lang="scss" scoped>
.page-toolbar {
  width: 100%;
  margin: -8px 0 0;
}

.page-toolbar > .v-col {
  min-width: 0;
  padding: 8px;
}

.page-toolbar-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-color);
  font-size: 20px;
  font-weight: 600;
}

.page-toolbar-icon {
  color: var(--text-color);
}

.page-toolbar-search,
.page-toolbar-actions {
  display: flex;
  align-items: center;
  min-width: 0;
}

.page-toolbar-search {
  justify-content: center;
}

.page-toolbar-actions {
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 992px) {
  .page-toolbar-title {
    font-size: 18px;
  }

  .page-toolbar-search,
  .page-toolbar-actions {
    justify-content: flex-start;
  }
}
</style>
