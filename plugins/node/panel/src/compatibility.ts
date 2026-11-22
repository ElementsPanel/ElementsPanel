import { t } from "@elementspanel/epanel-plugin-i18n";

export const compatStatusText = (status: IPanelNodeCompatibilityPluginItem["status"]) =>
  ({
    ok: t("TXT_CODE_NODE_COMPAT_PLUGIN_MATCH"),
    mismatch: t("TXT_CODE_NODE_COMPAT_PLUGIN_DIFF"),
    panel_only: t("TXT_CODE_NODE_COMPAT_ONLY_PANEL"),
    daemon_only: t("TXT_CODE_NODE_COMPAT_ONLY_NODE"),
    missing_panel: t("TXT_CODE_NODE_COMPAT_MISSING_PANEL"),
    missing_daemon: t("TXT_CODE_NODE_COMPAT_MISSING_DAEMON")
  })[status];

export const compatStatusClass = (status: IPanelNodeCompatibilityPluginItem["status"]) =>
  status === "ok"
    ? "color-success"
    : status === "mismatch" || status.startsWith("missing_")
    ? "color-danger"
    : "";
