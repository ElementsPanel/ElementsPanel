import { computed, ref } from "vue";
import { t } from "@/lang/i18n";
import type { OperationLoggerItem } from "@/types/operationLog";
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
    // This variable is actually used internally. Fix the plugin's false positive error.
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
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.file || ""
    ]
  }),
  instance_file_update: (item) => ({
    text: t("TXT_CODE_c5687e56"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.file
    ]
  }),
  instance_file_download: (item) => ({
    text: t("TXT_CODE_6f43f95f"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.file
    ]
  }),
  instance_file_delete: (item) => ({
    text: t("TXT_CODE_de567e84"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.file
    ]
  }),
  instance_task_create: (item) => ({
    text: t("TXT_CODE_5ddb00f2"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.task_name
    ]
  }),
  instance_task_delete: (item) => ({
    text: t("TXT_CODE_41f86ac"),
    data: [
      item.operator_name || item.operation_id,
      item.instance_name || item.instance_id,
      item.task_name
    ]
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
    data: [
      item.operator_name || item.operation_id,
      item.login_result ? t("TXT_CODE_43fcaf94") : t("TXT_CODE_56c686f8")
    ]
  }),
  system_config_change: (item) => ({
    text: t("TXT_CODE_d6312bd5"),
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
  if (!handler) return t("TXT_CODE_43df9305");
  const { text } = handler(item as any);
  const values: Record<string, string> = {
    operator_name: item.operator_name || item.operation_id,
    instance_name: "instance_name" in item ? item.instance_name || item.instance_id : "",
    file: "file" in item ? item.file || "" : "",
    task_name: "task_name" in item ? item.task_name : "",
    exit_code: "exit_code" in item ? String(item.exit_code) : "",
    daemon_id: "daemon_id" in item ? item.daemon_id : "",
    target_user_name: "target_user_name" in item ? item.target_user_name : "",
    login_result:
      "login_result" in item
        ? item.login_result
          ? t("TXT_CODE_43fcaf94")
          : t("TXT_CODE_56c686f8")
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
