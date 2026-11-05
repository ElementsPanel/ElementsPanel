<script lang="ts" setup>
import { t } from "@elementspanel/epanel-plugin-i18n";
import { VIcon } from "vuetify/components";

withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    icon?: string | false;
    compact?: boolean;
  }>(),
  {
    icon: "mdi-inbox-outline",
    compact: false
  }
);
</script>

<template>
  <div class="app-empty" :class="{ 'app-empty--compact': compact }" role="status">
    <VIcon v-if="icon" :icon="icon" size="48" class="app-empty-icon" />
    <div class="app-empty-title">{{ title || t("TXT_CODE_NO_DATA") }}</div>
    <div v-if="description" class="app-empty-text">{{ description }}</div>
    <div v-if="$slots.actions" class="app-empty-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.app-empty {
  width: 100%;
  min-width: 0;
  min-height: 38vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 24px;
  text-align: center;
  color: var(--color-gray-7);
}

.app-empty-icon {
  margin-bottom: 8px;
  color: var(--color-gray-6);
}

.app-empty-title {
  color: var(--color-gray-8);
  font-size: 1rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.app-empty-text {
  max-width: 460px;
  color: var(--color-gray-7);
  font-size: 0.875rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.app-empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
}

.app-empty--compact {
  min-height: 0;
  padding: 24px 16px;
}
</style>
