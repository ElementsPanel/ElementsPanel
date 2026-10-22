<script setup lang="ts">
import { t } from "@/lang/i18n";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { useBackgroundTasks } from "@/stores/useBackgroundTasks";
import { VBadge, VBtn, VTooltip } from "vuetify/components";

const { isLogged } = useAppStateStore();
const { open, activeCount, refresh } = useBackgroundTasks();
const toggle = () => {
  open.value = !open.value;
  if (open.value) void refresh();
};
</script>

<template>
  <VTooltip v-if="isLogged" :text="t('TASKS_TITLE')" location="bottom">
    <template #activator="{ props }">
      <VBadge
        :content="activeCount"
        :model-value="activeCount > 0"
        :max="99"
        color="primary"
        floating
      >
        <VBtn
          v-bind="props"
          icon="mdi-progress-clock"
          variant="text"
          :aria-label="t('TASKS_TITLE')"
          :aria-expanded="open"
          aria-controls="background-tasks-sidebar"
          @click="toggle"
        />
      </VBadge>
    </template>
  </VTooltip>
</template>
