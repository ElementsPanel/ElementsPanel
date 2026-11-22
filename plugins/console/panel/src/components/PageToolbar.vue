<script setup lang="ts">
import { VCol, VIcon, VRow } from "vuetify/components";

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
  <VRow class="page-toolbar d-flex align-center" density="comfortable">
    <VCol cols="12" :md="$slots.search ? 3 : 4" class="page-toolbar-title">
      <VIcon :icon="icon" class="page-toolbar-icon" size="28" />
      <span>{{ title }}</span>
    </VCol>
    <VCol v-if="$slots.search" cols="12" md="5" class="page-toolbar-search">
      <slot name="search" />
    </VCol>
    <VCol cols="12" :md="$slots.search ? 4 : 8" class="page-toolbar-actions">
      <slot name="actions" />
    </VCol>
  </VRow>
</template>

<style lang="scss" scoped>
.page-toolbar {
  width: 100%;
  min-height: 56px;
  align-content: flex-start;
  margin-bottom: 20px;
  color: var(--text-color);
}

.page-toolbar > .v-col {
  min-width: 0;
}

.page-toolbar-title {
  display: flex;
  min-height: 56px;
  align-self: flex-start;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: 600;
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

// Below Vuetify's md breakpoint, the title occupies its own row.
@media (max-width: 839px) {
  .page-toolbar,
  .page-toolbar-title {
    min-height: 0;
  }
}
</style>
