<script setup lang="ts">
import { t } from "@/lang/i18n";
import { FileTextOutlined, LoadingOutlined } from "@ant-design/icons-vue";
import dayjs from "dayjs";
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
      <LoadingOutlined spin />
      <span>{{ t("TXT_CODE_73102f2b") }}</span>
    </div>
    <div v-else-if="logs.length === 0" class="empty-state">
      <FileTextOutlined class="empty-icon" />
      <div class="empty-text">{{ t("TXT_CODE_54469e02") }}</div>
    </div>
    <div v-else class="log-timeline">
      <a-timeline>
        <a-timeline-item v-for="item in logs" :key="item.operation_id" :color="item.color">
          <div class="log-item">
            <div class="log-content">{{ item.text }}</div>
            <div class="log-time">
              {{ dayjs(Number(item.operation_time)).format("YYYY-MM-DD HH:mm:ss") }}
            </div>
          </div>
        </a-timeline-item>
      </a-timeline>
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
  color: var(--text-color);
  font-size: 14px;
  opacity: 0.65;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  text-align: center;
}

.empty-icon {
  margin-bottom: 16px;
  font-size: 48px;
  color: var(--color-gray-5);
  opacity: 0.5;
}

.empty-text {
  font-size: 15px;
  color: var(--text-color);
  opacity: 0.55;
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
