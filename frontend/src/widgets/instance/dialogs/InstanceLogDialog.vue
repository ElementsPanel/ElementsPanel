<script setup lang="ts">
import { getInstanceOperationLog } from "@/services/apis/operationLog";
import { t } from "@/lang/i18n";
import type { OperationLoggerItem } from "@/types/operationLog";
import {
  FileTextOutlined,
  LoadingOutlined
} from "@ant-design/icons-vue";
import { message } from "ant-design-vue";
import dayjs from "dayjs";
import { computed, ref } from "vue";

// ==================== Props ====================
const props = defineProps<{
  instanceId: string;
  daemonId: string;
  instanceName?: string;
}>();

// ==================== State ====================
const open = ref(false);
const loading = ref(false);
const logs = ref<OperationLoggerItem[]>([]);

// ==================== Log Text Rendering ====================

type TextRenderResult = {
  text: string;
  data: string[];
};

type OperationRenderer = {
  [K in OperationLoggerItem["type"]]: (
    item: Extract<OperationLoggerItem, { type: K }>
  ) => TextRenderResult;
};

const renderMap: OperationRenderer = {
  instance_start: (item) => ({
    text: t("TXT_CODE_e4605c4"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_stop: (item) => ({
    text: t("TXT_CODE_48c286cc"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_restart: (item) => ({
    text: t("TXT_CODE_fa7002ef"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_auto_restart: (item) => ({
    text: t("TXT_CODE_c29e18f4"),
    data: [item.instance_name || item.instance_id]
  }),
  instance_update: (item) => ({
    text: t("TXT_CODE_e1454ba7"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_kill: (item) => ({
    text: t("TXT_CODE_ee54440"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_crash: (item) => ({
    text: t("TXT_CODE_86c4b2f5"),
    data: [item.instance_name || item.instance_id, String(item.exit_code)]
  }),
  instance_config_change: (item) => ({
    text: t("TXT_CODE_30fcc19a"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_create: (item) => ({
    text: t("TXT_CODE_9ab6fd"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_delete: (item) => ({
    text: t("TXT_CODE_61b6facb"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_file_upload: (item) => ({
    text: t("TXT_CODE_58e4a9bd"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id, item.file || ""]
  }),
  instance_file_update: (item) => ({
    text: t("TXT_CODE_c5687e56"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id, item.file]
  }),
  instance_file_download: (item) => ({
    text: t("TXT_CODE_6f43f95f"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id, item.file]
  }),
  instance_file_delete: (item) => ({
    text: t("TXT_CODE_de567e84"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id, item.file]
  }),
  instance_task_create: (item) => ({
    text: t("TXT_CODE_5ddb00f2"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id, item.task_name]
  }),
  instance_task_delete: (item) => ({
    text: t("TXT_CODE_41f86ac"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id, item.task_name]
  }),
  daemon_create: (item) => ({
    text: t("TXT_CODE_f7969e5a"),
    data: [item.operator_name || item.operation_id, item.daemon_id]
  }),
  daemon_remove: (item) => ({
    text: t("TXT_CODE_384d278f"),
    data: [item.operator_name || item.operation_id, item.daemon_id]
  }),
  daemon_config_change: (item) => ({
    text: t("TXT_CODE_b6ac7af4"),
    data: [item.operator_name || item.operation_id, item.daemon_id]
  }),
  user_create: (item) => ({
    text: t("TXT_CODE_faa1962b"),
    data: [item.operator_name || item.operation_id, item.target_user_name]
  }),
  user_delete: (item) => ({
    text: t("TXT_CODE_cd76bc9"),
    data: [item.operator_name || item.operation_id, item.target_user_name]
  }),
  user_config_change: (item) => ({
    text: t("TXT_CODE_5564bc4c"),
    data: [item.operator_name || item.operation_id]
  }),
  user_login: (item) => ({
    text: t("TXT_CODE_31a48870") + ` (${item.operator_ip})`,
    data: [item.operator_name || item.operation_id, item.login_result ? t("TXT_CODE_43fcaf94") : t("TXT_CODE_56c686f8")]
  }),
  system_config_change: (item) => ({
    text: t("TXT_CODE_d6312bd5"),
    data: [item.operator_name || item.operation_id]
  })
};

const levelColors: Record<string, string> = {
  info: "blue",
  warning: "orange",
  error: "red",
  unknown: "gray"
};

const getColorByLevel = (level: OperationLoggerItem["operation_level"]) => {
  return levelColors[level] ?? levelColors.unknown;
};

const generateTextByItem = (item: OperationLoggerItem) => {
  const handler = renderMap[item.type];
  if (!handler) return t("TXT_CODE_43df9305");
  const { text, data } = handler(item as any);
  let i = 0;
  return text.replace(/\<\<\s*[\w_]+\s*\>\>/g, () => data[i++] ?? "--");
};

// ==================== Computed ====================
const formattedLogs = computed(() => {
  return logs.value.map((item) => ({
    ...item,
    color: getColorByLevel(item.operation_level),
    text: generateTextByItem(item)
  }));
});

const title = computed(() => {
  return `${t("TXT_CODE_f6a33629")}`;
});

// ==================== Methods ====================
const fetchLogs = async () => {
  loading.value = true;
  try {
    const { execute } = getInstanceOperationLog();
    const data = await execute({
      params: {
        daemonId: props.daemonId,
        instanceId: props.instanceId,
        limit: 100
      }
    });
    logs.value = (data.value || []).reverse();
  } catch (err: any) {
    message.error(err?.message || t("TXT_CODE_4a689666"));
    logs.value = [];
  } finally {
    loading.value = false;
  }
};

const openDialog = () => {
  open.value = true;
  fetchLogs();
};

const handleClose = () => {
  open.value = false;
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    centered
    :mask-closable="true"
    :width="680"
    :title="title"
    :footer="null"
    @cancel="handleClose"
  >
    <div class="instance-log-container">
      <!-- Loading -->
      <div v-if="loading" class="log-loading">
        <LoadingOutlined spin />
        <span class="ml-8">{{ t("TXT_CODE_73102f2b") }}</span>
      </div>

      <!-- Empty -->
      <div v-else-if="formattedLogs.length === 0" class="empty-state">
        <FileTextOutlined class="empty-icon" />
        <div class="empty-text">{{ t("TXT_CODE_54469e02") }}</div>
      </div>

      <!-- Timeline -->
      <div v-else class="log-timeline">
        <a-timeline>
          <a-timeline-item v-for="(item, index) in formattedLogs" :key="index" :color="item.color">
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
  </a-modal>
</template>

<style lang="scss" scoped>
.instance-log-container {
  min-height: 200px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 4px 0;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background-color: var(--color-gray-5);
    border-radius: 3px;

    &:hover {
      background-color: var(--color-gray-7);
    }
  }
}

.log-loading {
  display: flex;
  align-items: center;
  justify-content: center;
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

  .empty-icon {
    font-size: 48px;
    color: var(--color-gray-5);
    margin-bottom: 16px;
    opacity: 0.5;
  }

  .empty-text {
    font-size: 15px;
    color: var(--text-color);
    opacity: 0.55;
  }
}

.log-timeline {
  padding-top: 8px;
}

.log-item {
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--color-gray-2);
  border: 1px solid var(--color-gray-4);
  transition: all 0.2s ease;

  &:hover {
    background: var(--color-gray-3);
    border-color: var(--color-gray-5);
  }

  &:last-child {
    margin-bottom: 0;
  }
}

.log-content {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-color);
  margin-bottom: 4px;
  word-break: break-word;
}

.log-time {
  font-size: 12px;
  color: var(--color-gray-7);
  font-family: "Consolas", "Monaco", monospace;
  opacity: 0.8;
}
</style>
