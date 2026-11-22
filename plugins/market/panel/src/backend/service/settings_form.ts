import type { PanelPluginContext } from "../types";
import { marketSettings, saveMarketSettings } from "./market_settings";
import MarketSettings from "../entity/market_settings";

export function registerMarketSettings(ctx: PanelPluginContext) {
  /** Validate the market base URL once when saving settings. Empty disables the market. */
  function normalizePluginMarketAddr(value: unknown): string {
    const raw = String(value).trim().replace(/\/+$/, "");
    if (!raw) return "";
    const invalid = () =>
      Object.assign(new Error(ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_ADDR_INVALID")), { status: 400 });
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw invalid();
    }
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      throw invalid();
    }
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  }

  async function writeMarketSettings(values: Record<string, unknown>) {
    const settings = marketSettings();
    // Validate only changed URLs so legacy values cannot block unrelated settings.
    if (values.pluginMarketAddr != null && values.pluginMarketAddr !== settings.pluginMarketAddr)
      settings.pluginMarketAddr = normalizePluginMarketAddr(values.pluginMarketAddr);
    await saveMarketSettings(ctx);
  }

  ctx.settingsForm.declare({
    defaults: () => ({ ...new MarketSettings() }),
    fields: () => [
      {
        key: "pluginMarketAddr",
        type: "string",
        title: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_ADDR"),
        description: ctx.i18n.$t("TXT_CODE_PLUGIN_MARKET_ADDR_DESC")
      }
    ],
    read: () => ({ ...marketSettings() }),
    write: writeMarketSettings
  });
}
