<script setup lang="ts">
import Empty from "@elementspanel/epanel-plugin-console/components/Empty";
import { t } from "@elementspanel/epanel-plugin-i18n";
import dayjs from "dayjs";
import {
  VProgressCircular,
  VTimeline,
  VTimelineItem
} from "vuetify/components";
import type { FormattedOperationLog } from "../hooks/useOperationLog";

withDefaults(
  defineProps<{
    loading: boolean;
    logs: FormattedOperationLog[];
    desktop?: boolean;
  }>(),
  { desktop: false }
);
</script>

<template>
  <div class="instance-log" :class="{ 'instance-log--desktop': desktop }">
    <div v-if="loading" class="log-loading">
      <VProgressCircular indeterminate />
      <span>{{ t("TXT_CODE_73102f2b") }}</span>
    </div>
    <Empty
      v-else-if="logs.length === 0"
      icon="mdi-file-document-outline"
      :title="t('TXT_CODE_54469e02')"
      compact
    />
    <div v-else class="log-timeline">
      <VTimeline density="compact" side="end" truncate-line="both">
        <VTimelineItem
          v-for="item in logs"
          :key="item.operation_id"
          :dot-color="item.color"
          size="small"
        >
          <div class="log-item">
            <div class="log-content">{{ item.text }}</div>
            <div class="log-time">
              {{ dayjs(Number(item.operation_time)).format("YYYY-MM-DD HH:mm:ss") }}
            </div>
          </div>
        </VTimelineItem>
      </VTimeline>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.instance-log {
  min-height: 200px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 4px 0;

  &--desktop {
    height: 100%;
    max-height: none;
    padding: 8px 12px;
  }
}

.log-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 0;

  span {
    color: var(--text-color);
    font-size: 14px;
    opacity: 0.65;
  }
}

.log-timeline {
  padding-top: 8px;
}

.log-item {
  margin-bottom: 8px;
  padding: 8px 12px;
  border: 1px solid var(--color-gray-4);
  border-radius: 6px;
  background: var(--color-gray-2);
}

.instance-log--desktop .log-item {
  border-color: var(--desktop-window-border);
  background: var(--desktop-window-titlebar-bg);
}

.log-content {
  margin-bottom: 4px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-color);
  word-break: break-word;
}

.instance-log--desktop .log-content {
  color: var(--desktop-window-text);
}

.log-time {
  font-family: "Consolas", "Monaco", monospace;
  font-size: 12px;
  color: var(--color-gray-7);
  opacity: 0.8;
}
</style>
