import { t } from "@elementspanel/epanel-plugin-i18n";
import type { OperationLoggerItem } from "@elementspanel/epanel-plugin-console/types/operationLog";
import { computed, ref } from "vue";
import { getOperationLog } from "../api";

type TextRenderResult = {
  text: string;
  data: string[];
};

export type FormattedOperationLog = OperationLoggerItem & {
  color: string;
  text: string;
};

type OperationRenderer = {
  [K in OperationLoggerItem["type"]]: (
    // eslint-disable-next-line no-unused-vars
    item: Extract<OperationLoggerItem, { type: K }>
  ) => TextRenderResult;
};

const levelColors: Record<string, string> = {
  info: "blue",
  warning: "orange",
  error: "red",
  unknown: "gray"
};

const renderMap: OperationRenderer = {
  instance_start: (item) => ({
    text: t("TXT_CODE_COMMON_USER_STARTED_THE_INSTANCE"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_stop: (item) => ({
    text: t("TXT_CODE_COMMON_USER_STOPPED_THE_INSTANCE"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_restart: (item) => ({
    text: t("TXT_CODE_COMMON_USER_RESTARTED_THE_INSTANCE"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_auto_restart: (item) => ({
    text: t("TXT_CODE_COMMON_INSTANCE_CRASHED_AND_AUTOMATICALLY_RESTARTED"),
    data: [item.instance_name || item.instance_id]
  }),
  instance_update: (item) => ({
    text: t("TXT_CODE_COMMON_USER_UPDATED_THE_INSTANCE"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_kill: (item) => ({
    text: t("TXT_CODE_COMMON_USER_FORCE_TERMINATED_THE_INSTANCE"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_crash: (item) => ({
    text: t("TXT_CODE_COMMON_INSTANCE_CRASHED_UNEXPECTEDLY_EXIT_CODE"),
    data: [item.instance_name || item.instance_id, String(item.exit_code)]
  }),
  instance_config_change: (item) => ({
    text: t("TXT_CODE_COMMON_USER_MODIFIED_THE_CONFIGURATION_OF_THE_INSTANCE"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_create: (item) => ({
    text: t("TXT_CODE_COMMON_USER_CREATED_THE_INSTANCE"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_delete: (item) => ({
    text: t("TXT_CODE_COMMON_USER_DELETED_THE_INSTANCE"),
    data: [item.operator_name || item.operation_id, item.instance_name || item.instance_id]
  }),
  instance_file_upload: (item) => ({
    text: t("TXT_CODE_COMMON_USER_UPLOADED_THE_FILE_TO_THE_INSTANCE"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.file || ""
    ]
  }),
  instance_file_update: (item) => ({
    text: t("TXT_CODE_COMMON_USER_UPDATED_THE_FILE_OF_THE_INSTANCE"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.file
    ]
  }),
  instance_file_download: (item) => ({
    text: t("TXT_CODE_COMMON_USER_DOWNLOADED_THE_FILE_OF_THE_INSTANCE"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.file
    ]
  }),
  instance_file_delete: (item) => ({
    text: t("TXT_CODE_COMMON_USER_DELETED_THE_FILE_OF_THE_INSTANCE"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.file
    ]
  }),
  instance_task_create: (item) => ({
    text: t("TXT_CODE_COMMON_USER_CREATED_THE_TASK_FOR_THE_INSTANCE"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.task_name
    ]
  }),
  instance_task_delete: (item) => ({
    text: t("TXT_CODE_COMMON_USER_DELETED_THE_TASK_OF_THE_INSTANCE"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.task_name
    ]
  }),
  daemon_create: (item) => ({
    text: t("TXT_CODE_COMMON_USER_CREATED_THE_DAEMON_PROCESS"),
    data: [item.operator_name || item.operation_id, item.daemon_id]
  }),
  daemon_remove: (item) => ({
    text: t("TXT_CODE_COMMON_USER_DELETED_THE_DAEMON_PROCESS"),
    data: [item.operator_name || item.operation_id, item.daemon_id]
  }),
  daemon_config_change: (item) => ({
    text: t("TXT_CODE_COMMON_USER_MODIFIED_THE_CONFIGURATION_OF_THE_DAEMON_PROCESS"),
    data: [item.operator_name || item.operation_id, item.daemon_id]
  }),
  user_create: (item) => ({
    text: t("TXT_CODE_COMMON_USER_CREATED_THE_USER"),
    data: [item.operator_name || item.operation_id, item.target_user_name]
  }),
  user_delete: (item) => ({
    text: t("TXT_CODE_COMMON_USER_DELETED_THE_USER"),
    data: [item.operator_name || item.operation_id, item.target_user_name]
  }),
  user_config_change: (item) => ({
    text: t("TXT_CODE_COMMON_USER_MODIFIED_THE_USER_CONFIGURATION"),
    data: [item.operator_name || item.operation_id]
  }),
  user_login: (item) => ({
    text: t("TXT_CODE_COMMON_USER_ATTEMPTED_LOGIN_RESULT") + ` (${item.operator_ip})`,
    data: [
      item.operator_name || item.operation_id,
      item.login_result ? t("TXT_CODE_COMMON_SUCCESS") : t("TXT_CODE_COMMON_FAILED")
    ]
  }),
  system_config_change: (item) => ({
    text: t("TXT_CODE_COMMON_USER_MODIFIED_THE_SYSTEM_CONFIGURATION"),
    data: [item.operator_name || item.operation_id]
  })
};

export const useOperationLog = () => {
  const logs = ref<OperationLoggerItem[]>([]);

  const fetchData = async () => {
    const { execute } = getOperationLog();
    const data = await execute();
    logs.value = data.value?.reverse() || [];
  };

  const generateTextByItem = formatOperationLogText;

  const getColorByLevel = (level: OperationLoggerItem["operation_level"]) => {
    return levelColors[level] ?? levelColors.unknown;
  };

  const formattedLogs = computed(() => logs.value.map(formatOperationLogItem));

  return { fetchData, logs, getColorByLevel, generateTextByItem, formattedLogs };
};

export const formatOperationLogText = (item: OperationLoggerItem) => {
  const handler = renderMap[item.type];
  if (!handler) return t("TXT_CODE_COMMON_UNKNOWN_OPERATION");
  const { text } = handler(item as any);
  const values: Record<string, string> = {
    operator_name: item.operator_name || item.operation_id,
    instance_name: "instance_id" in item ? item.instance_name || item.instance_id : "",
    file: "file" in item ? item.file || "" : "",
    task_name: "task_name" in item ? item.task_name : "",
    exit_code: "exit_code" in item ? String(item.exit_code) : "",
    daemon_id: "daemon_id" in item ? item.daemon_id : "",
    target_user_name: "target_user_name" in item ? item.target_user_name : "",
    login_result:
      "login_result" in item
        ? item.login_result
          ? t("TXT_CODE_COMMON_SUCCESS")
          : t("TXT_CODE_COMMON_FAILED")
        : ""
  };
  return text.replace(/\<\<\s*([\w_]+)\s*\>\>/g, (_match, name: string) => {
    return values[name] || "--";
  });
};

export const getOperationLogColor = (level: OperationLoggerItem["operation_level"]) => {
  return levelColors[level] ?? levelColors.unknown;
};

export const formatOperationLogItem = (item: OperationLoggerItem): FormattedOperationLog => ({
  ...item,
  color: getOperationLogColor(item.operation_level),
  text: formatOperationLogText(item)
});
