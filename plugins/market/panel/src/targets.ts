import { t } from "@elementspanel/epanel-plugin-i18n";
import type { MarketNode } from "./api";

export interface MarketTargetOption extends MarketNode {
  disabled?: boolean;
  hint?: string;
  installedVersion?: string;
}

export function marketTargetLabel(target: MarketNode) {
  if (!target.daemonId) return t("TXT_CODE_PLUGIN_MARKET_CURRENT_PANEL");
  const address = target.port ? `${target.ip}:${target.port}` : target.ip;
  return `${target.remarks || target.ip}（${address}）`;
}

export function defaultMarketTargets(targets: MarketTargetOption[], daemonId?: string) {
  return targets
    .filter(
      (target) => !target.disabled && (daemonId === undefined || target.daemonId === daemonId)
    )
    .map((target) => target.daemonId);
}
