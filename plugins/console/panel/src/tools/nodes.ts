import { t } from "@elementspanel/epanel-plugin-i18n";

export function computeNodeName(ip: string, available: boolean, remark?: string) {
  if (!ip) return t("TXT_CODE_COMMON_PLEASE_SELECT_A_DAEMON");
  const online = available ? "" : t("TXT_CODE_NODE_OFFLINE_SUFFIX");
  return remark ? `${remark} - ${ip} ${online}` : `${ip} ${online}`;
}
