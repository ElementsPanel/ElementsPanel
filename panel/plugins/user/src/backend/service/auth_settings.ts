import fs from "fs-extra";
import path from "path";
import AuthSettings from "../entity/auth_settings";
import { logger, storage } from "../runtime";

const CATEGORY = "AuthSettings";
const ID = "config";

// The panel used to keep these fields in its own SystemConfig. That file is
// written by the core's file-backed storage, so the one-time migration reads it
// directly rather than going through the (possibly Redis-backed) entity store.
const LEGACY_CONFIG_FILE = path.join(process.cwd(), "data", "SystemConfig", "config.json");

let settings = new AuthSettings();

function migrateFromSystemConfig(): boolean {
  try {
    if (!fs.existsSync(LEGACY_CONFIG_FILE)) return false;
    const legacy = JSON.parse(fs.readFileSync(LEGACY_CONFIG_FILE, "utf8"));
    if (!legacy || typeof legacy !== "object") return false;
    let migrated = false;
    for (const key of Object.keys(settings) as Array<keyof AuthSettings>) {
      if (legacy[key] === undefined) continue;
      (settings as any)[key] = legacy[key];
      migrated = true;
    }
    return migrated;
  } catch (error) {
    logger().warn(`Failed to migrate authentication settings from SystemConfig: ${error}`);
    return false;
  }
}

export async function initAuthSettings() {
  const stored = (await storage().getStorage().load(CATEGORY, AuthSettings, ID)) as
    | AuthSettings
    | null;
  if (stored) {
    settings = stored;
    return;
  }
  settings = new AuthSettings();
  if (migrateFromSystemConfig()) {
    logger().info("Migrated authentication settings from the panel configuration.");
  }
  await saveAuthSettings();
}

export function authSettings(): AuthSettings {
  return settings;
}

export async function saveAuthSettings() {
  await storage().getStorage().store(CATEGORY, ID, settings);
}

/** Public shape for the login page: never exposes client secrets. */
export function publicSsoConfig() {
  if (!settings.ssoEnabled) return null;
  return {
    enabled: settings.ssoEnabled,
    onlyMode: settings.ssoOnlyMode,
    autoRedirect: settings.ssoAutoRedirect,
    providerName: settings.ssoProviderName,
    iconUrl: settings.ssoIconUrl
  };
}
