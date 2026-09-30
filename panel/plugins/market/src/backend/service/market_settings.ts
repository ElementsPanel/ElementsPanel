import fs from "fs-extra";
import path from "path";
import type { PanelPluginContext } from "../../../../../src/app/plugin";
import MarketSettings from "../entity/market_settings";

const CATEGORY = "PluginMarketSettings";
const ID = "config";

// Older panel versions stored plugin market settings in SystemConfig. That file is
// written by the core's file-backed storage, so the one-time migration reads it
// directly rather than going through the (possibly Redis-backed) entity store.
const LEGACY_CONFIG_FILE = path.join(process.cwd(), "data", "SystemConfig", "config.json");

let settings = new MarketSettings();

function migrateFromSystemConfig(ctx: PanelPluginContext): boolean {
  try {
    if (!fs.existsSync(LEGACY_CONFIG_FILE)) return false;
    const legacy = JSON.parse(fs.readFileSync(LEGACY_CONFIG_FILE, "utf8"));
    if (!legacy || typeof legacy !== "object") return false;
    let migrated = false;
    for (const key of Object.keys(settings) as Array<keyof MarketSettings>) {
      if (legacy[key] === undefined) continue;
      (settings as any)[key] = legacy[key];
      migrated = true;
    }
    return migrated;
  } catch (error) {
    ctx.logger.warn(`Failed to migrate market settings from SystemConfig: ${error}`);
    return false;
  }
}

export async function initMarketSettings(ctx: PanelPluginContext) {
  const stored = (await ctx.storage.getStorage().load(CATEGORY, MarketSettings, ID)) as
    | MarketSettings
    | null;
  if (stored) {
    settings = stored;
    return;
  }
  settings = new MarketSettings();
  const legacy = await ctx.storage.getStorage().load("MarketSettings", MarketSettings, ID);
  if (legacy) {
    for (const key of Object.keys(settings) as Array<keyof MarketSettings>) {
      if (legacy[key] !== undefined) (settings as any)[key] = legacy[key];
    }
  }
  if (!legacy && migrateFromSystemConfig(ctx)) {
    ctx.logger.info("Migrated market settings from the panel configuration.");
  }
  await saveMarketSettings(ctx);
}

export function marketSettings(): MarketSettings {
  return settings;
}

export async function saveMarketSettings(ctx: PanelPluginContext) {
  await ctx.storage.getStorage().store(CATEGORY, ID, settings);
}
