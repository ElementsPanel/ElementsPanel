// Market settings, owned by this plugin. They used to live in the panel's
// SystemConfig as `presetPackAddr` and `allowUsePreset`;
// `service/market_settings.ts` migrates them across once.

export default class MarketSettings {
  /** Package catalogue source: a URL, or `public/upload_files/<name>.json`. */
  presetPackAddr: string = "https://script.mcsmanager.com/market-v2.json";

  /** Whether a non-elevated user may install a package. */
  allowUsePreset: boolean = false;
}
