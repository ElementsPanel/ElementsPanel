import { t } from "@elementspanel/epanel-plugin-i18n";
import type { NodeSummary } from "./api";

export const nodeLabel = (node: NodeSummary) =>
  `${node.remarks || `${node.ip}:${node.port}`}${
    node.available ? "" : ` (${t("TXT_CODE_PLUGIN_NODE_OFFLINE")})`
  }`;

const PLUGIN_NAME_PREFIX = "epanel-plugin-";
export const pluginLabel = (id?: string) => {
  if (!id) return "";
  const slash = id.indexOf("/");
  const name = id.startsWith("@") && slash >= 0 ? id.slice(slash + 1) : id;
  return name.startsWith(PLUGIN_NAME_PREFIX) ? name.slice(PLUGIN_NAME_PREFIX.length) : id;
};
