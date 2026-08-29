import fs from "fs-extra";
import path from "path";
import type { PanelPluginContext } from "../../../../../src/app/plugins";
import MarketSettings from "../entity/market_settings";

const CATEGORY = "MarketSettings";
const ID = "config";

// The panel used to keep these two fields in its own SystemConfig. That file is
// written by the core's file-backed storage, so the one-time migration reads it
// directly rather than going through the (possibly Redis-backed) entity store.
const LEGACY_CONFIG_FILE = path.join(process.cwd(), "data", "SystemConfig", "config.json");

/** Market sources older than v2 no longer resolve; upgrade them on migration. */
const LEGACY_SOURCE_ADDRESSES = [
  "https://script.mcsmanager.com/templates.json",
  "https://script.mcsmanager.com/market.json"
];

let context: PanelPluginContext | undefined;
let settings = new MarketSettings();

export function setPluginContext(value: PanelPluginContext) {
  context = value;
}

function core(): PanelPluginContext {
  if (!context) throw new Error("The market plugin has not been initialized yet.");
  return context;
}

function migrateFromSystemConfig(): boolean {
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
    core().logger.warn(`Failed to migrate market settings from SystemConfig: ${error}`);
    return false;
  }
}

export async function initMarketSettings() {
  const stored = (await core().storage.getStorage().load(CATEGORY, MarketSettings, ID)) as
    | MarketSettings
    | null;
  if (stored) {
    settings = stored;
    return;
  }
  settings = new MarketSettings();
  if (migrateFromSystemConfig()) {
    core().logger.info("Migrated market settings from the panel configuration.");
  }
  if (LEGACY_SOURCE_ADDRESSES.includes(settings.presetPackAddr)) {
    const upgraded = new MarketSettings().presetPackAddr;
    core().logger.warn(
      `Upgrading market source address from ${settings.presetPackAddr} to ${upgraded}`
    );
    settings.presetPackAddr = upgraded;
  }
  await saveMarketSettings();
}

export function marketSettings(): MarketSettings {
  return settings;
}

export async function saveMarketSettings() {
  await core().storage.getStorage().store(CATEGORY, ID, settings);
}
